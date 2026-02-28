<?php
include_once '../config/db.php';
require_once '../config/jwt.php';

header("Content-Type: application/json; charset=UTF-8");

$jwt = new JWTHandler();
$headers = apache_request_headers();
$authHeader = $headers['Authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = str_replace('Bearer ', '', $authHeader);
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}

$usuario_id = $userData->id;

require_once 'helpers/SimpleCache.php';

try {
    // Auto-fix: Ensure usuario_id column exists
    try {
        $checkCol = $conn->query("SHOW COLUMNS FROM comprobantes_electronicos LIKE 'usuario_id'");
        if ($checkCol->rowCount() == 0) {
            $conn->exec("ALTER TABLE comprobantes_electronicos ADD COLUMN usuario_id INT(11) NULL AFTER id");
        }
    } catch (Exception $e) {
        // Ignore error if column creation fails (might exist or permissions)
        // But log it to response if needed for debug
    }

    $cache = new SimpleCache();
    $cacheKey = 'dashboard_vendedor_' . $usuario_id . '_' . date('Y-m-d_H');

    $stats = $cache->get($cacheKey, function() use ($conn, $usuario_id) {
        $stats = [];
        $mesActual = date('m');
        $anioActual = date('Y');
        $hoy = date('Y-m-d');

        // 1. Ventas del Mes (Personales)
        $startDate = "$anioActual-$mesActual-01";
        $endDate = date("Y-m-t", strtotime($startDate));
        
        $sql = "SELECT COALESCE(SUM(total_importe), 0) FROM comprobantes_electronicos WHERE fecha_emision BETWEEN ? AND ? AND usuario_id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$startDate, $endDate, $usuario_id]);
        $stats['ventas_mes'] = $stmt->fetchColumn();

        // 2. Ventas Hoy
        $stmt = $conn->prepare("SELECT COALESCE(SUM(total_importe), 0) FROM comprobantes_electronicos WHERE fecha_emision = ? AND usuario_id = ?");
        $stmt->execute([$hoy, $usuario_id]);
        $stats['ventas_hoy'] = $stmt->fetchColumn();

        // 3. Cantidad de Ventas Mes
        $stmt = $conn->prepare("SELECT COUNT(*) FROM comprobantes_electronicos WHERE fecha_emision BETWEEN ? AND ? AND usuario_id = ?");
        $stmt->execute([$startDate, $endDate, $usuario_id]);
        $stats['cantidad_ventas'] = $stmt->fetchColumn();

        // 4. Últimas 5 Ventas
        // Usamos cliente_razon_social directamente de comprobantes
        $stmt = $conn->prepare("
            SELECT c.id, c.serie, c.correlativo, c.fecha_emision, c.total_importe, c.cliente_razon_social as cliente_nombre
            FROM comprobantes_electronicos c
            WHERE c.usuario_id = ? 
            ORDER BY c.fecha_emision DESC, c.id DESC 
            LIMIT 5
        ");
        $stmt->execute([$usuario_id]);
        $stats['ultimas_ventas'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 5. Gráfico Ventas últimos 6 meses - Optimizado
        $grafico = [];
        $startChart = date('Y-m-01', strtotime("-5 months"));
        $endChart = date('Y-m-t');

        $sqlChart = "SELECT DATE_FORMAT(fecha_emision, '%Y-%m') as mes_anio, 
                     COALESCE(SUM(total_importe), 0) as total 
                     FROM comprobantes_electronicos 
                     WHERE fecha_emision BETWEEN ? AND ? AND usuario_id = ?
                     GROUP BY DATE_FORMAT(fecha_emision, '%Y-%m')";
        
        $stmtChart = $conn->prepare($sqlChart);
        $stmtChart->execute([$startChart, $endChart, $usuario_id]);
        $chartData = $stmtChart->fetchAll(PDO::FETCH_KEY_PAIR);

        for ($i = 5; $i >= 0; $i--) {
            $fechaBase = strtotime("-$i month");
            $key = date('Y-m', $fechaBase);
            $nombreMes = date('M', $fechaBase);
            
            $grafico[] = [
                'mes' => $nombreMes, 
                'ventas' => isset($chartData[$key]) ? (float)$chartData[$key] : 0
            ];
        }
        $stats['grafico_ventas'] = $grafico;
        
        // Meta (Simulada)
        $meta = 10000; 
        $stats['meta_mes'] = $meta;
        $stats['porcentaje_meta'] = $stats['ventas_mes'] > 0 ? ($stats['ventas_mes'] / $meta) * 100 : 0;

        return $stats;
    }, 300); // 5 mins cache

    $conn = null;
    echo json_encode($stats);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error al cargar dashboard vendedor: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
?>