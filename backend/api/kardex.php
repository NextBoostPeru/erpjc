<?php
include_once '../config/db.php';
require_once '../config/jwt.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// Auth logic
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user_data = $jwt->validateToken($token);

if (!$user_data) {
    header("HTTP/1.1 401 Unauthorized");
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'GET') {
    try {
        $productoId = $_GET['producto_id'] ?? null;
        $almacenId = $_GET['almacen_id'] ?? null;
        $fechaInicio = $_GET['fecha_inicio'] ?? null;
        $fechaFin = $_GET['fecha_fin'] ?? null;
        
        // Paginación
        $page = isset($_GET['page']) ? (int)$_GET['page'] : null;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;

        if (!$productoId) {
            if (isset($conn)) $conn = null;
            echo json_encode(['error' => 'Debe seleccionar un producto']);
            exit;
        }
        
        // Fetch current product info for header
        $stmtProd = $conn->prepare("SELECT * FROM productos WHERE id = ?");
        $stmtProd->execute([$productoId]);
        $producto = $stmtProd->fetch(PDO::FETCH_ASSOC);

        // Construcción de consulta base
        $whereSql = "k.producto_id = ?";
        $params = [$productoId];

        if ($almacenId) {
            $whereSql .= " AND k.almacen_id = ?";
            $params[] = $almacenId;
        }

        if ($fechaInicio) {
            $whereSql .= " AND k.fecha >= ?";
            $params[] = "$fechaInicio 00:00:00";
        }

        if ($fechaFin) {
            $whereSql .= " AND k.fecha <= ?";
            $params[] = "$fechaFin 23:59:59";
        }

        // Si no hay paginación, comportamiento antiguo
        if ($page === null) {
            $sql = "SELECT k.*, 
                           a.nombre as almacen_nombre,
                           m.motivo as motivo_movimiento,
                           u.usuario as usuario_nombre
                    FROM kardex k
                    LEFT JOIN almacenes a ON k.almacen_id = a.id
                    LEFT JOIN movimientos_detalles md ON k.movimiento_detalle_id = md.id
                    LEFT JOIN movimientos_inventario m ON md.movimiento_id = m.id
                    LEFT JOIN usuarios u ON m.usuario_id = u.id
                    WHERE $whereSql
                    ORDER BY k.fecha ASC, k.id ASC";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $movimientos = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $conn = null;
            echo json_encode([
                'producto' => $producto,
                'movimientos' => $movimientos
            ]);
            exit;
        }

        // Con paginación
        // 1. Contar total
        $countSql = "SELECT COUNT(*) as total FROM kardex k WHERE $whereSql";
        $stmtCount = $conn->prepare($countSql);
        $stmtCount->execute($params);
        $totalRows = $stmtCount->fetch(PDO::FETCH_ASSOC)['total'];
        $totalPages = ceil($totalRows / $limit);

        // 2. Obtener datos paginados
        $offset = ($page - 1) * $limit;
        
        $sql = "SELECT k.*, 
                       a.nombre as almacen_nombre,
                       m.motivo as motivo_movimiento,
                       u.usuario as usuario_nombre
                FROM kardex k
                LEFT JOIN almacenes a ON k.almacen_id = a.id
                LEFT JOIN movimientos_detalles md ON k.movimiento_detalle_id = md.id
                LEFT JOIN movimientos_inventario m ON md.movimiento_id = m.id
                LEFT JOIN usuarios u ON m.usuario_id = u.id
                WHERE $whereSql
                ORDER BY k.fecha ASC, k.id ASC
                LIMIT $limit OFFSET $offset";
        
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $movimientos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $conn = null;
        echo json_encode([
            'producto' => $producto,
            'movimientos' => $movimientos,
            'pagination' => [
                'total_rows' => $totalRows,
                'total_pages' => $totalPages,
                'page' => $page,
                'limit' => $limit
            ]
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
        if (isset($conn)) $conn = null;
    }
}
if (isset($conn)) $conn = null;
?>
