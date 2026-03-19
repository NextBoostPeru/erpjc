<?php
require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';
require_once 'helpers/SimpleCache.php';

header('Content-Type: application/json');

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);
if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

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

rbac_require_any($conn, $userData, ['dashboard_gerente', 'dashboard'], 'GET', 'lectura');

// Initialize Cache
$cache = new SimpleCache();
$cacheKey = 'dashboard_gerente_metrics_v2_' . date('Y-m-d_H'); // Cache per hour

try {
    $stats = $cache->get($cacheKey, function() use ($conn) {
        // 1. Calculate KPIs (Real calculations)
        
        // Fechas Mes Actual
        $mesActual = date('m');
        $anioActual = date('Y');
        $startDate = "$anioActual-$mesActual-01";
        $endDate = date("Y-m-t", strtotime($startDate));
        
        // Fechas Mes Anterior
        $fechaAnterior = date('Y-m-d', strtotime('-1 month'));
        $mesAnterior = date('m', strtotime($fechaAnterior));
        $anioAnterior = date('Y', strtotime($fechaAnterior));
        $startDateAnterior = "$anioAnterior-$mesAnterior-01";
        $endDateAnterior = date("Y-m-t", strtotime($startDateAnterior));

        // KPI: Ventas del Mes
        $stmt = $conn->prepare("SELECT COALESCE(SUM(total_importe), 0) FROM comprobantes_electronicos WHERE fecha_emision BETWEEN ? AND ? AND estado != 'Anulado'");
        $stmt->execute([$startDate, $endDate]);
        $ventasMes = (float)$stmt->fetchColumn();

        // Ventas Mes Anterior
        $stmt->execute([$startDateAnterior, $endDateAnterior]);
        $ventasMesAnterior = (float)$stmt->fetchColumn();
        if ($ventasMesAnterior == 0) $ventasMesAnterior = 1; // Avoid division by zero
        $cambioVentas = (($ventasMes - $ventasMesAnterior) / $ventasMesAnterior) * 100;

        // KPI: Ingresos Totales (Año Actual)
        $startYear = "$anioActual-01-01";
        $endYear = "$anioActual-12-31";
        $stmt = $conn->prepare("SELECT COALESCE(SUM(total_importe), 0) FROM comprobantes_electronicos WHERE fecha_emision BETWEEN ? AND ? AND estado != 'Anulado'");
        $stmt->execute([$startYear, $endYear]);
        $ingresosTotales = (float)$stmt->fetchColumn();
        
        // Cambio vs año anterior
        $startYearPrev = ($anioActual - 1) . "-01-01";
        $endYearPrev = ($anioActual - 1) . "-12-31";
        $stmt->execute([$startYearPrev, $endYearPrev]);
        $ingresosAnioAnterior = (float)$stmt->fetchColumn();
        if ($ingresosAnioAnterior == 0) $ingresosAnioAnterior = 1;
        $cambioIngresos = (($ingresosTotales - $ingresosAnioAnterior) / $ingresosAnioAnterior) * 100;


        // KPI: Nuevos Clientes (Mes Actual)
        // Tabla 'clientes' tiene 'created_at' o similar? Usaremos created_at si existe, si no, fallback.
        // Asumiendo created_at existe por logs anteriores.
        $stmt = $conn->prepare("SELECT COUNT(*) FROM clientes WHERE created_at BETWEEN ? AND ?");
        $stmt->execute([$startDate . " 00:00:00", $endDate . " 23:59:59"]);
        $nuevosClientes = (int)$stmt->fetchColumn();
        
        $stmt->execute([$startDateAnterior . " 00:00:00", $endDateAnterior . " 23:59:59"]);
        $nuevosClientesAnterior = (int)$stmt->fetchColumn();
        if ($nuevosClientesAnterior == 0) $nuevosClientesAnterior = 1;
        $cambioClientes = (($nuevosClientes - $nuevosClientesAnterior) / $nuevosClientesAnterior) * 100;


        // KPI: Gastos Operativos (Mes Actual)
        // Tabla 'comprobantes_compra'
        $stmt = $conn->prepare("SELECT COALESCE(SUM(importe_total), 0) FROM comprobantes_compra WHERE fecha_emision BETWEEN ? AND ? AND estado != 'Anulado'");
        $stmt->execute([$startDate, $endDate]);
        $gastosMes = (float)$stmt->fetchColumn();
        
        $stmt->execute([$startDateAnterior, $endDateAnterior]);
        $gastosMesAnterior = (float)$stmt->fetchColumn();
        if ($gastosMesAnterior == 0) $gastosMesAnterior = 1;
        $cambioGastos = (($gastosMes - $gastosMesAnterior) / $gastosMesAnterior) * 100;


        // Chart: Ventas por Mes (Últimos 6 meses)
        $ventasPorMes = [];
        $mesesEs = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        $startMonthDate = date('Y-m-01', strtotime("-6 months"));
        $endMonthDate = date("Y-m-t");

        $sqlChart = "SELECT DATE_FORMAT(fecha_emision, '%Y-%m') as mes_anio, 
                     COALESCE(SUM(total_importe), 0) as total 
                     FROM comprobantes_electronicos 
                     WHERE fecha_emision BETWEEN ? AND ? AND estado != 'Anulado'
                     GROUP BY DATE_FORMAT(fecha_emision, '%Y-%m')";
        $stmtChart = $conn->prepare($sqlChart);
        $stmtChart->execute([$startMonthDate, $endMonthDate]);
        $chartData = $stmtChart->fetchAll(PDO::FETCH_KEY_PAIR); // mes_anio => total

        for ($i = 6; $i >= 0; $i--) {
            $fechaBase = strtotime("-$i month");
            $mesNum = (int)date('n', $fechaBase);
            $key = date('Y-m', $fechaBase);
            
            $ventasPorMes[] = [
                'name' => $mesesEs[$mesNum - 1], // Nombre mes en español
                'ventas' => isset($chartData[$key]) ? (float)$chartData[$key] : 0,
                'meta' => 50000 // Meta hardcoded o podría venir de configuración
            ];
        }
        
        // Top Productos (Mes Actual)
        // Usamos comprobantes_electronicos_detalle
        $topProductos = [];
        try {
            $stmt = $conn->prepare("
                SELECT d.descripcion as name, SUM(d.cantidad) as ventas 
                FROM comprobantes_electronicos_detalle d
                JOIN comprobantes_electronicos c ON d.comprobante_id = c.id
                WHERE c.fecha_emision BETWEEN ? AND ? AND c.estado != 'Anulado'
                GROUP BY d.descripcion
                ORDER BY ventas DESC
                LIMIT 5
            ");
            $stmt->execute([$startDate, $endDate]);
            $topProductos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            $topProductos = [];
        }

        // Distribución de Gastos (Mes Actual)
        // Agrupado por proveedor
        $distribucionGastos = [];
        try {
            $stmt = $conn->prepare("
                SELECT proveedor_razon_social as name, SUM(importe_total) as value 
                FROM comprobantes_compra 
                WHERE fecha_emision BETWEEN ? AND ? AND estado != 'Anulado'
                GROUP BY proveedor_razon_social 
                ORDER BY value DESC 
                LIMIT 5
            ");
            $stmt->execute([$startDate, $endDate]);
            $distribucionGastos = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Cast value to float
            foreach ($distribucionGastos as &$item) {
                $item['value'] = (float)$item['value'];
            }
        } catch (Exception $e) {
            $distribucionGastos = [];
        }

        // Últimas Transacciones (Ventas recientes)
        $stmt = $conn->prepare("
            SELECT id, cliente_razon_social as cliente, total_importe as monto, estado, fecha_emision as fecha 
            FROM comprobantes_electronicos 
            ORDER BY fecha_emision DESC, id DESC 
            LIMIT 5
        ");
        $stmt->execute();
        $ultimasTransacciones = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Cálculos Financieros (Estimados)
        $utilidadBruta = $ventasMes - $gastosMes;
        $margenNeto = $ventasMes > 0 ? ($utilidadBruta / $ventasMes) * 100 : 0;
        
        $utilidadBrutaAnt = $ventasMesAnterior - $gastosMesAnterior;
        $margenNetoAnt = $ventasMesAnterior > 0 ? ($utilidadBrutaAnt / $ventasMesAnterior) * 100 : 0;
        $cambioMargen = $margenNeto - $margenNetoAnt;

        $cashFlow = $utilidadBruta;
        $cashFlowAnt = $utilidadBrutaAnt;
        $cambioCashFlow = $cashFlowAnt != 0 ? (($cashFlow - $cashFlowAnt) / abs($cashFlowAnt)) * 100 : 0;

        // Estructura para el frontend
        return [
            'kpis' => [
                'ventas_mes' => ['value' => $ventasMes, 'change' => round($cambioVentas, 1)],
                'ingresos_totales' => ['value' => $ingresosTotales, 'change' => round($cambioIngresos, 1)],
                'nuevos_clientes' => ['value' => $nuevosClientes, 'change' => round($cambioClientes, 1)],
                'gastos_operativos' => ['value' => $gastosMes, 'change' => round($cambioGastos, 1)]
            ],
            'financieros' => [
                'margen_neto' => ['value' => round($margenNeto, 1), 'change' => round($cambioMargen, 1)],
                'ebitda' => ['value' => round($margenNeto, 1), 'change' => round($cambioMargen, 1)], // Proxy
                'roi' => ['value' => round($gastosMes > 0 ? ($utilidadBruta / $gastosMes) * 100 : 0, 1), 'change' => 0],
                'cash_flow' => ['value' => $cashFlow, 'change' => round($cambioCashFlow, 1)]
            ],
            'ventas_por_mes' => $ventasPorMes,
            'top_productos' => $topProductos,
            'distribucion_gastos' => $distribucionGastos,
            'ultimas_transacciones' => $ultimasTransacciones
        ];
    }, 300); // 5 minutes cache

    if (isset($conn)) $conn = null;
    echo json_encode($stats);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error al cargar dashboard gerente: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
exit;
?>
