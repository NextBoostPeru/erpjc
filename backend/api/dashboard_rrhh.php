<?php
require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
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
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
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

rbac_require_any($conn, $userData, ['dashboard_rrhh', 'dashboard'], $method);

require_once 'helpers/SimpleCache.php';

try {
    $cache = new SimpleCache();
    $cacheKey = 'dashboard_rrhh_stats_' . date('Y-m-d_H'); // Cache por 1 hora o 5 min

    $stats = $cache->get($cacheKey, function() use ($conn) {
        $stats = [];
        $today = date('Y-m-d');

        // 1. Resumen General (KPIs)
        // Total Colaboradores Activos
        $stmt = $conn->query("SELECT COUNT(*) FROM colaboradores WHERE estado = 'Activo'");
        $stats['total_activos'] = $stmt->fetchColumn();

        // Total Colaboradores (Todos)
        $stmt = $conn->query("SELECT COUNT(*) FROM colaboradores");
        $stats['total_colaboradores'] = $stmt->fetchColumn();

        // Asistencia de Hoy
        $stmt = $conn->prepare("SELECT COUNT(DISTINCT colaborador_id) FROM asistencias WHERE fecha = ?");
        $stmt->execute([$today]);
        $stats['asistencias_hoy'] = $stmt->fetchColumn();

        // Ausentismo (Estimado: Activos - Asistentes)
        // Nota: Esto es una estimación simple. Un sistema real consideraría horarios, vacaciones, etc.
        $stats['ausentes_hoy'] = max(0, $stats['total_activos'] - $stats['asistencias_hoy']);


        // 2. EMOs Por Vencer (Próximos 30 días o ya vencidos)
        $stmt = $conn->query("
            SELECT e.*, c.nombres, c.apellidos, c.documento_numero 
            FROM emos e
            JOIN colaboradores c ON e.colaborador_id = c.id
            WHERE c.estado = 'Activo' 
            AND e.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            ORDER BY e.fecha_vencimiento ASC
            LIMIT 10
        ");
        $stats['emos_por_vencer'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stats['count_emos_vencidos'] = count($stats['emos_por_vencer']); // Solo cuenta los top 10 o todos? Mejor contar todos aparte.
        
        $stmt = $conn->query("
            SELECT COUNT(*) 
            FROM emos e
            JOIN colaboradores c ON e.colaborador_id = c.id
            WHERE c.estado = 'Activo' 
            AND e.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        ");
        $stats['total_emos_alertas'] = $stmt->fetchColumn();


        // 3. Distribución por Área
        $stmt = $conn->query("
            SELECT area, COUNT(*) as cantidad 
            FROM colaboradores 
            WHERE estado = 'Activo' AND area IS NOT NULL AND area != ''
            GROUP BY area
            ORDER BY cantidad DESC
        ");
        $stats['distribucion_area'] = $stmt->fetchAll(PDO::FETCH_ASSOC);


        // 4. Distribución por Tipo de Contrato
        $stmt = $conn->query("
            SELECT tipo_contrato, COUNT(*) as cantidad 
            FROM colaboradores 
            WHERE estado = 'Activo' AND tipo_contrato IS NOT NULL AND tipo_contrato != ''
            GROUP BY tipo_contrato
            ORDER BY cantidad DESC
        ");
        $stats['distribucion_contrato'] = $stmt->fetchAll(PDO::FETCH_ASSOC);


        // 5. Próximos Cumpleaños (Mes Actual)
        $mes_actual = date('m');
        $stmt = $conn->prepare("
            SELECT id, nombres, apellidos, fecha_nacimiento, DAY(fecha_nacimiento) as dia
            FROM colaboradores 
            WHERE estado = 'Activo' 
            AND MONTH(fecha_nacimiento) = ?
            ORDER BY dia ASC
        ");
        $stmt->execute([$mes_actual]);
        $stats['cumpleanos_mes'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        return $stats;
    }, 300); // 300 segundos = 5 minutos de cache

    $conn = null;
    echo json_encode($stats);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error al cargar dashboard RRHH: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
?>
