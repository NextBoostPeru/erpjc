<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
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
    echo json_encode(['error' => 'Token inválido']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    rbac_require($conn, $userData, 'turnos', $method);

    if ($method === 'GET') {
        $stmt = $conn->query("SELECT * FROM turnos ORDER BY id");
        echo json_encode(["data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}
?>
