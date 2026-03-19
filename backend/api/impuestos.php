<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

// Validar JWT
$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
rbac_require($conn, $userData, 'impuestos', $method);

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'resumen_mensual':
        $mes = $_GET['mes'] ?? date('m');
        $anio = $_GET['anio'] ?? date('Y');

        try {
            // 1. Obtener Ventas
            $sqlVentas = "SELECT 
                            IFNULL(SUM(total_importe), 0) as total_ventas, 
                            IFNULL(SUM(total_igv), 0) as igv_ventas 
                          FROM comprobantes_electronicos 
                          WHERE MONTH(fecha_emision) = :mes AND YEAR(fecha_emision) = :anio 
                          AND estado != 'Anulado'";
            $stmt = $conn->prepare($sqlVentas);
            $stmt->execute([':mes' => $mes, ':anio' => $anio]);
            $ventas = $stmt->fetch(PDO::FETCH_ASSOC);

            // 2. Obtener Compras
            $sqlCompras = "SELECT 
                            IFNULL(SUM(importe_total), 0) as total_compras, 
                            IFNULL(SUM(igv_gravado + igv_mixto + igv_no_gravado), 0) as igv_compras,
                            IFNULL(SUM(monto_detraccion), 0) as total_detracciones,
                            IFNULL(SUM(monto_retencion), 0) as total_retenciones
                           FROM comprobantes_compra 
                           WHERE MONTH(fecha_emision) = :mes AND YEAR(fecha_emision) = :anio 
                           AND estado != 'Anulado'";
            $stmt = $conn->prepare($sqlCompras);
            $stmt->execute([':mes' => $mes, ':anio' => $anio]);
            $compras = $stmt->fetch(PDO::FETCH_ASSOC);

            // 3. Obtener Declaración Guardada (si existe)
            $sqlDecl = "SELECT * FROM declaraciones_mensuales WHERE mes = :mes AND anio = :anio";
            $stmt = $conn->prepare($sqlDecl);
            $stmt->execute([':mes' => $mes, ':anio' => $anio]);
            $declaracion = $stmt->fetch(PDO::FETCH_ASSOC);

            // Cálculos
            $impuesto_resultante = $ventas['igv_ventas'] - $compras['igv_compras'];
            // Renta estimada (1.5% del total de ventas netas, simplificado)
            $ventas_netas = $ventas['total_ventas'] - $ventas['igv_ventas'];
            $renta = $ventas_netas * 0.015;

            $total_a_pagar = max(0, $impuesto_resultante) + $renta;

            // Alertas
            $alertas = [];
            if ($impuesto_resultante > 0) {
                $alertas[] = "IGV a pagar positivo: S/ " . number_format($impuesto_resultante, 2);
            } else {
                $alertas[] = "Crédito fiscal a favor: S/ " . number_format(abs($impuesto_resultante), 2);
            }

            // Verificar si el mes anterior fue declarado (simple check)
            $mes_anterior = $mes == 1 ? 12 : $mes - 1;
            $anio_anterior = $mes == 1 ? $anio - 1 : $anio;
            $stmt = $conn->prepare("SELECT id FROM declaraciones_mensuales WHERE mes = ? AND anio = ? AND estado = 'Declarado'");
            $stmt->execute([$mes_anterior, $anio_anterior]);
            if (!$stmt->fetch()) {
                $alertas[] = "El periodo $mes_anterior/$anio_anterior no figura como declarado.";
            }

            echo json_encode([
                'ventas' => $ventas,
                'compras' => $compras,
                'calculos' => [
                    'impuesto_resultante' => $impuesto_resultante, // Si es negativo es saldo a favor
                    'renta_estimada' => $renta,
                    'total_a_pagar' => $total_a_pagar
                ],
                'declaracion' => $declaracion,
                'alertas' => $alertas
            ]);

        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["error" => $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'guardar_determinacion':
        $data = json_decode(file_get_contents("php://input"), true);
        
        try {
            // Upsert (Insert or Update)
            $sql = "INSERT INTO declaraciones_mensuales 
                    (mes, anio, total_ventas, total_compras, igv_ventas, igv_compras, renta_mensual, total_a_pagar, saldo_favor_anterior, coeficiente_renta, estado, fecha_declaracion)
                    VALUES 
                    (:mes, :anio, :tv, :tc, :iv, :ic, :renta, :pagar, :sfa, :cr, 'Declarado', NOW())
                    ON DUPLICATE KEY UPDATE
                    total_ventas = :tv, total_compras = :tc, igv_ventas = :iv, igv_compras = :ic, 
                    renta_mensual = :renta, total_a_pagar = :pagar, saldo_favor_anterior = :sfa, coeficiente_renta = :cr, estado = 'Declarado', fecha_declaracion = NOW()";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':mes' => $data['mes'],
                ':anio' => $data['anio'],
                ':tv' => $data['total_ventas'],
                ':tc' => $data['total_compras'],
                ':iv' => $data['igv_ventas'],
                ':ic' => $data['igv_compras'],
                ':renta' => $data['renta'],
                ':pagar' => $data['total_a_pagar'],
                ':sfa' => $data['saldo_favor_anterior'] ?? 0,
                ':cr' => $data['coeficiente_renta'] ?? 0.015
            ]);

            echo json_encode(["message" => "Declaración guardada exitosamente"]);

        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["error" => $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'reporte_pdt':
        // Generación de archivo de texto plano simulando estructura PDT 621 (simplificado)
        $mes = $_GET['mes'];
        $anio = $_GET['anio'];

        // Obtener datos (reutilizar lógica o hacer query directa)
        // ... (Para simplificar, haré query directa rápida)
        $stmt = $conn->prepare("SELECT * FROM declaraciones_mensuales WHERE mes = ? AND anio = ?");
        $stmt->execute([$mes, $anio]);
        $decl = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$decl) {
            http_response_code(404);
            echo json_encode(["error" => "No hay declaración guardada para este periodo"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $ruc = "20601234567"; // Hardcoded for demo or get from config
        $periodo = sprintf("%04d%02d", $anio, $mes);
        
        // Formato simulado: RUC|PERIODO|V.NETAS|C.NETAS|IGV_V|IGV_C|RENTA
        $content = "0621|$ruc|$periodo|{$decl['total_ventas']}|{$decl['total_compras']}|{$decl['igv_ventas']}|{$decl['igv_compras']}|{$decl['renta_mensual']}|";

        header('Content-Type: text/plain');
        header('Content-Disposition: attachment; filename="PDT621_' . $ruc . '_' . $periodo . '.txt"');
        echo $content;
        break;
}
if (isset($conn)) $conn = null;
?>
