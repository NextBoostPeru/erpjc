<?php
require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
function rbac_require_any(PDO $conn, $userData, array $moduleCodes, string $method, ?string $perm = null): array {
    rbac_ensure_roles_modulos_schema($conn);
    [$userId, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
    $required = $perm ?? rbac_required_perm_for_request($method);

    foreach ($moduleCodes as $code) {
        if (rbac_can($conn, (int)$rolId, (string)$rolNombre, (string)$code, $required)) {
            return [$userId, $rolId, $rolNombre, $required, $code];
        }
    }

    http_response_code(403);
    echo json_encode([
        "message" => "No tienes permiso para esta acción",
        "forbidden" => true,
        "modulo" => $moduleCodes[0] ?? '',
        "modulos" => $moduleCodes,
        "permiso" => $required
    ]);
    if (isset($conn)) $conn = null;
    exit;
}

rbac_require_any($conn, $userData, ['dashboard_contabilidad', 'dashboard'], $method);

require_once 'helpers/SimpleCache.php';

try {
    $cache = new SimpleCache();
    $cacheKey = 'dashboard_contabilidad_stats_' . date('Y-m-d_H'); // Cache per hour/partial? Let's use 5 mins like others.

    $stats = $cache->get($cacheKey, function() use ($conn) {
        $stats = [];
        $currentMonth = date('m');
        $currentYear = date('Y');
        $startDate = "$currentYear-$currentMonth-01";
        $endDate = date("Y-m-t", strtotime($startDate));

        // 1. Ventas del Mes
        $stmt = $conn->prepare("
            SELECT 
                SUM(CASE WHEN moneda = 'USD' THEN total_importe * 3.75 ELSE total_importe END) as total,
                SUM(CASE WHEN moneda = 'USD' THEN total_igv * 3.75 ELSE total_igv END) as igv
            FROM comprobantes_electronicos 
            WHERE fecha_emision BETWEEN ? AND ? 
            AND estado != 'Anulado'
        ");
        $stmt->execute([$startDate, $endDate]);
        $ventas = $stmt->fetch(PDO::FETCH_ASSOC);
        $stats['ventas_mes'] = $ventas['total'] ?: 0;
        $stats['igv_ventas'] = $ventas['igv'] ?: 0;

        // 2. Compras del Mes
        $stmt = $conn->prepare("
            SELECT 
                SUM(CASE WHEN moneda = 'USD' THEN importe_total * 3.75 ELSE importe_total END) as total,
                SUM(CASE WHEN moneda = 'USD' THEN (igv_gravado + igv_mixto + igv_no_gravado) * 3.75 ELSE (igv_gravado + igv_mixto + igv_no_gravado) END) as igv
            FROM comprobantes_compra 
            WHERE fecha_emision BETWEEN ? AND ? 
            AND estado != 'Anulado'
        ");
        $stmt->execute([$startDate, $endDate]);
        $compras = $stmt->fetch(PDO::FETCH_ASSOC);
        $stats['compras_mes'] = $compras['total'] ?: 0;
        $stats['igv_compras'] = $compras['igv'] ?: 0;

        // 3. Cuentas por Cobrar (Saldo total pendiente)
        $stmt = $conn->query("SELECT SUM(saldo_pendiente) FROM comprobantes_electronicos WHERE estado != 'Anulado' AND saldo_pendiente > 0");
        $stats['cuentas_por_cobrar'] = $stmt->fetchColumn() ?: 0;

        // 4. Cuentas por Pagar (Saldo total pendiente)
        $stmt = $conn->query("SELECT SUM(saldo_pendiente) FROM comprobantes_compra WHERE estado != 'Anulado' AND saldo_pendiente > 0");
        $stats['cuentas_por_pagar'] = $stmt->fetchColumn() ?: 0;

        // 5. Estimación IGV a Pagar (IGV Ventas - IGV Compras)
        $stats['igv_por_pagar'] = max(0, $stats['igv_ventas'] - $stats['igv_compras']);

        // 6. Últimos Asientos Contables
        try {
            $stmt = $conn->query("
                SELECT id, fecha, glosa, 
                       (SELECT SUM(debe) FROM asientos_detalle WHERE asiento_id = asientos.id) as total_debe,
                       (SELECT SUM(haber) FROM asientos_detalle WHERE asiento_id = asientos.id) as total_haber
                FROM asientos
                ORDER BY fecha DESC, id DESC
                LIMIT 5
            ");
            $stats['ultimos_asientos'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            $stats['ultimos_asientos'] = [];
        }

        // 7. Evolución Semestral (Ventas vs Compras)
        $stats['evolucion'] = [];
        
        // Calculate date range for the last 6 months
        $startRange = date('Y-m-01', strtotime("-5 months"));
        $endRange = date('Y-m-t'); // End of current month

        // Optimized Sales Query
        $sqlV = "SELECT DATE_FORMAT(fecha_emision, '%Y-%m') as periodo, 
                 SUM(CASE WHEN moneda = 'USD' THEN total_importe * 3.75 ELSE total_importe END) as total 
                 FROM comprobantes_electronicos 
                 WHERE fecha_emision BETWEEN ? AND ? AND estado != 'Anulado'
                 GROUP BY DATE_FORMAT(fecha_emision, '%Y-%m')";
        $stmtV = $conn->prepare($sqlV);
        $stmtV->execute([$startRange, $endRange]);
        $ventasMap = $stmtV->fetchAll(PDO::FETCH_KEY_PAIR); // periodo => total

        // Optimized Purchases Query
        $sqlC = "SELECT DATE_FORMAT(fecha_emision, '%Y-%m') as periodo, 
                 SUM(CASE WHEN moneda = 'USD' THEN importe_total * 3.75 ELSE importe_total END) as total 
                 FROM comprobantes_compra 
                 WHERE fecha_emision BETWEEN ? AND ? AND estado != 'Anulado'
                 GROUP BY DATE_FORMAT(fecha_emision, '%Y-%m')";
        $stmtC = $conn->prepare($sqlC);
        $stmtC->execute([$startRange, $endRange]);
        $comprasMap = $stmtC->fetchAll(PDO::FETCH_KEY_PAIR); // periodo => total

        // Build result array ensuring all 6 months are present
        for ($i = 5; $i >= 0; $i--) {
            $periodo = date('Y-m', strtotime("-$i months"));
            $stats['evolucion'][] = [
                'periodo' => $periodo,
                'ventas' => isset($ventasMap[$periodo]) ? (float)$ventasMap[$periodo] : 0,
                'compras' => isset($comprasMap[$periodo]) ? (float)$comprasMap[$periodo] : 0
            ];
        }

        return $stats;
    }, 300); // 5 min cache
    
    $conn = null;
    echo json_encode($stats);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error al cargar dashboard Contabilidad: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
