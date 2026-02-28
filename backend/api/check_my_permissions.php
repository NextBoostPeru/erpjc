<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

// Validar JWT (acepta Authorization o token por query string)
$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
if (!$token && isset($_GET['token'])) {
    $token = $_GET['token'];
}
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

// Convertir a array si es objeto
$userData = (array) $userData;
$rol_id = isset($userData['rol_id']) ? (int)$userData['rol_id'] : null;
$rol_nombre = isset($userData['rol_nombre']) ? strtolower((string)$userData['rol_nombre']) : '';

// Si el token no trae rol_nombre, lo buscamos en BD
if (!$rol_nombre && $rol_id) {
    try {
        $stmtRol = $conn->prepare("SELECT nombre FROM roles WHERE id = :id LIMIT 1");
        $stmtRol->bindParam(':id', $rol_id, PDO::PARAM_INT);
        $stmtRol->execute();
        $nombreRol = $stmtRol->fetchColumn();
        if ($nombreRol) {
            $rol_nombre = strtolower((string)$nombreRol);
        }
    } catch (Exception $e) {
        // si falla, continuamos con lo que tengamos
    }
}

$modulo_code = isset($_GET['code']) ? $_GET['code'] : '';

if (empty($modulo_code)) {
    http_response_code(400);
    echo json_encode(["message" => "Falta el código del módulo"]);
    exit;
}

// Override: Administrador/Gerencia tienen control total en Gestión de Permisos
if ($modulo_code === 'permisos') {
    $isAdminNumeric = $rol_id === 1;
    $isManagerNumeric = $rol_id === 7;
    $isAdminByName = $rol_nombre && (strpos($rol_nombre, 'admin') !== false || strpos($rol_nombre, 'administrador') !== false);
    $isManagerByName = $rol_nombre && (strpos($rol_nombre, 'gerente') !== false || strpos($rol_nombre, 'gerencia') !== false);

    if ($isAdminNumeric || $isManagerNumeric || $isAdminByName || $isManagerByName) {
        echo json_encode([
            "lectura" => 1,
            "escritura" => 1,
            "eliminacion" => 1
        ]);
        if (isset($conn)) $conn = null;
        exit;
    }
}

try {
    // Buscar permisos para este rol y modulo
    $query = "
        SELECT rm.permiso_lectura, rm.permiso_escritura, rm.permiso_eliminacion
        FROM roles_modulos rm
        JOIN modulos m ON rm.modulo_id = m.id
        WHERE rm.rol_id = :rol_id AND m.codigo = :codigo
        LIMIT 1
    ";

    $stmt = $conn->prepare($query);
    $stmt->bindParam(':rol_id', $rol_id);
    $stmt->bindParam(':codigo', $modulo_code);
    $stmt->execute();

    if ($stmt->rowCount() > 0) {
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode([
            "lectura" => (int)$row['permiso_lectura'],
            "escritura" => (int)$row['permiso_escritura'],
            "eliminacion" => (int)$row['permiso_eliminacion']
        ]);
    } else {
        // Si no hay asignación explícita, asumimos sin permisos o 0
        echo json_encode([
            "lectura" => 0,
            "escritura" => 0,
            "eliminacion" => 0
        ]);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error de base de datos: " . $e->getMessage()]);
}
?>
