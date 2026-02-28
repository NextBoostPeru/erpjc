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

try {
    switch ($method) {
        case 'GET':
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
                        rm.permiso_lectura, rm.permiso_escritura, rm.permiso_eliminacion
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

            $sql = "INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) 
                    VALUES (:r, :m, :pl, :pe, :pd)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':r' => $data->rol_id,
                ':m' => $data->modulo_id,
                ':pl' => $data->permiso_lectura ?? 0,
                ':pe' => $data->permiso_escritura ?? 0,
                ':pd' => $data->permiso_eliminacion ?? 0
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

            $sql = "UPDATE roles_modulos SET 
                    permiso_lectura = :pl, 
                    permiso_escritura = :pe, 
                    permiso_eliminacion = :pd 
                    WHERE id = :id";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':pl' => $data->permiso_lectura ?? 0,
                ':pe' => $data->permiso_escritura ?? 0,
                ':pd' => $data->permiso_eliminacion ?? 0,
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
