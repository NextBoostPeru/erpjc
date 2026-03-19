<?php
require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/AuditLogger.php';
require_once '../config/rbac.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
rbac_ensure_roles_modulos_schema($conn);
[, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
$required = rbac_required_perm_for_request($method);

if (
    !rbac_can($conn, (int)$rolId, (string)$rolNombre, 'auditoria', $required)
    && !rbac_can($conn, (int)$rolId, (string)$rolNombre, 'AUDITORIA', $required)
) {
    http_response_code(403);
    echo json_encode([
        "message" => "No tienes permiso para esta acción",
        "forbidden" => true,
        "modulo" => "auditoria",
        "permiso" => $required
    ]);
    if (isset($conn)) $conn = null;
    exit;
}

// Helper to enrich logs with user names (since JSON stores IDs)
function enrichLogsWithUsernames($logs, $conn) {
    if (empty($logs)) return [];
    
    // Extract unique user IDs
    $userIds = array_unique(array_column($logs, 'usuario_id'));
    if (empty($userIds)) return $logs;

    // Fetch usernames
    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
    $sql = "SELECT id, usuario FROM usuarios WHERE id IN ($placeholders)";
    $stmt = $conn->prepare($sql);
    $stmt->execute(array_values($userIds));
    $users = $stmt->fetchAll(PDO::FETCH_KEY_PAIR); // id => usuario

    // Attach usernames
    foreach ($logs as &$log) {
        $uid = $log['usuario_id'];
        $log['usuario'] = $users[$uid] ?? 'Desconocido';
    }
    return $logs;
}

$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'bitacora':
            $limit = $_GET['limit'] ?? 100;
            $logs = AuditLogger::getLogs('bitacora', (int)$limit);
            $logs = enrichLogsWithUsernames($logs, $conn);
            echo json_encode($logs);
            break;

        case 'accesos':
            $limit = $_GET['limit'] ?? 100;
            $logs = AuditLogger::getLogs('accesos', (int)$limit);
            $logs = enrichLogsWithUsernames($logs, $conn);
            echo json_encode($logs);
            break;

        default:
            http_response_code(400);
            echo json_encode(["message" => "Acción no válida"]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
