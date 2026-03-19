<?php
include_once '../config/db.php';
require_once '../config/jwt.php';

// Headers
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Validar JWT
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
    if (!rbac_column_exists($conn, 'roles_modulos', 'permiso_crear')) {
        $conn->exec("ALTER TABLE roles_modulos ADD COLUMN permiso_crear TINYINT(1) NOT NULL DEFAULT 0");
        try { $conn->exec("UPDATE roles_modulos SET permiso_crear = COALESCE(permiso_escritura, 0)"); } catch (Throwable $e) {}
    }
    if (!rbac_column_exists($conn, 'roles_modulos', 'permiso_editar')) {
        $conn->exec("ALTER TABLE roles_modulos ADD COLUMN permiso_editar TINYINT(1) NOT NULL DEFAULT 0");
        try { $conn->exec("UPDATE roles_modulos SET permiso_editar = COALESCE(permiso_escritura, 0)"); } catch (Throwable $e) {}
    }
}

function rbac_get_user_role(PDO $conn, $userData): array {
    $u = (array)$userData;
    $userId = isset($u['id']) ? (int)$u['id'] : 0;
    $rolId = isset($u['rol_id']) ? (int)$u['rol_id'] : 0;
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

    return [$userId, $rolId, $rolNombre];
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

function ensureModuleExists(PDO $conn, string $codigo, string $nombre, string $ruta, string $icono = ''): int {
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ? LIMIT 1");
    $stmt->execute([$codigo]);
    $id = $stmt->fetchColumn();
    if ($id) return (int)$id;

    try {
        $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$nombre, $codigo, $ruta, $icono, $nombre]);
    } catch (Throwable $e1) {
        try {
            $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES (?, ?, ?, ?)");
            $stmt->execute([$nombre, $codigo, $ruta, $icono]);
        } catch (Throwable $e2) {
            $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta) VALUES (?, ?, ?)");
            $stmt->execute([$nombre, $codigo, $ruta]);
        }
    }

    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ? LIMIT 1");
    $stmt->execute([$codigo]);
    return (int)($stmt->fetchColumn() ?: 0);
}

try {
    rbac_ensure_roles_modulos_schema($conn);
    [$userId, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
    $required = match ($method) {
        'GET' => 'lectura',
        'POST' => 'crear',
        'PUT' => 'editar',
        'DELETE' => 'eliminacion',
        default => 'lectura'
    };
    if (!rbac_can($conn, $rolId, $rolNombre, 'permisos', $required)) {
        http_response_code(403);
        echo json_encode(["message" => "Sin permisos para gestionar permisos"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    switch ($method) {
        case 'GET':
            ensureModuleExists($conn, 'alquileres', 'Alquileres', '/alquileres', 'Truck');

            // Pagination parameters
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $rol_id_filter = isset($_GET['rol_id']) && $_GET['rol_id'] !== '' ? (int)$_GET['rol_id'] : null;
            $offset = ($page - 1) * $limit;

            // 1. Logic based on filter
            if ($rol_id_filter) {
                // Show ALL modules with their assignment status for this role
                
                // Get Role Name
                $stmtRole = $conn->prepare("SELECT nombre FROM roles WHERE id = ?");
                $stmtRole->execute([$rol_id_filter]);
                $roleName = $stmtRole->fetchColumn();

                // Total count is total modules (distinct names)
                $countQuery = "SELECT COUNT(DISTINCT nombre) as total FROM modulos";
                $countStmt = $conn->prepare($countQuery);
                $countStmt->execute();
                $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];
                $totalPages = ceil($total / $limit);

                // Query: Modulos LEFT JOIN Roles_Modulos
                // Filter duplicates by grouping by module name
                $query = "
                    SELECT 
                        MAX(rm.id) as id, 
                        :rol_id as rol_id,
                        :rol_nombre as rol_nombre, 
                        MAX(m.id) as modulo_id, 
                        m.nombre as modulo_nombre, 
                        MAX(m.codigo) as modulo_codigo,
                        MAX(COALESCE(rm.permiso_lectura, 0)) as permiso_lectura, 
                        MAX(COALESCE(rm.permiso_crear, 0)) as permiso_crear,
                        MAX(COALESCE(rm.permiso_editar, 0)) as permiso_editar,
                        MAX(COALESCE(rm.permiso_escritura, 0)) as permiso_escritura, 
                        MAX(COALESCE(rm.permiso_eliminacion, 0)) as permiso_eliminacion
                    FROM modulos m
                    LEFT JOIN roles_modulos rm ON m.id = rm.modulo_id AND rm.rol_id = :rol_id_join
                    GROUP BY m.nombre
                    ORDER BY m.nombre
                    LIMIT :limit OFFSET :offset
                ";
                $stmt = $conn->prepare($query);
                $stmt->bindParam(':rol_id', $rol_id_filter, PDO::PARAM_INT);
                $stmt->bindParam(':rol_nombre', $roleName, PDO::PARAM_STR);
                $stmt->bindParam(':rol_id_join', $rol_id_filter, PDO::PARAM_INT);
                $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                $assignments = $stmt->fetchAll(PDO::FETCH_ASSOC);

            } else {
                // Show only existing assignments (Original behavior)

                $countQuery = "SELECT COUNT(*) as total FROM roles_modulos";
                $countStmt = $conn->prepare($countQuery);
                $countStmt->execute();
                $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];
                $totalPages = ceil($total / $limit);

                $query = "
                    SELECT rm.id, rm.rol_id, r.nombre as rol_nombre, 
                        rm.modulo_id, m.nombre as modulo_nombre, m.codigo as modulo_codigo,
                        rm.permiso_lectura, rm.permiso_crear, rm.permiso_editar, rm.permiso_escritura, rm.permiso_eliminacion
                    FROM roles_modulos rm
                    JOIN roles r ON rm.rol_id = r.id
                    JOIN modulos m ON rm.modulo_id = m.id
                    ORDER BY r.nombre, m.nombre
                    LIMIT :limit OFFSET :offset
                ";
                $stmt = $conn->prepare($query);
                $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                $assignments = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            // 3. Get lists for dropdowns (not paginated)
            $rolesQuery = "SELECT id, nombre FROM roles ORDER BY nombre";
            $rolesStmt = $conn->prepare($rolesQuery);
            $rolesStmt->execute();
            $roles = $rolesStmt->fetchAll(PDO::FETCH_ASSOC);

            // Get unique modules by name for the dropdown
            $modulesQuery = "SELECT MAX(id) as id, nombre, MAX(codigo) as codigo FROM modulos GROUP BY nombre ORDER BY nombre";
            $modulesStmt = $conn->prepare($modulesQuery);
            $modulesStmt->execute();
            $modules = $modulesStmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                "assignments" => $assignments,
                "roles" => $roles,
                "modules" => $modules,
                "pagination" => [
                    "total" => $total,
                    "page" => $page,
                    "limit" => $limit,
                    "totalPages" => $totalPages
                ]
            ]);
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"));

            if (empty($data->rol_id) || empty($data->modulo_id)) {
                http_response_code(400);
                echo json_encode(["message" => "Faltan datos requeridos (rol_id, modulo_id)."]);
                if (isset($conn)) $conn = null;
                exit;
            }

            // Check if exists
            $checkSql = "SELECT id FROM roles_modulos WHERE rol_id = :r AND modulo_id = :m";
            $checkStmt = $conn->prepare($checkSql);
            $checkStmt->execute([':r' => $data->rol_id, ':m' => $data->modulo_id]);
            if ($checkStmt->fetch()) {
                http_response_code(400);
                echo json_encode(["message" => "Este rol ya tiene asignado este módulo."]);
                exit;
            }

            $permLectura = isset($data->permiso_lectura) ? (int)$data->permiso_lectura : 0;
            $permEliminar = isset($data->permiso_eliminacion) ? (int)$data->permiso_eliminacion : 0;

            $permCrear = isset($data->permiso_crear) ? (int)$data->permiso_crear : null;
            $permEditar = isset($data->permiso_editar) ? (int)$data->permiso_editar : null;
            $permLegacyEscritura = isset($data->permiso_escritura) ? (int)$data->permiso_escritura : 0;

            if ($permCrear === null && $permEditar === null) {
                $permCrear = $permLegacyEscritura;
                $permEditar = $permLegacyEscritura;
            }

            $permEscritura = ($permLegacyEscritura === 1 || $permCrear === 1 || $permEditar === 1) ? 1 : 0;

            $sql = "INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_crear, permiso_editar, permiso_escritura, permiso_eliminacion) 
                    VALUES (:r, :m, :pl, :pc, :pe, :pw, :pd)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':r' => $data->rol_id,
                ':m' => $data->modulo_id,
                ':pl' => $permLectura,
                ':pc' => (int)$permCrear,
                ':pe' => (int)$permEditar,
                ':pw' => $permEscritura,
                ':pd' => $permEliminar
            ]);

            echo json_encode(["message" => "Permiso asignado correctamente."]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"));

            if (empty($data->id)) {
                http_response_code(400);
                echo json_encode(["message" => "ID requerido."]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $permLectura = isset($data->permiso_lectura) ? (int)$data->permiso_lectura : 0;
            $permEliminar = isset($data->permiso_eliminacion) ? (int)$data->permiso_eliminacion : 0;

            $permCrear = isset($data->permiso_crear) ? (int)$data->permiso_crear : null;
            $permEditar = isset($data->permiso_editar) ? (int)$data->permiso_editar : null;
            $permLegacyEscritura = isset($data->permiso_escritura) ? (int)$data->permiso_escritura : 0;

            if ($permCrear === null && $permEditar === null) {
                $permCrear = $permLegacyEscritura;
                $permEditar = $permLegacyEscritura;
            }
            $permEscritura = ($permLegacyEscritura === 1 || $permCrear === 1 || $permEditar === 1) ? 1 : 0;

            $sql = "UPDATE roles_modulos SET 
                    permiso_lectura = :pl, 
                    permiso_crear = :pc,
                    permiso_editar = :pe,
                    permiso_escritura = :pw, 
                    permiso_eliminacion = :pd 
                    WHERE id = :id";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':pl' => $permLectura,
                ':pc' => (int)$permCrear,
                ':pe' => (int)$permEditar,
                ':pw' => $permEscritura,
                ':pd' => $permEliminar,
                ':id' => $data->id
            ]);

            echo json_encode(["message" => "Permisos actualizados."]);
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(["message" => "ID requerido."]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $stmt = $conn->prepare("DELETE FROM roles_modulos WHERE id = ?");
            $stmt->execute([$id]);

            echo json_encode(["message" => "Asignación eliminada."]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
