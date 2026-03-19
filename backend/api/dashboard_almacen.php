<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header("Content-Type: application/json; charset=UTF-8");

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(['error' => 'Token inválido']);
    if (isset($conn)) $conn = null;
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

rbac_require_any($conn, $userData, ['dashboard_almacen', 'dashboard'], $method);

require_once 'helpers/SimpleCache.php';

try {
    $cache = new SimpleCache();
    $cacheKey = 'dashboard_almacen_stats_v2_' . date('Y-m-d_H');

    $stats = $cache->get($cacheKey, function() use ($conn) {
        $stats = [];
        $today = date('Y-m-d');

        // 1. Total Productos
        $stmt = $conn->query("SELECT COUNT(*) FROM productos");
        $stats['total_productos'] = $stmt->fetchColumn();

        // 2. Valor Total Inventario (Priorizar Costo Promedio, fallback a Precio)
        // Si el costo es 0, usamos el precio referencial para no mostrar 0
        $stmt = $conn->query("SELECT SUM(stock * CASE WHEN costo_promedio > 0 THEN costo_promedio ELSE precio END) FROM productos WHERE stock > 0");
        $stats['valor_inventario'] = $stmt->fetchColumn() ?: 0;

        // 3. Productos con Stock Bajo
        $stmt = $conn->query("SELECT COUNT(*) FROM productos WHERE stock <= stock_minimo");
        $stats['stock_bajo_count'] = $stmt->fetchColumn();

        $stmt = $conn->query("
            SELECT id, nombre, stock, stock_minimo, unidad_medida 
            FROM productos 
            WHERE stock <= stock_minimo 
            ORDER BY stock ASC 
            LIMIT 5
        ");
        $stats['lista_stock_bajo'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 4. Devoluciones Pendientes (Mock o Real)
        // Asumiendo tabla devoluciones con estado 'pendiente'
        // Si no existe tabla, devolver 0
        try {
            $stmt = $conn->query("SELECT COUNT(*) FROM devoluciones WHERE estado = 'pendiente'");
            $stats['devoluciones_pendientes'] = $stmt->fetchColumn();
        } catch (Exception $e) {
            $stats['devoluciones_pendientes'] = 0;
        }

        // 5. Últimos Movimientos
        $stmt = $conn->query("
            SELECT m.id, m.tipo as tipo, m.motivo, m.fecha, u.usuario
            FROM movimientos_inventario m
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            ORDER BY m.fecha DESC, m.id DESC
            LIMIT 5
        ");
        $stats['ultimos_movimientos'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 6. Productos más movidos (Top 5 Salidas)
        // Ajustar segun tabla de detalles de movimiento
        $stmt = $conn->query("
            SELECT p.nombre, SUM(d.cantidad) as total_salida
            FROM movimientos_detalles d
            JOIN movimientos_inventario m ON d.movimiento_id = m.id
            JOIN productos p ON d.producto_id = p.id
            WHERE m.tipo = 'salida' AND m.fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY p.id
            ORDER BY total_salida DESC
            LIMIT 5
        ");
        $stats['top_salidas'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return $stats;
    }, 300); // 5 min cache

    $conn = null;
    echo json_encode($stats);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error al cargar dashboard Almacen: " . $e->getMessage()]);
}
?>
