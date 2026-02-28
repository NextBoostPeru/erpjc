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

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado. Token inválido o expirado."]);
    $conn = null;
    exit();
}

// Optional: Check for admin role if strictly required
// if ($userData->rol_nombre !== 'Admin') { ... }

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"));

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['action']) && $_GET['action'] === 'roles') {
                $sql_roles = "SELECT id, nombre FROM roles";
                $stmt_roles = $conn->prepare($sql_roles);
                $stmt_roles->execute();
                $roles = $stmt_roles->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['success' => true, 'data' => $roles]);
                $conn = null;
                exit;
            }

            // List all users with their roles and areas
            $sql = "SELECT u.id, u.usuario, u.email, u.nombre_real, u.telefono, u.area, u.area_id, a.nombre as area_nombre, u.status, u.created_at, u.ultimo_acceso, u.rol_id, r.nombre as rol_nombre 
                    FROM usuarios u 
                    LEFT JOIN roles r ON u.rol_id = r.id 
                    LEFT JOIN areas a ON u.area_id = a.id
                    ORDER BY u.id DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute();
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Also fetch roles for the select dropdown
            $sql_roles = "SELECT id, nombre FROM roles";
            $stmt_roles = $conn->prepare($sql_roles);
            $stmt_roles->execute();
            $roles = $stmt_roles->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['users' => $users, 'roles' => $roles]);
            break;

        case 'POST':
            // Create User
            if (empty($data->usuario) || empty($data->password) || empty($data->email) || empty($data->rol_id)) {
                throw new Exception("Datos incompletos.");
            }
            
            // Check if user/email exists
            $check = $conn->prepare("SELECT id FROM usuarios WHERE usuario = ? OR email = ?");
            $check->execute([$data->usuario, $data->email]);
            if ($check->rowCount() > 0) {
                throw new Exception("Usuario o Email ya registrado.");
            }

            $hashed_password = password_hash($data->password, PASSWORD_DEFAULT);
            $status = $data->status ?? 'activo';
            $nombre_real = $data->nombre_real ?? null;
            $telefono = $data->telefono ?? null;
            $area = $data->area ?? null;
            $area_id = !empty($data->area_id) ? $data->area_id : null;

            $sql = "INSERT INTO usuarios (usuario, email, nombre_real, telefono, area, area_id, password, rol_id, status, created_at) VALUES (:u, :e, :n, :t, :a, :aid, :p, :r, :s, NOW())";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':u' => $data->usuario,
                ':e' => $data->email,
                ':n' => $nombre_real,
                ':t' => $telefono,
                ':a' => $area,
                ':aid' => $area_id,
                ':p' => $hashed_password,
                ':r' => $data->rol_id,
                ':s' => $status
            ]);

            echo json_encode(["message" => "Usuario creado exitosamente."]);
            break;

        case 'PUT':
            // Update User (Edit or Toggle Status)
            if (empty($data->id)) {
                throw new Exception("ID de usuario requerido.");
            }

            // Build dynamic update query
            $fields = [];
            $params = [':id' => $data->id];

            if (isset($data->usuario)) { $fields[] = "usuario = :u"; $params[':u'] = $data->usuario; }
            if (isset($data->email)) { $fields[] = "email = :e"; $params[':e'] = $data->email; }
            if (isset($data->nombre_real)) { $fields[] = "nombre_real = :n"; $params[':n'] = $data->nombre_real; }
            if (isset($data->telefono)) { $fields[] = "telefono = :t"; $params[':t'] = $data->telefono; }
            if (isset($data->area)) { $fields[] = "area = :a"; $params[':a'] = $data->area; }
            if (property_exists($data, 'area_id')) { 
                $fields[] = "area_id = :aid"; 
                $params[':aid'] = !empty($data->area_id) ? $data->area_id : null; 
            }
            if (isset($data->rol_id)) { $fields[] = "rol_id = :r"; $params[':r'] = $data->rol_id; }
            if (isset($data->status)) { $fields[] = "status = :s"; $params[':s'] = $data->status; }
            if (!empty($data->password)) { 
                $fields[] = "password = :p"; 
                $params[':p'] = password_hash($data->password, PASSWORD_DEFAULT); 
            }

            if (empty($fields)) {
                throw new Exception("No hay datos para actualizar.");
            }

            $sql = "UPDATE usuarios SET " . implode(", ", $fields) . " WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);

            echo json_encode(["message" => "Usuario actualizado exitosamente."]);
            break;

        case 'DELETE':
            // Delete User
            if (empty($_GET['id'])) {
                 throw new Exception("ID de usuario requerido.");
            }
            
            // Prevent deleting self? (optional)
            if ($userData->id == $_GET['id']) {
                throw new Exception("No puedes eliminar tu propio usuario.");
            }

            $sql = "DELETE FROM usuarios WHERE id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$_GET['id']]);

            echo json_encode(["message" => "Usuario eliminado exitosamente."]);
            break;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(["message" => $e->getMessage()]);
}
$conn = null;
?>