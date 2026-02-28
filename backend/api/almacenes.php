<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

// CORS Headers
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// Auth logic
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user_data = $jwt->validateToken($token);

if (!$user_data) {
    header("HTTP/1.1 401 Unauthorized");
    if (isset($conn)) if (isset($conn)) $conn = null;
    exit;
}

// Helper para validar campos requeridos
function validateRequired($data, $fields) {
    foreach ($fields as $field) {
        if (!isset($data[$field]) || trim($data[$field]) === '') {
            return false;
        }
    }
    return true;
}

// ALMACENES
if ($method === 'GET' && !isset($_GET['resource'])) {
    try {
        $stmt = $conn->query("
            SELECT a.*, u.usuario as responsable_nombre 
            FROM almacenes a 
            LEFT JOIN usuarios u ON a.responsable_id = u.id 
            ORDER BY a.created_at DESC
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'POST' && !isset($_GET['resource'])) {
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!validateRequired($data, ['nombre', 'tipo'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Nombre y tipo son requeridos']);
        $conn = null;
        exit;
    }

    try {
        $stmt = $conn->prepare("INSERT INTO almacenes (nombre, tipo, direccion, responsable_id) VALUES (?, ?, ?, ?)");
        $stmt->execute([
            $data['nombre'], 
            $data['tipo'], 
            $data['direccion'] ?? null, 
            !empty($data['responsable_id']) ? $data['responsable_id'] : null
        ]);
        echo json_encode(['message' => 'Almacén creado', 'id' => $conn->lastInsertId()]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'PUT' && !isset($_GET['resource'])) {
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'ID es requerido']);
        $conn = null;
        exit;
    }

    try {
        $stmt = $conn->prepare("UPDATE almacenes SET nombre = ?, tipo = ?, direccion = ?, responsable_id = ? WHERE id = ?");
        $stmt->execute([
            $data['nombre'], 
            $data['tipo'], 
            $data['direccion'] ?? null, 
            !empty($data['responsable_id']) ? $data['responsable_id'] : null,
            $_GET['id']
        ]);
        echo json_encode(['message' => 'Almacén actualizado']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'DELETE' && !isset($_GET['resource'])) {
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'ID es requerido']);
        $conn = null;
        exit;
    }

    try {
        $stmt = $conn->prepare("DELETE FROM almacenes WHERE id = ?");
        $stmt->execute([$_GET['id']]);
        echo json_encode(['message' => 'Almacén eliminado']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}


// UBICACIONES (resource=ubicaciones)
elseif ($method === 'GET' && isset($_GET['resource']) && $_GET['resource'] === 'ubicaciones') {
    try {
        $almacenId = $_GET['almacen_id'] ?? null;
        $sql = "
            SELECT u.*, a.nombre as almacen_nombre, us.usuario as responsable_nombre
            FROM ubicaciones u 
            JOIN almacenes a ON u.almacen_id = a.id
            LEFT JOIN usuarios us ON u.responsable_id = us.id
        ";
        
        if ($almacenId) {
            $sql .= " WHERE u.almacen_id = :almacen_id";
        }
        
        $sql .= " ORDER BY u.codigo ASC";
        
        $stmt = $conn->prepare($sql);
        if ($almacenId) {
            $stmt->bindParam(':almacen_id', $almacenId);
        }
        $stmt->execute();
        
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'POST' && isset($_GET['resource']) && $_GET['resource'] === 'ubicaciones') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!validateRequired($data, ['almacen_id', 'codigo'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Almacén ID y Código son requeridos']);
        $conn = null;
        exit;
    }

    try {
        $stmt = $conn->prepare("INSERT INTO ubicaciones (almacen_id, codigo, pasillo, estanteria, nivel, capacidad, responsable_id, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $data['almacen_id'],
            $data['codigo'],
            $data['pasillo'] ?? null,
            $data['estanteria'] ?? null,
            $data['nivel'] ?? null,
            $data['capacidad'] ?? 0,
            $data['responsable_id'] ?? null,
            $data['descripcion'] ?? null
        ]);
        echo json_encode(['message' => 'Ubicación creada', 'id' => $conn->lastInsertId()]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'PUT' && isset($_GET['resource']) && $_GET['resource'] === 'ubicaciones') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'ID es requerido']);
        $conn = null;
        exit;
    }

    try {
        $stmt = $conn->prepare("UPDATE ubicaciones SET codigo = ?, pasillo = ?, estanteria = ?, nivel = ?, capacidad = ?, responsable_id = ?, descripcion = ? WHERE id = ?");
        $stmt->execute([
            $data['codigo'],
            $data['pasillo'] ?? null,
            $data['estanteria'] ?? null,
            $data['nivel'] ?? null,
            $data['capacidad'] ?? 0,
            $data['responsable_id'] ?? null,
            $data['descripcion'] ?? null,
            $_GET['id']
        ]);
        echo json_encode(['message' => 'Ubicación actualizada']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'DELETE' && isset($_GET['resource']) && $_GET['resource'] === 'ubicaciones') {
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'ID es requerido']);
        $conn = null;
        exit;
    }

    try {
        $stmt = $conn->prepare("DELETE FROM ubicaciones WHERE id = ?");
        $stmt->execute([$_GET['id']]);
        echo json_encode(['message' => 'Ubicación eliminada']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

$conn = null;
?>

