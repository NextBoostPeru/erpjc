<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

// Configuración de errores para evitar que salgan en el JSON
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$method = $_SERVER['REQUEST_METHOD'];
$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);
if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

rbac_require($conn, $userData, 'reportes_ejecutivos', $method);

$action = isset($_GET['action']) ? $_GET['action'] : '';

try {
    switch ($action) {
        case 'financiero':
            getFinancieroConsolidado($conn);
            break;
        case 'operativo':
            getOperativoConsolidado($conn);
            break;
        case 'comparativos':
            getComparativos($conn);
            break;
        default:
            echo json_encode(['error' => 'Acción no válida']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function getFinancieroConsolidado($conn) {
    // Ingresos (Ventas de comprobantes_electronicos)
    $sqlVentas = "SELECT COALESCE(SUM(CASE WHEN tipo_comprobante = '07' THEN -total_importe ELSE total_importe END), 0) as total_ventas 
                  FROM comprobantes_electronicos 
                  WHERE estado NOT IN ('Anulado','Generado')";
    $stmtVentas = $conn->prepare($sqlVentas);
    $stmtVentas->execute();
    $ventas = (float)$stmtVentas->fetchColumn();

    // Gastos (Compras de comprobantes_compra)
    $sqlCompras = "SELECT COALESCE(SUM(CASE WHEN tipo_comprobante = '07' THEN -importe_total ELSE importe_total END), 0) as total_compras 
                   FROM comprobantes_compra 
                   WHERE estado NOT IN ('Anulado','Generado')";
    $stmtCompras = $conn->prepare($sqlCompras);
    $stmtCompras->execute();
    $compras = (float)$stmtCompras->fetchColumn();

    // Egresos de Caja (Gastos menores no facturados o movimientos directos)
    // Verificar si existe la tabla caja_movimientos
    $egresos = 0;
    try {
        $checkTable = $conn->query("SHOW TABLES LIKE 'caja_movimientos'");
        if ($checkTable->rowCount() > 0) {
            $sqlEgresos = "SELECT COALESCE(SUM(monto), 0) as total_egresos 
                           FROM caja_movimientos 
                           WHERE tipo = 'Egreso'";
            $stmtEgresos = $conn->prepare($sqlEgresos);
            $stmtEgresos->execute();
            $egresos = (float)$stmtEgresos->fetchColumn();
        }
    } catch (Exception $e) {
        // Ignorar si falla, asumir 0
    }

    $totalGastos = $compras + $egresos;
    $utilidad = $ventas - $totalGastos;
    
    // Margen Neto
    $margen = ($ventas > 0) ? ($utilidad / $ventas) * 100 : 0;

    echo json_encode([
        'ingresos_totales' => round($ventas, 2),
        'gastos_totales' => round($totalGastos, 2),
        'utilidad_neta' => round($utilidad, 2),
        'margen_neto' => round($margen, 2)
    ]);
}

function getOperativoConsolidado($conn) {
    // Total Ventas (Cantidad Transacciones)
    $sqlCountVentas = "SELECT COUNT(*) as num_ventas 
                       FROM comprobantes_electronicos 
                       WHERE estado NOT IN ('Anulado','Generado') 
                       AND tipo_comprobante <> '07'";
    $stmtCountVentas = $conn->prepare($sqlCountVentas);
    $stmtCountVentas->execute();
    $numVentas = (int)$stmtCountVentas->fetchColumn();

    // Ticket Promedio
    $sqlTicket = "SELECT AVG(CASE WHEN tipo_comprobante <> '07' THEN total_importe END) as ticket_promedio 
                  FROM comprobantes_electronicos 
                  WHERE estado NOT IN ('Anulado','Generado')";
    $stmtTicket = $conn->prepare($sqlTicket);
    $stmtTicket->execute();
    $ticketPromedio = (float)$stmtTicket->fetchColumn();

    // Productos más vendidos (Top 5)
    // Usando comprobantes_electronicos_detalle
    $topProductos = [];
    try {
        $sqlTop = "SELECT d.descripcion as nombre, SUM(d.cantidad) as total_vendido 
                   FROM comprobantes_electronicos_detalle d
                   JOIN comprobantes_electronicos c ON d.comprobante_id = c.id
                   WHERE c.estado NOT IN ('Anulado','Generado') AND c.tipo_comprobante <> '07'
                   GROUP BY d.descripcion
                   ORDER BY total_vendido DESC
                   LIMIT 5";
        $stmtTop = $conn->prepare($sqlTop);
        $stmtTop->execute();
        $topProductos = $stmtTop->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $topProductos = []; 
    }

    // Inventario Total (Valorizado)
    $valorInventario = 0;
    try {
        $checkProd = $conn->query("SHOW TABLES LIKE 'productos'");
        if ($checkProd->rowCount() > 0) {
            // Verificar columnas precio_compra y stock
            // Asumimos que existen o usamos precio_venta como fallback si precio_compra no existe
            // Pero idealmente es precio_compra
            $sqlInventario = "SELECT COALESCE(SUM(stock_actual * precio_compra), 0) as valor_inventario FROM productos";
            // Si stock_actual no existe, intentar stock
            // Primero verificamos columnas
            $cols = $conn->query("SHOW COLUMNS FROM productos")->fetchAll(PDO::FETCH_COLUMN);
            $stockCol = in_array('stock_actual', $cols) ? 'stock_actual' : (in_array('stock', $cols) ? 'stock' : null);
            $priceCol = in_array('precio_compra', $cols) ? 'precio_compra' : (in_array('precio_costo', $cols) ? 'precio_costo' : null);

            if ($stockCol && $priceCol) {
                $sqlInventario = "SELECT COALESCE(SUM($stockCol * $priceCol), 0) as valor_inventario FROM productos";
                $stmtInventario = $conn->prepare($sqlInventario);
                $stmtInventario->execute();
                $valorInventario = (float)$stmtInventario->fetchColumn();
            }
        }
    } catch (Exception $e) {
        // Ignorar
    }

    echo json_encode([
        'num_transacciones' => $numVentas,
        'ticket_promedio' => round($ticketPromedio, 2),
        'valor_inventario' => round($valorInventario, 2),
        'top_productos' => $topProductos
    ]);
}

function getComparativos($conn) {
    // Mes Actual vs Mes Anterior
    $mesActual = date('m');
    $anioActual = date('Y');
    $mesAnterior = date('m', strtotime('-1 month'));
    $anioAnterior = date('Y', strtotime('-1 month')); 

    // Ventas Mes Actual
    $sqlMesActual = "SELECT COALESCE(SUM(CASE WHEN tipo_comprobante = '07' THEN -total_importe ELSE total_importe END), 0) as total 
                     FROM comprobantes_electronicos 
                     WHERE MONTH(fecha_emision) = :mes AND YEAR(fecha_emision) = :anio AND estado NOT IN ('Anulado','Generado')";
    $stmt = $conn->prepare($sqlMesActual);
    $stmt->execute([':mes' => $mesActual, ':anio' => $anioActual]);
    $ventasMesActual = (float)$stmt->fetchColumn();

    // Ventas Mes Anterior
    $stmt->execute([':mes' => $mesAnterior, ':anio' => $anioAnterior]);
    $ventasMesAnterior = (float)$stmt->fetchColumn();

    // Variación Mes
    $variacionMes = 0;
    if ($ventasMesAnterior > 0) {
        $variacionMes = (($ventasMesActual - $ventasMesAnterior) / $ventasMesAnterior) * 100;
    } elseif ($ventasMesActual > 0) {
        $variacionMes = 100;
    }

    // Año Actual vs Año Anterior
    $anioPasado = $anioActual - 1;

    // Ventas Año Actual
    $sqlAnio = "SELECT COALESCE(SUM(CASE WHEN tipo_comprobante = '07' THEN -total_importe ELSE total_importe END), 0) as total 
                FROM comprobantes_electronicos 
                WHERE YEAR(fecha_emision) = :anio AND estado NOT IN ('Anulado','Generado')";
    $stmtAnio = $conn->prepare($sqlAnio);
    $stmtAnio->execute([':anio' => $anioActual]);
    $ventasAnioActual = (float)$stmtAnio->fetchColumn();

    // Ventas Año Anterior
    $stmtAnio->execute([':anio' => $anioPasado]);
    $ventasAnioAnterior = (float)$stmtAnio->fetchColumn();

    // Variación Año
    $variacionAnio = 0;
    if ($ventasAnioAnterior > 0) {
        $variacionAnio = (($ventasAnioActual - $ventasAnioAnterior) / $ventasAnioAnterior) * 100;
    } elseif ($ventasAnioActual > 0) {
        $variacionAnio = 100;
    }

    echo json_encode([
        'mes_vs_mes' => [
            'actual' => $ventasMesActual,
            'anterior' => $ventasMesAnterior,
            'variacion_pct' => round($variacionMes, 2)
        ],
        'anio_vs_anio' => [
            'actual' => $ventasAnioActual,
            'anterior' => $ventasAnioAnterior,
            'variacion_pct' => round($variacionAnio, 2)
        ]
    ]);
}
?>
