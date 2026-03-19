<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado."]);
    exit();
}

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"));

try {
    if ($method !== 'GET') {
        rbac_require($conn, $userData, 'areas', $method);
    }

    switch ($method) {
        case 'GET':
            $sql = "SELECT * FROM areas ORDER BY id DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute();
            $areas = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $areas]);
            break;

        case 'POST':
            if (empty($data->nombre)) {
                http_response_code(400);
                echo json_encode(["message" => "El nombre es requerido."]);
                exit;
            }

            $sql = "INSERT INTO areas (nombre, descripcion, status) VALUES (:nombre, :descripcion, :status)";
            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':nombre', $data->nombre);
            $stmt->bindParam(':descripcion', $data->descripcion);
            $status = $data->status ?? 'activo';
            $stmt->bindParam(':status', $status);
            
            if ($stmt->execute()) {
                http_response_code(201);
                echo json_encode(["message" => "Área creada correctamente.", "id" => $conn->lastInsertId()]);
            } else {
                http_response_code(500);
                echo json_encode(["message" => "Error al crear área."]);
            }
            break;

        case 'PUT':
            if (empty($data->id) || empty($data->nombre)) {
                http_response_code(400);
                echo json_encode(["message" => "ID y nombre son requeridos."]);
                exit;
            }

            $sql = "UPDATE areas SET nombre = :nombre, descripcion = :descripcion, status = :status WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':nombre', $data->nombre);
            $stmt->bindParam(':descripcion', $data->descripcion);
            $status = $data->status ?? 'activo';
            $stmt->bindParam(':status', $status);
            $stmt->bindParam(':id', $data->id);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Área actualizada correctamente."]);
            } else {
                http_response_code(500);
                echo json_encode(["message" => "Error al actualizar área."]);
            }
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(["message" => "ID requerido."]);
                exit;
            }

            // Verificar si hay usuarios asignados
            $check = "SELECT COUNT(*) FROM usuarios WHERE area_id = :id";
            $checkStmt = $conn->prepare($check);
            $checkStmt->bindParam(':id', $id);
            $checkStmt->execute();
            
            if ($checkStmt->fetchColumn() > 0) {
                http_response_code(409);
                echo json_encode(["message" => "No se puede eliminar el área porque tiene usuarios asignados."]);
                exit;
            }

            $sql = "DELETE FROM areas WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':id', $id);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Área eliminada correctamente."]);
            } else {
                http_response_code(500);
                echo json_encode(["message" => "Error al eliminar área."]);
            }
            break;
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error de base de datos: " . $e->getMessage()]);
}
?>
