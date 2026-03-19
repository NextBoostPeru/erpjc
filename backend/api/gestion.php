<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

$requiredPerm = null;
switch ($action) {
    case 'list_coordinaciones':
    case 'get_coordinaciones':
    case 'get_my_companies':
    case 'get_historial':
        $requiredPerm = 'lectura';
        break;
    case 'create_coordinacion':
    case 'create_historial_entry':
        $requiredPerm = 'crear';
        break;
    case 'update_coordinacion':
        $requiredPerm = 'editar';
        break;
    case 'delete_coordinacion':
        $requiredPerm = 'eliminacion';
        break;
    case 'get_asignaciones':
    case 'get_user_companies':
    case 'assign_company':
    case 'assign_cliente':
    case 'remove_assignment':
    case 'delete_asignacion':
    case 'search_companies_to_assign':
    case 'get_users_gestion':
        $requiredPerm = 'editar';
        break;
    default:
        $requiredPerm = rbac_required_perm_for_method($method);
        break;
}

[$userId, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
function rbac_require_any(PDO $conn, $userData, array $moduleCodes, string $method, ?string $perm = null): array {
    rbac_ensure_roles_modulos_schema($conn);
    [$userId, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
    $required = $perm ?? rbac_required_perm_for_request($method);

    foreach ($moduleCodes as $code) {
        if (rbac_can($conn, (int)$rolId, (string)$rolNombre, (string)$code, $required)) {
            return [$userId, $rolId, $rolNombre, $required, $code];
        }
    }

    http_response_code(403);
    echo json_encode([
        "message" => "No tienes permiso para esta acción",
        "forbidden" => true,
        "modulo" => $moduleCodes[0] ?? '',
        "modulos" => $moduleCodes,
        "permiso" => $required
    ]);
    if (isset($conn)) $conn = null;
    exit;
}

[, $rolId, $rolNombre] = rbac_require_any($conn, $userData, ['gestion_coordinaciones', 'gestion'], $method, $requiredPerm);
$canManage =
    rbac_can($conn, (int)$rolId, (string)$rolNombre, 'gestion_coordinaciones', 'editar')
    || rbac_can($conn, (int)$rolId, (string)$rolNombre, 'gestion', 'editar');

try {
    // ==========================================
    // COORDINACIONES (CRUD)
    // ==========================================

    if ($action === 'list_coordinaciones' || $action === 'get_coordinaciones') {
        $startDate = $_GET['start_date'] ?? null;
        $endDate = $_GET['end_date'] ?? null;
        $filterUser = $_GET['usuario_id'] ?? null;
        $clienteId = $_GET['cliente_id'] ?? null;

        $sql = "SELECT c.*, cl.razon_social as cliente_razon_social, cl.razon_social as cliente_nombre, u.usuario as usuario_nombre 
                FROM gestion_coordinaciones c
                LEFT JOIN clientes cl ON c.cliente_id = cl.id
                LEFT JOIN usuarios u ON c.usuario_id = u.id
                WHERE 1=1";
        
        $params = [];
        if (!$canManage) {
            $filterUser = $userId;
        }
        if ($filterUser) {
            $sql .= " AND c.usuario_id = ?";
            $params[] = $filterUser;
        }

        if ($startDate && $endDate) {
            $sql .= " AND c.fecha BETWEEN ? AND ?";
            $params[] = $startDate . ' 00:00:00';
            $params[] = $endDate . ' 23:59:59';
        }

        if ($clienteId) {
            $sql .= " AND c.cliente_id = ?";
            $params[] = $clienteId;
        }

        $sql .= " ORDER BY c.fecha DESC LIMIT 500";

        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'create_coordinacion' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['cliente_id']) || empty($data['fecha']) || empty($data['tipo'])) {
            throw new Exception("Faltan datos obligatorios");
        }

        // Allow assigning to another user if provided, otherwise use current user
        $assignedUser = ($canManage && !empty($data['usuario_id'])) ? $data['usuario_id'] : $userId;

        $stmt = $conn->prepare("INSERT INTO gestion_coordinaciones (usuario_id, cliente_id, fecha, tipo, detalle, estado) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $assignedUser,
            $data['cliente_id'],
            $data['fecha'],
            $data['tipo'],
            $data['detalle'] ?? '',
            $data['estado'] ?? 'Completado'
        ]);

        echo json_encode(['success' => true, 'id' => $conn->lastInsertId()]);
    }

    elseif ($action === 'update_coordinacion' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['id'])) throw new Exception("ID requerido");

        if (!$canManage) {
            $stmtCheck = $conn->prepare("SELECT id FROM gestion_coordinaciones WHERE id = ? AND usuario_id = ? LIMIT 1");
            $stmtCheck->execute([$data['id'], $userId]);
            if (!$stmtCheck->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['error' => 'Acceso denegado']);
                exit;
            }
        }

        // Prepare update query
        $fields = ["fecha=?", "tipo=?", "detalle=?", "estado=?"];
        $params = [
            $data['fecha'],
            $data['tipo'],
            $data['detalle'] ?? '',
            $data['estado'] ?? 'Completado'
        ];

        // Allow updating assigned user if provided (e.g. for reassignment)
        if ($canManage && isset($data['usuario_id']) && !empty($data['usuario_id'])) {
            $fields[] = "usuario_id=?";
            $params[] = $data['usuario_id'];
        }

        $params[] = $data['id']; // ID for WHERE clause

        $sql = "UPDATE gestion_coordinaciones SET " . implode(", ", $fields) . " WHERE id=?";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);

        echo json_encode(['success' => true]);
    }

    elseif ($action === 'delete_coordinacion') {
        $id = $_GET['id'] ?? 0;
        if (!$canManage) {
            $conn->prepare("DELETE FROM gestion_coordinaciones WHERE id=? AND usuario_id=?")->execute([$id, $userId]);
        } else {
            $conn->prepare("DELETE FROM gestion_coordinaciones WHERE id=?")->execute([$id]);
        }
        echo json_encode(['success' => true]);
    }

    // ==========================================
    // ASIGNACIONES (Assignments)
    // ==========================================

    elseif ($action === 'get_asignaciones') {
        if (!$canManage) {
            http_response_code(403);
            echo json_encode(['error' => 'Acceso denegado']);
            exit;
        }
        $stmt = $conn->query("
            SELECT ga.*, u.usuario as usuario_nombre, u.nombre_real, cl.razon_social as cliente_razon_social, cl.razon_social as cliente_nombre, cl.num_doc as cliente_num_doc
            FROM gestion_asignaciones ga
            JOIN usuarios u ON ga.usuario_id = u.id
            JOIN clientes cl ON ga.cliente_id = cl.id
            ORDER BY u.usuario, cl.razon_social
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'get_my_companies') {
        // Return companies assigned to the current user
        $stmt = $conn->prepare("
            SELECT cl.id, cl.razon_social, cl.num_doc, ga.id as assignment_id
            FROM gestion_asignaciones ga
            JOIN clientes cl ON ga.cliente_id = cl.id
            WHERE ga.usuario_id = ?
            ORDER BY cl.razon_social
        ");
        $stmt->execute([$userId]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'get_user_companies') {
        if (!$canManage) {
            http_response_code(403);
            echo json_encode(['error' => 'Acceso denegado']);
            exit;
        }
        // Get companies for a specific user (for management view)
        $targetUserId = $_GET['user_id'] ?? 0;
        $stmt = $conn->prepare("
            SELECT cl.id, cl.razon_social, cl.num_doc, ga.id as assignment_id
            FROM gestion_asignaciones ga
            JOIN clientes cl ON ga.cliente_id = cl.id
            WHERE ga.usuario_id = ?
            ORDER BY cl.razon_social
        ");
        $stmt->execute([$targetUserId]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif (($action === 'assign_company' || $action === 'assign_cliente') && $_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!$canManage) {
            http_response_code(403);
            echo json_encode(['error' => 'Acceso denegado']);
            exit;
        }
        $data = json_decode(file_get_contents("php://input"), true);
        
        $targetUserId = $data['usuario_id'];
        $clienteId = $data['cliente_id'];

        if (!$targetUserId || !$clienteId) {
             throw new Exception("Usuario y Cliente son requeridos");
        }

        // Check if already assigned
        $stmtCheck = $conn->prepare("SELECT id FROM gestion_asignaciones WHERE usuario_id=? AND cliente_id=?");
        $stmtCheck->execute([$targetUserId, $clienteId]);
        if ($stmtCheck->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Already assigned']);
            exit;
        }

        $stmt = $conn->prepare("INSERT INTO gestion_asignaciones (usuario_id, cliente_id) VALUES (?, ?)");
        $stmt->execute([$targetUserId, $clienteId]);
        
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'remove_assignment' || $action === 'delete_asignacion') {
        if (!$canManage) {
            http_response_code(403);
            echo json_encode(['error' => 'Acceso denegado']);
            exit;
        }
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $_GET['id'] ?? $data['id'] ?? 0;
        $conn->prepare("DELETE FROM gestion_asignaciones WHERE id=?")->execute([$id]);
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'search_companies_to_assign') {
        if (!$canManage) {
            http_response_code(403);
            echo json_encode(['error' => 'Acceso denegado']);
            exit;
        }
        $search = $_GET['search'] ?? '';
        if (strlen($search) < 3) {
            echo json_encode([]);
            exit;
        }
        
        $stmt = $conn->prepare("SELECT id, razon_social, num_doc FROM clientes WHERE razon_social LIKE ? OR num_doc LIKE ? LIMIT 20");
        $stmt->execute(["%$search%", "%$search%"]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    // ==========================================
    // HISTORIAL COORDINACIONES
    // ==========================================

    elseif ($action === 'get_historial') {
        $coordId = $_GET['coordinacion_id'] ?? 0;
        if (!$canManage) {
            $stmtCheck = $conn->prepare("SELECT id FROM gestion_coordinaciones WHERE id = ? AND usuario_id = ? LIMIT 1");
            $stmtCheck->execute([$coordId, $userId]);
            if (!$stmtCheck->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['error' => 'Acceso denegado']);
                exit;
            }
        }
        $stmt = $conn->prepare("
            SELECT h.*, u.usuario as usuario_nombre 
            FROM gestion_historial_coordinaciones h 
            JOIN usuarios u ON h.usuario_id = u.id 
            WHERE h.coordinacion_id = ? 
            ORDER BY h.fecha_registro DESC
        ");
        $stmt->execute([$coordId]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'create_historial_entry' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['coordinacion_id']) || empty($data['detalle'])) {
            throw new Exception("Datos incompletos");
        }

        if (!$canManage) {
            $stmtCheck = $conn->prepare("SELECT id FROM gestion_coordinaciones WHERE id = ? AND usuario_id = ? LIMIT 1");
            $stmtCheck->execute([$data['coordinacion_id'], $userId]);
            if (!$stmtCheck->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['error' => 'Acceso denegado']);
                exit;
            }
        }

        $stmt = $conn->prepare("INSERT INTO gestion_historial_coordinaciones (coordinacion_id, usuario_id, detalle) VALUES (?, ?, ?)");
        $stmt->execute([
            $data['coordinacion_id'],
            $userId, // The logged-in user making the entry
            $data['detalle']
        ]);
        
        echo json_encode(['success' => true, 'id' => $conn->lastInsertId()]);
    }

    // ==========================================
    // HELPERS
    // ==========================================
    
    elseif ($action === 'get_users_gestion') {
        if (!$canManage) {
            http_response_code(403);
            echo json_encode(['error' => 'Acceso denegado']);
            exit;
        }
        $stmt = $conn->query("SELECT id, usuario, nombre_real FROM usuarios WHERE status='activo' ORDER BY usuario");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    else {
        throw new Exception("Invalid action");
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
