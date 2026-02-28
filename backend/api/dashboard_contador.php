<?php
require_once '../config/db.php';
require_once '../config/jwt.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$jwt = new JWTHandler();
$headers = getallheaders();
$authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';
$token = str_replace('Bearer ', '', $authHeader);
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}

require_once 'helpers/SimpleCache.php';

try {
    $cache = new SimpleCache();
    $cacheKey = 'dashboard_contador_stats_' . date('Y-m-d_H'); // Cache hourly
    
    $stats = $cache->get($cacheKey, function() use ($conn, $userData) {
        $stats = [];
        $anio = date('Y');
        $mes = date('m');
        
        $startDate = "$anio-$mes-01";
        $endDate = date("Y-m-t", strtotime($startDate));

        // 1. Periodo Contable Actual
        $stmt = $conn->prepare("SELECT * FROM periodos_contables WHERE anio = :anio AND mes = :mes");
        $stmt->execute([':anio' => $anio, ':mes' => $mes]);
        $periodo = $stmt->fetch(PDO::FETCH_ASSOC);
        $stats['periodo_actual'] = $periodo ? $periodo['estado'] : 'No Definido';
        $stats['periodo_nombre'] = $periodo ? $periodo['nombre'] : date('F');

        // 2. Ingresos del Mes (Ventas Reales + Asientos Contables Ingresos)
        // Prioridad: Comprobantes Electrónicos (Ventas Operativas)
        $stmt = $conn->prepare("
            SELECT IFNULL(SUM(total_importe), 0) 
            FROM comprobantes_electronicos 
            WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'
        ");
        $stmt->execute([':start' => $startDate, ':end' => $endDate]);
        $ventas_operativas = $stmt->fetchColumn();
        $stats['ingresos_mes'] = floatval($ventas_operativas);

        // 3. Gastos del Mes (Compras Reales)
        // Prioridad: Comprobantes de Compra (Compras Operativas)
        $stmt = $conn->prepare("
            SELECT IFNULL(SUM(importe_total), 0) 
            FROM comprobantes_compra 
            WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'
        ");
        $stmt->execute([':start' => $startDate, ':end' => $endDate]);
        $compras_operativas = $stmt->fetchColumn();
        $stats['gastos_mes'] = floatval($compras_operativas);

        // 4. Impuestos Estimados (IGV Ventas - IGV Compras)
        $stmt = $conn->prepare("
            SELECT IFNULL(SUM(total_igv), 0) 
            FROM comprobantes_electronicos 
            WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'
        ");
        $stmt->execute([':start' => $startDate, ':end' => $endDate]);
        $igv_ventas = floatval($stmt->fetchColumn());

        $stmt = $conn->prepare("
            SELECT IFNULL(SUM(igv_gravado + igv_mixto + igv_no_gravado), 0) 
            FROM comprobantes_compra 
            WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'
        ");
        $stmt->execute([':start' => $startDate, ':end' => $endDate]);
        $igv_compras = floatval($stmt->fetchColumn());

        $igv_pagar = $igv_ventas - $igv_compras;
        
        // Lista de impuestos (Mezcla de tabla estática y cálculo dinámico)
        $stats['impuestos_pendientes'] = [];
        
        // Agregar IGV Estimado del mes actual
        if ($igv_pagar > 0) {
            $stats['impuestos_pendientes'][] = [
                'nombre' => 'IGV Estimado (Mes Actual)',
                'fecha_vencimiento' => date('Y-m-t', strtotime("$anio-$mes-01")), // Fin de mes
                'monto' => $igv_pagar
            ];
        }

        // Agregar impuestos fijos desde tabla (Renta, etc.)
        $stmt = $conn->query("SELECT nombre, fecha_vencimiento, monto FROM impuestos_tributos WHERE estado = 'Pendiente' ORDER BY fecha_vencimiento ASC LIMIT 3");
        $impuestos_fijos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stats['impuestos_pendientes'] = array_merge($stats['impuestos_pendientes'], $impuestos_fijos);


        // 5. Saldo en Tesorería (Caja + Bancos)
        // Caja
        $stmt = $conn->query("SELECT IFNULL(SUM(monto), 0) FROM caja_movimientos WHERE tipo = 'Ingreso'");
        $caja_ingresos = $stmt->fetchColumn();
        $stmt = $conn->query("SELECT IFNULL(SUM(monto), 0) FROM caja_movimientos WHERE tipo = 'Egreso'");
        $caja_egresos = $stmt->fetchColumn();
        $saldo_caja = $caja_ingresos - $caja_egresos;

        // Bancos
        // Asumiendo tabla bancos_cuentas tiene campo saldo_actual o calcular desde movimientos
        $stmt = $conn->query("SELECT IFNULL(SUM(saldo_actual), 0) FROM bancos_cuentas");
        $saldo_bancos = $stmt->fetchColumn();
        
        $stats['saldo_tesoreria'] = $saldo_caja + $saldo_bancos;


        // 6. Auditoría Reciente
        $stmt = $conn->query("SELECT accion, tabla_afectada, fecha_hora FROM bitacora_cambios ORDER BY fecha_hora DESC LIMIT 5");
        $stats['auditoria_reciente'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 7. Totales Rápidos
        $stats['clientes_count'] = $conn->query("SELECT COUNT(*) FROM clientes WHERE estado='Activo'")->fetchColumn();
        $stats['proveedores_count'] = $conn->query("SELECT COUNT(*) FROM proveedores WHERE estado='Activo'")->fetchColumn();
        $stats['asientos_pendientes'] = $conn->query("SELECT COUNT(*) FROM asientos WHERE estado='Borrador'")->fetchColumn();
        
        // Extra: Comprobantes por enviar a SUNAT (si hubiera estado 'Pendiente' o similar)
        $stats['comprobantes_pendientes_sunat'] = $conn->query("SELECT COUNT(*) FROM comprobantes_electronicos WHERE estado_sunat = 'Pendiente'")->fetchColumn();

        return $stats;
    }, 300); // 5 minutes cache

    $conn = null;
    echo json_encode($stats);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error al cargar dashboard: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
?>