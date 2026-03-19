<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', 'debug_conciliacion.log');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

function getAuthorizationHeader(){
    $headers = null;
    if (isset($_SERVER['Authorization'])) {
        $headers = trim($_SERVER["Authorization"]);
    }
    else if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers = trim($_SERVER["HTTP_AUTHORIZATION"]);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }
    return $headers;
}

try {
    $authHeader = getAuthorizationHeader();
    $token = $authHeader ? str_replace('Bearer ', '', $authHeader) : null;
    if (!$token) throw new Exception("No token provided");

    $jwtHandler = new JWTHandler();
    $userData = $jwtHandler->validateToken($token);
    if (!$userData) throw new Exception("Token inválido");
} catch (Exception $e) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso denegado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

rbac_ensure_roles_modulos_schema($conn);
[, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
$required = rbac_required_perm_for_request($method);

if (
    !rbac_can($conn, (int)$rolId, (string)$rolNombre, 'conciliacion_bancaria', $required)
    && !rbac_can($conn, (int)$rolId, (string)$rolNombre, 'bancos', $required)
) {
    http_response_code(403);
    echo json_encode([
        "message" => "No tienes permiso para esta acción",
        "forbidden" => true,
        "modulo" => "conciliacion_bancaria",
        "permiso" => $required
    ]);
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'POST') {
    $action = $_GET['action'] ?? 'conciliar';
    
    if ($action === 'conciliar') {
        // Recibe transacciones del banco (JSON) y las cruza con el sistema
        $input = json_decode(file_get_contents("php://input"), true);
        $movimientosBanco = $input['movimientos_banco'] ?? [];
        $cuentaId = $input['cuenta_id'] ?? null;
        
        if (!$cuentaId) {
            echo json_encode(['success' => false, 'message' => 'Cuenta ID requerida']);
            if (isset($conn)) $conn = null;
            exit;
        }

        // Obtener movimientos del sistema para el periodo (asumiendo mes actual o rango de fechas de los datos del banco)
        // Para simplificar, traemos los últimos 100 movimientos de la cuenta
        $stmt = $conn->prepare("SELECT * FROM bancos_movimientos WHERE cuenta_id = ? ORDER BY fecha DESC LIMIT 200");
        $stmt->execute([$cuentaId]);
        $movimientosSistema = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $resultado = [
            'conciliados' => [],
            'pendientes_banco' => [],
            'pendientes_sistema' => []
        ];

        // Lógica de Cruce Simple (Monto y Fecha aproximada o Referencia)
        $sistemaUsados = [];

        foreach ($movimientosBanco as $banco) {
            $encontrado = false;
            foreach ($movimientosSistema as $idx => $sistema) {
                if (in_array($idx, $sistemaUsados)) continue;

                // Criterio 1: Referencia exacta (si existe)
                if (!empty($banco['ref']) && !empty($sistema['referencia']) && $banco['ref'] === $sistema['referencia']) {
                    $resultado['conciliados'][] = ['banco' => $banco, 'sistema' => $sistema, 'razon' => 'Referencia'];
                    $sistemaUsados[] = $idx;
                    $encontrado = true;
                    break;
                }

                // Criterio 2: Monto exacto y misma fecha
                $montoBanco = floatval($banco['monto']);
                $montoSistema = ($sistema['tipo'] === 'Egreso' ? -1 : 1) * floatval($sistema['monto']);
                
                // Normalizar fecha (asumiendo formato YYYY-MM-DD)
                $fechaBanco = substr($banco['fecha'], 0, 10);
                $fechaSistema = substr($sistema['fecha'], 0, 10);

                if (abs($montoBanco - $montoSistema) < 0.01 && $fechaBanco === $fechaSistema) {
                    $resultado['conciliados'][] = ['banco' => $banco, 'sistema' => $sistema, 'razon' => 'Monto y Fecha'];
                    $sistemaUsados[] = $idx;
                    $encontrado = true;
                    break;
                }
            }
            
            if (!$encontrado) {
                $resultado['pendientes_banco'][] = $banco;
            }
        }

        // Agregar los del sistema que no se usaron
        foreach ($movimientosSistema as $idx => $sistema) {
            if (!in_array($idx, $sistemaUsados)) {
                $resultado['pendientes_sistema'][] = $sistema;
            }
        }

        echo json_encode(['success' => true, 'data' => $resultado]);

    } elseif ($action === 'guardar') {
        // Guardar la conciliación en la BD
        $input = json_decode(file_get_contents("php://input"), true);
        
        try {
            $conn->beginTransaction();
            
            $stmt = $conn->prepare("INSERT INTO conciliaciones_bancarias (banco_id, fecha_conciliacion, saldo_banco, saldo_libro, estado) VALUES (?, NOW(), ?, ?, 'conciliado')");
            $stmt->execute([
                $input['cuenta_id'],
                $input['saldo_banco'],
                $input['saldo_libro']
            ]);
            $conciliacionId = $conn->lastInsertId();
            
            // Guardar detalles (opcional, simplificado aquí)
            
            $conn->commit();
            echo json_encode(['success' => true, 'message' => 'Conciliación guardada', 'id' => $conciliacionId]);
        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
    }

} elseif ($method === 'GET') {
    // Listar conciliaciones pasadas
    $stmt = $conn->query("SELECT c.*, b.nombre_banco FROM conciliaciones_bancarias c LEFT JOIN bancos_cuentas b ON c.banco_id = b.id ORDER BY fecha_conciliacion DESC");
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

if (isset($conn)) $conn = null;
?>
