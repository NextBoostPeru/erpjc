<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Enable error logging
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', 'debug_errors.log');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';

// Auth Helper
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
    
    if (!$token) {
        throw new Exception("No token provided");
    }

    $jwtHandler = new JWTHandler();
    $userData = $jwtHandler->validateToken($token);

    if (!$userData) {
        throw new Exception("Token inválido o expirado");
    }

    // Optional: Check module permissions (skipping for simplicity in this demo, assuming Accountant/Admin access)
    // $userId = $userData->id;
    // $rolId = $userData->rol_id;

} catch (Exception $e) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso denegado: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            $stmt = $conn->prepare("SELECT * FROM distribucion_gastos ORDER BY id DESC");
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $data]);
            break;

        case 'POST':
            $input = json_decode(file_get_contents("php://input"), true);
            
            if (empty($input['centro_origen_id']) || empty($input['centro_destino_id']) || empty($input['porcentaje'])) {
                throw new Exception("Faltan datos requeridos");
            }

            $stmt = $conn->prepare("INSERT INTO distribucion_gastos (centro_costo_origen_id, centro_costo_destino_id, porcentaje, descripcion) VALUES (:origen, :destino, :porcentaje, :descripcion)");
            
            $stmt->execute([
                ':origen' => $input['centro_origen_id'],
                ':destino' => $input['centro_destino_id'],
                ':porcentaje' => $input['porcentaje'],
                ':descripcion' => $input['descripcion'] ?? ''
            ]);
            
            echo json_encode(['success' => true, 'message' => 'Regla creada correctamente', 'id' => $conn->lastInsertId()]);
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) throw new Exception("ID no proporcionado");
            
            $stmt = $conn->prepare("DELETE FROM distribucion_gastos WHERE id = ?");
            $stmt->execute([$id]);
            
            echo json_encode(['success' => true, 'message' => 'Regla eliminada']);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
if (isset($conn)) $conn = null;
?>
