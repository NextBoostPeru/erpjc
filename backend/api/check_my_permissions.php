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

function rbac_column_exists(PDO $conn, string $table, string $column): bool {
    $stmt = $conn->prepare("
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :t
          AND COLUMN_NAME = :c
        LIMIT 1
    ");
    $stmt->execute([':t' => $table, ':c' => $column]);
    return (bool)$stmt->fetchColumn();
}

function rbac_ensure_roles_modulos_schema(PDO $conn): void {
    try {
        if (!rbac_column_exists($conn, 'roles_modulos', 'permiso_crear')) {
            $conn->exec("ALTER TABLE roles_modulos ADD COLUMN permiso_crear TINYINT(1) NOT NULL DEFAULT 0");
            try { $conn->exec("UPDATE roles_modulos SET permiso_crear = COALESCE(permiso_escritura, 0)"); } catch (Throwable $e) {}
        }
        if (!rbac_column_exists($conn, 'roles_modulos', 'permiso_editar')) {
            $conn->exec("ALTER TABLE roles_modulos ADD COLUMN permiso_editar TINYINT(1) NOT NULL DEFAULT 0");
            try { $conn->exec("UPDATE roles_modulos SET permiso_editar = COALESCE(permiso_escritura, 0)"); } catch (Throwable $e) {}
        }
    } catch (Throwable $e) {
    }
}

rbac_ensure_roles_modulos_schema($conn);

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
$userId = isset($userData['id']) ? (int)$userData['id'] : 0;

// Obtener rol_id y rol_nombre actualizados desde la BD
$rol_id = null;
$rol_nombre = '';

if ($userId) {
    try {
        $stmtUser = $conn->prepare("SELECT u.rol_id, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.id = :id LIMIT 1");
        $stmtUser->bindParam(':id', $userId, PDO::PARAM_INT);
        $stmtUser->execute();
        $userRoleInfo = $stmtUser->fetch(PDO::FETCH_ASSOC);
        
        if ($userRoleInfo) {
            $rol_id = (int)$userRoleInfo['rol_id'];
            $rol_nombre = strtolower((string)$userRoleInfo['rol_nombre']);
        }
    } catch (Exception $e) {
        // Fallback
    }
}

// Si falló la BD, intentar usar lo del token (aunque sea incompleto)
if (!$rol_id && isset($userData['rol_id'])) {
    $rol_id = (int)$userData['rol_id'];
}
if (!$rol_nombre) {
    $rol_nombre = isset($userData['rol']) ? strtolower((string)$userData['rol']) : (isset($userData['rol_nombre']) ? strtolower((string)$userData['rol_nombre']) : '');
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
            "crear" => 1,
            "editar" => 1,
            "eliminacion" => 1,
            "escritura" => 1
        ]);
        if (isset($conn)) $conn = null;
        exit;
    }
}

try {
    // Buscar permisos para este rol y modulo
    $query = "
        SELECT 
            MAX(COALESCE(rm.permiso_lectura, 0)) as permiso_lectura,
            MAX(COALESCE(rm.permiso_crear, 0)) as permiso_crear,
            MAX(COALESCE(rm.permiso_editar, 0)) as permiso_editar,
            MAX(COALESCE(rm.permiso_eliminacion, 0)) as permiso_eliminacion,
            MAX(COALESCE(rm.permiso_escritura, 0)) as permiso_escritura
        FROM roles_modulos rm
        JOIN modulos m ON rm.modulo_id = m.id
        WHERE rm.rol_id = :rol_id AND m.codigo = :codigo
    ";

    $stmt = $conn->prepare($query);
    $stmt->bindParam(':rol_id', $rol_id);
    $stmt->bindParam(':codigo', $modulo_code);
    $stmt->execute();

    if ($stmt->rowCount() > 0) {
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $crear = (int)$row['permiso_crear'];
        $editar = (int)$row['permiso_editar'];
        $legacyEscritura = (int)$row['permiso_escritura'];
        $escritura = ($crear === 1 || $editar === 1 || $legacyEscritura === 1) ? 1 : 0;
        echo json_encode([
            "lectura" => (int)$row['permiso_lectura'],
            "crear" => $crear,
            "editar" => $editar,
            "eliminacion" => (int)$row['permiso_eliminacion'],
            "escritura" => $escritura
        ]);
    } else {
        // Si no hay asignación explícita, asumimos sin permisos o 0
        echo json_encode([
            "lectura" => 0,
            "crear" => 0,
            "editar" => 0,
            "eliminacion" => 0,
            "escritura" => 0
        ]);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error de base de datos: " . $e->getMessage()]);
}
?>
