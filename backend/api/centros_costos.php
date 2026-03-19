<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Enable error logging
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', 'debug_centros_costos.log');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

// Helper function to get headers
function getAuthorizationHeader(){
    $headers = null;
    if (isset($_SERVER['Authorization'])) {
        $headers = trim($_SERVER["Authorization"]);
    }
    else if (isset($_SERVER['HTTP_AUTHORIZATION'])) { //Nginx or fast CGI
        $headers = trim($_SERVER["HTTP_AUTHORIZATION"]);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        // Server-side fix for bug in old Android versions (a nice to have!)
        $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }
    return $headers;
}

// Verify JWT
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

    $userId = $userData->id;
    
    // Fix: Validar rol_id
    $rolId = $userData->rol_id ?? 0;
    
    // Si rol_id viene 0 o nulo, intentar recuperarlo de BD
    if (empty($rolId)) {
        $stmtUser = $conn->prepare("SELECT rol_id FROM usuarios WHERE id = ?");
        $stmtUser->execute([$userId]);
        $rolId = $stmtUser->fetchColumn();
    }
} catch (Exception $e) {
    error_log("Auth Error: " . $e->getMessage());
    http_response_code(401);
    echo json_encode(["message" => "Acceso denegado: " . $e->getMessage()]);
    $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$moduleCode = 'centros_costos';
$action = $_GET['action'] ?? '';

try {
    rbac_require($conn, $userData, $moduleCode, $method);

    switch ($method) {
        case 'GET':
            if ($action === 'servicio') {
                handleGetServicios($conn);
            } else {
                handleGet($conn);
            }
            break;
        case 'POST':
            if ($action === 'servicio') {
                handleCreateServicio($conn);
            } else {
                handleCreate($conn);
            }
            break;
        case 'PUT':
            if ($action === 'servicio') {
                handleUpdateServicio($conn);
            } else {
                handleUpdate($conn);
            }
            break;
        case 'DELETE':
            if ($action === 'servicio') {
                handleDeleteServicio($conn);
            } else {
                handleDelete($conn);
            }
            break;
    }
} catch (Exception $e) {
    error_log("Runtime Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
}
if (isset($conn)) $conn = null;

// --- Funciones para Centros de Costos ---

function handleGet($conn) {
    $sql = "SELECT * FROM centros_costos ORDER BY codigo ASC";
    if (isset($_GET['estado'])) {
        $sql = "SELECT * FROM centros_costos WHERE estado = :estado ORDER BY codigo ASC";
    }
    
    $stmt = $conn->prepare($sql);
    if (isset($_GET['estado'])) {
        $stmt->bindParam(':estado', $_GET['estado']);
    }
    
    $stmt->execute();
    echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function handleCreate($conn) {
    $input = file_get_contents("php://input");
    error_log("POST Payload: " . $input);
    $data = json_decode($input);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception("JSON inválido: " . json_last_error_msg());
    }
    
    if (empty($data->codigo) || empty($data->nombre)) {
        throw new Exception("Código y Nombre son obligatorios");
    }
    
    // Validación SUNAT (PLE)
    if (strpos($data->codigo, '|') !== false || strpos($data->nombre, '|') !== false) {
        throw new Exception("El código y nombre no pueden contener el carácter '|' (pipe) para cumplir con estándares SUNAT");
    }

    $sql = "INSERT INTO centros_costos (codigo, nombre, tipo, presupuesto, responsable, estado) 
            VALUES (:codigo, :nombre, :tipo, :presupuesto, :responsable, :estado)";
    
    $presupuesto = isset($data->presupuesto) && $data->presupuesto !== '' ? $data->presupuesto : 0;

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':codigo' => $data->codigo,
        ':nombre' => $data->nombre,
        ':tipo' => $data->tipo ?? 'Administrativo',
        ':presupuesto' => $presupuesto,
        ':responsable' => $data->responsable ?? '',
        ':estado' => $data->estado ?? 'Activo'
    ]);

    echo json_encode(["success" => true, "message" => "Centro de costos creado", "id" => $conn->lastInsertId()]);
}

function handleUpdate($conn) {
    $input = file_get_contents("php://input");
    error_log("PUT Payload: " . $input);
    $data = json_decode($input);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception("JSON inválido: " . json_last_error_msg());
    }
    
    if (empty($data->id) || empty($data->codigo) || empty($data->nombre)) {
        throw new Exception("ID, Código y Nombre son obligatorios");
    }

    $sql = "UPDATE centros_costos 
            SET codigo = :codigo, nombre = :nombre, tipo = :tipo, 
                presupuesto = :presupuesto, responsable = :responsable, estado = :estado
            WHERE id = :id";
    
    $presupuesto = isset($data->presupuesto) && $data->presupuesto !== '' ? $data->presupuesto : 0;

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':codigo' => $data->codigo,
        ':nombre' => $data->nombre,
        ':tipo' => $data->tipo,
        ':presupuesto' => $presupuesto,
        ':responsable' => $data->responsable,
        ':estado' => $data->estado ?? 'Activo',
        ':id' => $data->id
    ]);

    echo json_encode(["success" => true, "message" => "Centro de costos actualizado"]);
}

function handleDelete($conn) {
    $id = $_GET['id'] ?? null;
    $type = $_GET['type'] ?? 'soft'; 

    if (!$id) {
        $input = file_get_contents("php://input");
        $data = json_decode($input);
        if ($data && isset($data->id)) {
            $id = $data->id;
        }
    }

    if (!$id) {
        throw new Exception("ID requerido");
    }

    if ($type === 'hard') {
        $stmt = $conn->prepare("DELETE FROM centros_costos WHERE id = ?");
        $message = "Centro de costos eliminado permanentemente";
    } else {
        $stmt = $conn->prepare("UPDATE centros_costos SET estado = 'Inactivo' WHERE id = ?");
        $message = "Centro de costos desactivado";
    }

    $stmt->execute([$id]);

    echo json_encode(["success" => true, "message" => $message]);
}

// --- Funciones para Servicios ---

function handleGetServicios($conn) {
    $centroId = $_GET['centro_id'] ?? null;
    if (!$centroId) {
        throw new Exception("ID de centro de costo requerido");
    }

    $sql = "SELECT * FROM centros_costos_servicios WHERE centro_costo_id = :cid ORDER BY nombre ASC";
    if (isset($_GET['estado'])) {
        $sql = "SELECT * FROM centros_costos_servicios WHERE centro_costo_id = :cid AND estado = :estado ORDER BY nombre ASC";
    }

    $stmt = $conn->prepare($sql);
    $stmt->bindParam(':cid', $centroId);
    if (isset($_GET['estado'])) {
        $stmt->bindParam(':estado', $_GET['estado']);
    }

    $stmt->execute();
    echo json_encode(["success" => true, "data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function handleCreateServicio($conn) {
    $input = file_get_contents("php://input");
    error_log("POST Service Payload: " . $input);
    $data = json_decode($input);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception("JSON inválido: " . json_last_error_msg());
    }

    if (empty($data->centro_costo_id) || empty($data->nombre)) {
        throw new Exception("Centro de Costo y Nombre son obligatorios");
    }

    $sql = "INSERT INTO centros_costos_servicios (centro_costo_id, nombre, descripcion, estado) 
            VALUES (:cid, :nombre, :descripcion, :estado)";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':cid' => $data->centro_costo_id,
        ':nombre' => $data->nombre,
        ':descripcion' => $data->descripcion ?? '',
        ':estado' => $data->estado ?? 'Activo'
    ]);

    echo json_encode(["success" => true, "message" => "Servicio creado", "id" => $conn->lastInsertId()]);
}

function handleUpdateServicio($conn) {
    $input = file_get_contents("php://input");
    error_log("PUT Service Payload: " . $input);
    $data = json_decode($input);
    
    if (empty($data->id) || empty($data->nombre)) {
        throw new Exception("ID y Nombre son obligatorios");
    }

    $sql = "UPDATE centros_costos_servicios 
            SET nombre = :nombre, descripcion = :descripcion, estado = :estado
            WHERE id = :id";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':nombre' => $data->nombre,
        ':descripcion' => $data->descripcion ?? '',
        ':estado' => $data->estado ?? 'Activo',
        ':id' => $data->id
    ]);

    echo json_encode(["success" => true, "message" => "Servicio actualizado"]);
}

function handleDeleteServicio($conn) {
    $id = $_GET['id'] ?? null;
    $type = $_GET['type'] ?? 'soft'; 

    if (!$id) {
        $input = file_get_contents("php://input");
        $data = json_decode($input);
        if ($data && isset($data->id)) {
            $id = $data->id;
        }
    }

    if (!$id) {
        throw new Exception("ID de servicio requerido");
    }

    if ($type === 'hard') {
        $stmt = $conn->prepare("DELETE FROM centros_costos_servicios WHERE id = ?");
        $message = "Servicio eliminado permanentemente";
    } else {
        $stmt = $conn->prepare("UPDATE centros_costos_servicios SET estado = 'Inactivo' WHERE id = ?");
        $message = "Servicio desactivado";
    }

    $stmt->execute([$id]);

    echo json_encode(["success" => true, "message" => $message]);
}
?>
