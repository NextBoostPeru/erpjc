<?php
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Disable error display in output
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

// Enable error logging
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/php_error.log');

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
rbac_require($conn, $userData, 'reportes_ventas', $method);

$action = $_GET['action'] ?? '';
$startDate = $_GET['start_date'] ?? date('Y-m-01');
$endDate = $_GET['end_date'] ?? date('Y-m-d');

function getSalesByPeriod($conn, $start, $end) {
    $sql = "SELECT DATE(fecha_emision) as fecha, SUM(total_importe) as total 
            FROM comprobantes_electronicos 
            WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'
            GROUP BY DATE(fecha_emision) 
            ORDER BY fecha_emision";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':start' => $start, ':end' => $end]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getSalesByClient($conn, $start, $end) {
    $sql = "SELECT cliente_razon_social, SUM(total_importe) as total, COUNT(*) as cantidad
            FROM comprobantes_electronicos 
            WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'
            GROUP BY cliente_razon_social 
            ORDER BY total DESC LIMIT 10";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':start' => $start, ':end' => $end]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getSalesBySeller($conn, $start, $end) {
    $sql = "SELECT u.usuario as vendedor, SUM(c.total_importe) as total, COUNT(*) as cantidad
            FROM comprobantes_electronicos c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
            GROUP BY u.usuario 
            ORDER BY total DESC";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':start' => $start, ':end' => $end]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getSalesByProduct($conn, $start, $end) {
    // Joining detail with header
    $sql = "SELECT d.descripcion, SUM(d.cantidad) as cantidad, SUM(d.valor_venta) as total
            FROM comprobantes_electronicos_detalle d
            JOIN comprobantes_electronicos c ON d.comprobante_id = c.id
            WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
            GROUP BY d.descripcion 
            ORDER BY total DESC LIMIT 10";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':start' => $start, ':end' => $end]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getSalesByArea($conn, $start, $end) {
    $sql = "SELECT COALESCE(a.nombre, 'Sin Área') as area, SUM(c.total_importe) as total, COUNT(*) as cantidad
            FROM comprobantes_electronicos c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            LEFT JOIN areas a ON u.area_id = a.id
            WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
            GROUP BY a.nombre 
            ORDER BY total DESC";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':start' => $start, ':end' => $end]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getMargins($conn, $start, $end) {
    // Approximation: Sales - Cost (using current product cost)
    try {
        $sql = "SELECT 
                SUM(d.valor_venta) as ventas_netas,
                SUM(d.cantidad * COALESCE(p.costo_promedio, 0)) as costo_estimado
                FROM comprobantes_electronicos_detalle d
                JOIN comprobantes_electronicos c ON d.comprobante_id = c.id
                LEFT JOIN productos p ON d.item_codigo = p.codigo
                WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':start' => $start, ':end' => $end]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        // Fallback if error
        return ["ventas_netas" => 0, "costo_estimado" => 0, "error" => $e->getMessage()];
    }
}

function getIGVGenerated($conn, $start, $end) {
    $sql = "SELECT SUM(total_igv) as total_igv, SUM(total_gravada) as total_neto
            FROM comprobantes_electronicos 
            WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':start' => $start, ':end' => $end]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function getProjection($conn) {
    // Simple projection based on current month average
    $currentMonth = date('m');
    $currentYear = date('Y');
    $daysInMonth = date('t');
    $currentDay = date('j');
    
    $startDate = "$currentYear-$currentMonth-01";
    $endDate = date("Y-m-t");

    $sql = "SELECT SUM(total_importe) as total 
            FROM comprobantes_electronicos 
            WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':start' => $startDate, ':end' => $endDate]);
    $currentTotal = $stmt->fetchColumn() ?: 0;
    
    $dailyAverage = $currentDay > 0 ? $currentTotal / $currentDay : 0;
    $projectedTotal = $dailyAverage * $daysInMonth;
    
    return [
        "current_total" => $currentTotal,
        "daily_average" => round($dailyAverage, 2),
        "projected_total" => round($projectedTotal, 2)
    ];
}

try {
    switch ($action) {
        case 'dashboard':
            $response = [
                "sales_period" => getSalesByPeriod($conn, $startDate, $endDate),
                "sales_client" => getSalesByClient($conn, $startDate, $endDate),
                "sales_seller" => getSalesBySeller($conn, $startDate, $endDate),
                "sales_area" => getSalesByArea($conn, $startDate, $endDate),
                "sales_product" => getSalesByProduct($conn, $startDate, $endDate),
                "margins" => getMargins($conn, $startDate, $endDate),
                "igv" => getIGVGenerated($conn, $startDate, $endDate),
                "projection" => getProjection($conn)
            ];
            echo json_encode($response);
            break;
            
        default:
            echo json_encode(["message" => "Acción no válida"]);
            break;
    }
    $conn = null; // Close connection explicitly
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error en reporte: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
?>
