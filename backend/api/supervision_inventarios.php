<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    $userData = $jwtHandler->validateToken($token);
    if (!$userData) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    rbac_require($conn, $userData, 'supervision_inventarios', 'GET', 'lectura');

    $action = $_GET['action'] ?? 'dashboard';
    
    // 1. Dashboard Metrics
    if ($action === 'dashboard') {
        
        // A. Valorización Total del Inventario Actual
        $sqlVal = "SELECT SUM(stock * costo_promedio) as total_valorizado FROM productos WHERE stock > 0";
        $stmtVal = $conn->prepare($sqlVal);
        $stmtVal->execute();
        $valorizacion = $stmtVal->fetch(PDO::FETCH_ASSOC)['total_valorizado'] ?? 0;

        // B. Rotación de Inventario (Últimos 30 días)
        // Costo de Ventas / Inventario Promedio (Usamos Inventario Actual como proxy por simplicidad)
        $sqlCostoVentas = "SELECT SUM(k.cantidad * k.costo_unitario) as costo_ventas 
                           FROM kardex k
                           LEFT JOIN movimientos_detalles md ON k.movimiento_detalle_id = md.id
                           LEFT JOIN movimientos_inventario m ON md.movimiento_id = m.id
                           WHERE k.tipo_movimiento = 'salida'
                           AND m.motivo IN ('venta', 'consumo_interno')
                           AND k.fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
        $stmtCV = $conn->prepare($sqlCostoVentas);
        $stmtCV->execute();
        $costoVentas = $stmtCV->fetch(PDO::FETCH_ASSOC)['costo_ventas'] ?? 0;

        $rotacion = ($valorizacion > 0) ? ($costoVentas / $valorizacion) : 0;

        // C. Mermas (Últimos 30 días)
        $sqlMermas = "SELECT SUM(k.cantidad * k.costo_unitario) as total_mermas 
                      FROM kardex k
                      LEFT JOIN movimientos_detalles md ON k.movimiento_detalle_id = md.id
                      LEFT JOIN movimientos_inventario m ON md.movimiento_id = m.id
                      WHERE m.motivo = 'merma'
                      AND k.fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
        $stmtMerma = $conn->prepare($sqlMermas);
        $stmtMerma->execute();
        $mermas = $stmtMerma->fetch(PDO::FETCH_ASSOC)['total_mermas'] ?? 0;

        // D. Stock Crítico Count
        $sqlCritico = "SELECT COUNT(*) as count FROM productos WHERE stock <= stock_minimo AND stock_minimo > 0";
        $stmtCritico = $conn->prepare($sqlCritico);
        $stmtCritico->execute();
        $criticoCount = $stmtCritico->fetch(PDO::FETCH_ASSOC)['count'] ?? 0;

        // E. Vencimientos Próximos (Next 30 days) Count
        // Check if table exists first to avoid error if migration didn't run properly
        $vencimientosCount = 0;
        try {
            $sqlVenc = "SELECT COUNT(*) as count FROM inventario_lotes 
                        WHERE fecha_vencimiento <= DATE_ADD(NOW(), INTERVAL 30 DAY) 
                        AND fecha_vencimiento >= NOW()
                        AND cantidad_actual > 0";
            $stmtVenc = $conn->prepare($sqlVenc);
            $stmtVenc->execute();
            $vencimientosCount = $stmtVenc->fetch(PDO::FETCH_ASSOC)['count'] ?? 0;
        } catch (Exception $e) {
            // Table might not exist or empty
        }

        echo json_encode([
            'valorizacion' => (float)$valorizacion,
            'rotacion' => round((float)$rotacion, 2),
            'mermas' => (float)$mermas,
            'stock_critico' => (int)$criticoCount,
            'vencimientos' => (int)$vencimientosCount
        ]);
    }
    
    // 2. Stock Crítico List
    elseif ($action === 'stock_critico') {
        $sql = "SELECT p.nombre, p.codigo_interno, p.stock, p.stock_minimo, p.costo_promedio,
                       (p.stock * p.costo_promedio) as valor_actual
                FROM productos p 
                WHERE p.stock <= p.stock_minimo AND p.stock_minimo > 0
                ORDER BY (p.stock_minimo - p.stock) DESC
                LIMIT 50";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    // 3. Vencimientos List
    elseif ($action === 'vencimientos') {
        $sql = "SELECT l.numero_lote, l.fecha_vencimiento, l.cantidad_actual, p.nombre as producto, p.codigo_interno
                FROM inventario_lotes l
                JOIN productos p ON l.producto_id = p.id
                WHERE l.fecha_vencimiento <= DATE_ADD(NOW(), INTERVAL 60 DAY) -- Show next 60 days
                AND l.cantidad_actual > 0
                ORDER BY l.fecha_vencimiento ASC
                LIMIT 50";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    // 4. Mermas Details
    elseif ($action === 'mermas_detalle') {
        $sql = "SELECT k.fecha, p.nombre as producto, k.cantidad, k.costo_unitario, k.total_movimiento, m.observacion
                FROM kardex k
                JOIN productos p ON k.producto_id = p.id
                LEFT JOIN movimientos_detalles md ON k.movimiento_detalle_id = md.id
                LEFT JOIN movimientos_inventario m ON md.movimiento_id = m.id
                WHERE m.motivo = 'merma'
                ORDER BY k.fecha DESC
                LIMIT 50";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
