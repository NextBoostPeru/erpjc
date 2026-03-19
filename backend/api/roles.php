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

function rbac_get_user_role(PDO $conn, $user): array {
    $u = (array)$user;
    $userId = isset($u['id']) ? (int)$u['id'] : (int)($u['id'] ?? 0);
    $rolId = (int)($u['rol_id'] ?? 0);
    $rolNombre = '';

    if ($userId) {
        try {
            $stmt = $conn->prepare("SELECT u.rol_id, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.id = ? LIMIT 1");
            $stmt->execute([$userId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                $rolId = (int)($row['rol_id'] ?? 0);
                $rolNombre = strtolower((string)($row['rol_nombre'] ?? ''));
            }
        } catch (Throwable $e) {
        }
    }

    if (!$rolNombre) {
        $rolNombre = strtolower((string)($u['rol'] ?? ($u['rol_nombre'] ?? '')));
    }

    return [$rolId, $rolNombre];
}

function rbac_is_admin_or_manager(int $rolId, string $rolNombre): bool {
    if ($rolId === 1 || $rolId === 7) return true;
    return $rolNombre !== '' && (str_contains($rolNombre, 'admin') || str_contains($rolNombre, 'administrador') || str_contains($rolNombre, 'gerente') || str_contains($rolNombre, 'gerencia'));
}

function rbac_can(PDO $conn, int $rolId, string $rolNombre, string $moduleCode, string $perm): bool {
    if (rbac_is_admin_or_manager($rolId, $rolNombre)) return true;

    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ? LIMIT 1");
    $stmt->execute([$moduleCode]);
    $moduleId = (int)($stmt->fetchColumn() ?: 0);
    if (!$moduleId) return false;

    if ($perm === 'escritura') {
        try {
            $stmt = $conn->prepare("SELECT COALESCE(permiso_crear,0) as c, COALESCE(permiso_editar,0) as e, COALESCE(permiso_escritura,0) as w FROM roles_modulos WHERE rol_id = ? AND modulo_id = ? LIMIT 1");
            $stmt->execute([$rolId, $moduleId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) return false;
            return ((int)$row['c'] === 1) || ((int)$row['e'] === 1) || ((int)$row['w'] === 1);
        } catch (Throwable $e) {
            $stmt = $conn->prepare("SELECT COALESCE(permiso_escritura,0) FROM roles_modulos WHERE rol_id = ? AND modulo_id = ? LIMIT 1");
            $stmt->execute([$rolId, $moduleId]);
            return (int)($stmt->fetchColumn() ?: 0) === 1;
        }
    }

    $col = "permiso_" . $perm;
    try {
        $stmt = $conn->prepare("SELECT COALESCE($col,0) FROM roles_modulos WHERE rol_id = ? AND modulo_id = ? LIMIT 1");
        $stmt->execute([$rolId, $moduleId]);
        return (int)($stmt->fetchColumn() ?: 0) === 1;
    } catch (Throwable $e) {
        if ($perm === 'crear' || $perm === 'editar') {
            $stmt = $conn->prepare("SELECT COALESCE(permiso_escritura,0) FROM roles_modulos WHERE rol_id = ? AND modulo_id = ? LIMIT 1");
            $stmt->execute([$rolId, $moduleId]);
            return (int)($stmt->fetchColumn() ?: 0) === 1;
        }
        return false;
    }
}

rbac_ensure_roles_modulos_schema($conn);
[$rolId, $rolNombre] = rbac_get_user_role($conn, $user);
$required = match ($method) {
    'GET' => 'lectura',
    'POST' => 'crear',
    'PUT' => 'editar',
    'DELETE' => 'eliminacion',
    default => 'lectura'
};
if (!rbac_can($conn, $rolId, $rolNombre, 'permisos', $required)) {
    http_response_code(403);
    echo json_encode(["message" => "Sin permisos para gestionar roles"]);
    if (isset($conn)) $conn = null;
    exit;
}

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
