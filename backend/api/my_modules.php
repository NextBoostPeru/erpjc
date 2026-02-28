<?php
include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user = $jwt->validateToken($token);

if (!$user) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

try {
    $rolId = isset($user->rol_id) ? (int)$user->rol_id : 0;
    $modulos = [];
    if ($rolId > 0) {
        $sql = "
            SELECT m.codigo, m.nombre, m.ruta, m.icono,
                   rm.permiso_lectura, rm.permiso_escritura, rm.permiso_eliminacion
            FROM roles_modulos rm
            JOIN modulos m ON rm.modulo_id = m.id
            WHERE rm.rol_id = :rol_id AND rm.permiso_lectura = 1
            ORDER BY m.nombre
        ";
        $stmt = $conn->prepare($sql);
        $stmt->bindParam(':rol_id', $rolId, PDO::PARAM_INT);
        $stmt->execute();
        $modulos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    echo json_encode($modulos);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}
if (isset($conn)) $conn = null;
