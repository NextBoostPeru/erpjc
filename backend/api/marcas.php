<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"));

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    $userData = $jwtHandler->validateToken($token);
    if (!$userData) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    if ($method !== 'GET') {
        rbac_require($conn, $userData, 'marcas', $method);
    }

    switch ($method) {
        case 'GET':
            $sql = "SELECT * FROM marcas ORDER BY nombre";
            $stmt = $conn->prepare($sql);
            $stmt->execute();
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'POST':
            if (empty($data->nombre)) throw new Exception("Nombre requerido");
            
            $stmt = $conn->prepare("INSERT INTO marcas (nombre, descripcion) VALUES (:nombre, :desc)");
            $stmt->execute([':nombre' => $data->nombre, ':desc' => $data->descripcion ?? null]);
            
            echo json_encode(["message" => "Marca creada", "id" => $conn->lastInsertId()]);
            break;

        case 'PUT':
            if (empty($data->id) || empty($data->nombre)) throw new Exception("ID y Nombre requeridos");
            
            $stmt = $conn->prepare("UPDATE marcas SET nombre = :nombre, descripcion = :desc WHERE id = :id");
            $stmt->execute([':nombre' => $data->nombre, ':desc' => $data->descripcion ?? null, ':id' => $data->id]);
            
            echo json_encode(["message" => "Marca actualizada"]);
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) throw new Exception("ID requerido");
            
            // Check usage
            $check = $conn->prepare("SELECT id FROM productos WHERE marca_id = ?");
            $check->execute([$id]);
            if ($check->rowCount() > 0) throw new Exception("No se puede eliminar: Marca en uso");
            
            $stmt = $conn->prepare("DELETE FROM marcas WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(["message" => "Marca eliminada"]);
            break;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(["message" => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
