<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

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
rbac_require($conn, $userData, 'perfil', $method);

$userId = $userData->id;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Corregido: 'r.nombre as rol' en lugar de 'rol_nombre as rol'
    // También seleccionamos u.rol como fallback si rol_id es null o join falla
    $stmt = $conn->prepare("
        SELECT u.id, u.usuario, u.email, 
               COALESCE(r.nombre, u.rol) as rol, 
               u.created_at 
        FROM usuarios u 
        LEFT JOIN roles r ON u.rol_id = r.id 
        WHERE u.id = ?
    ");
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($user) {
        echo json_encode($user);
    } else {
        http_response_code(404);
        echo json_encode(["message" => "Usuario no encontrado"]);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'PUT') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    $email = $data['email'] ?? '';
    $currentPassword = $data['current_password'] ?? '';
    $newPassword = $data['new_password'] ?? '';
    
    if (empty($email)) {
        http_response_code(400);
        echo json_encode(["message" => "El email es obligatorio"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    // Verify current password if changing sensitive info or just validation?
    // Let's require password for any change for security, or at least for password change.
    
    $stmt = $conn->prepare("SELECT password FROM usuarios WHERE id = ?");
    $stmt->execute([$userId]);
    $storedHash = $stmt->fetchColumn();
    
    // Check email uniqueness if changed
    $stmtCheck = $conn->prepare("SELECT id FROM usuarios WHERE email = ? AND id != ?");
    $stmtCheck->execute([$email, $userId]);
    if ($stmtCheck->fetch()) {
        http_response_code(400);
        echo json_encode(["message" => "El email ya está en uso por otro usuario"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    $updates = ["email = :email"];
    $params = [":email" => $email, ":id" => $userId];

    if (!empty($newPassword)) {
        if (empty($currentPassword)) {
            http_response_code(400);
            echo json_encode(["message" => "Debe ingresar su contraseña actual para establecer una nueva"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        
        if (!password_verify($currentPassword, $storedHash)) {
            http_response_code(400);
            echo json_encode(["message" => "La contraseña actual es incorrecta"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        
        $updates[] = "password = :password";
        $params[":password"] = password_hash($newPassword, PASSWORD_DEFAULT);
    }

    $sql = "UPDATE usuarios SET " . implode(", ", $updates) . " WHERE id = :id";
    $stmtUpdate = $conn->prepare($sql);
    
    if ($stmtUpdate->execute($params)) {
        echo json_encode(["message" => "Perfil actualizado correctamente"]);
    } else {
        http_response_code(500);
        echo json_encode(["message" => "Error al actualizar perfil"]);
    }
}
if (isset($conn)) $conn = null;
?>
