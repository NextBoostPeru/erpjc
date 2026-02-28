<?php
include_once '../config/db.php';
require_once '../config/jwt.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
if (!$token && isset($_GET['token'])) {
    $token = $_GET['token'];
}
$user = $jwt->validateToken($token);

if (!$user) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            $search = isset($_GET['search']) ? trim($_GET['search']) : '';
            $sql = "SELECT id, nombre, descripcion, created_at FROM roles";
            $params = [];
            if ($search !== '') {
                $sql .= " WHERE nombre LIKE :q OR descripcion LIKE :q";
                $params[':q'] = "%$search%";
            }
            $sql .= " ORDER BY id DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $roles = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($roles);
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"), true);
            $nombre = trim($data['nombre'] ?? '');
            $descripcion = trim($data['descripcion'] ?? '');
            if ($nombre === '') {
                http_response_code(400);
                echo json_encode(["message" => "El nombre es obligatorio"]);
                break;
            }
            $check = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
            $check->execute([$nombre]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(["message" => "Ya existe un rol con ese nombre"]);
                break;
            }
            $stmt = $conn->prepare("INSERT INTO roles (nombre, descripcion) VALUES (?, ?)");
            $stmt->execute([$nombre, $descripcion]);
            $id = $conn->lastInsertId();
            echo json_encode(["id" => $id, "nombre" => $nombre, "descripcion" => $descripcion]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"), true);
            $id = intval($data['id'] ?? 0);
            $nombre = trim($data['nombre'] ?? '');
            $descripcion = trim($data['descripcion'] ?? '');
            if ($id <= 0 || $nombre === '') {
                http_response_code(400);
                echo json_encode(["message" => "Datos inválidos"]);
                break;
            }
            $check = $conn->prepare("SELECT id FROM roles WHERE nombre = ? AND id <> ?");
            $check->execute([$nombre, $id]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(["message" => "Ya existe un rol con ese nombre"]);
                break;
            }
            $stmt = $conn->prepare("UPDATE roles SET nombre = ?, descripcion = ? WHERE id = ?");
            $stmt->execute([$nombre, $descripcion, $id]);
            echo json_encode(["id" => $id, "nombre" => $nombre, "descripcion" => $descripcion]);
            break;

        case 'DELETE':
            $id = intval($_GET['id'] ?? 0);
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(["message" => "ID inválido"]);
                break;
            }
            // Block delete if users assigned to this role
            $stmt = $conn->prepare("SELECT COUNT(*) FROM usuarios WHERE rol_id = ?");
            $stmt->execute([$id]);
            $count = intval($stmt->fetchColumn());
            if ($count > 0) {
                http_response_code(409);
                echo json_encode(["message" => "No se puede eliminar: hay usuarios asignados a este rol"]);
                break;
            }
            $stmt = $conn->prepare("DELETE FROM roles WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(["message" => "Rol eliminado"]);
            break;

        default:
            http_response_code(405);
            echo json_encode(["message" => "Método no permitido"]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error interno: " . $e->getMessage()]);
} finally {
    if (isset($conn)) $conn = null;
}
