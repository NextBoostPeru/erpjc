<?php
require_once '../config/db.php';
header('Content-Type: application/json');

$action = $_GET['action'] ?? '';
$almacen_id = $_GET['almacen_id'] ?? null;
$fecha_inicio = $_GET['fecha_inicio'] ?? date('Y-m-01');
$fecha_fin = $_GET['fecha_fin'] ?? date('Y-m-t');

// Fix: Ensure full day coverage for DATETIME columns
if (strlen($fecha_inicio) == 10) $fecha_inicio .= ' 00:00:00';
if (strlen($fecha_fin) == 10) $fecha_fin .= ' 23:59:59';

try {
    $response = [];

    switch ($action) {
        case 'stock_actual':
            // Stock actual por almacén y producto
            $sql = "SELECT p.nombre, p.codigo_interno, a.nombre as almacen, sa.cantidad, p.precio 
                    FROM stock_almacen sa
                    JOIN productos p ON sa.producto_id = p.id
                    JOIN almacenes a ON sa.almacen_id = a.id
                    WHERE 1=1";
            if ($almacen_id) {
                $sql .= " AND sa.almacen_id = :almacen_id";
            }
            $sql .= " ORDER BY a.nombre, p.nombre";
            
            $stmt = $conn->prepare($sql);
            if ($almacen_id) $stmt->bindParam(':almacen_id', $almacen_id);
            $stmt->execute();
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'rotacion':
            // Rotación de inventario: Salidas / Stock Promedio (simplificado: Salidas totales en periodo)
            // Agrupado por producto
            $sql = "SELECT p.nombre, SUM(k.cantidad) as total_salidas
                    FROM kardex k
                    JOIN productos p ON k.producto_id = p.id
                    WHERE k.tipo_movimiento = 'salida' 
                    AND k.fecha BETWEEN :fecha_inicio AND :fecha_fin";
            
            if ($almacen_id) {
                $sql .= " AND k.almacen_id = :almacen_id";
            }
            
            $sql .= " GROUP BY p.id ORDER BY total_salidas DESC";

            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':fecha_inicio', $fecha_inicio);
            $stmt->bindParam(':fecha_fin', $fecha_fin);
            if ($almacen_id) $stmt->bindParam(':almacen_id', $almacen_id);
            $stmt->execute();
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'mas_vendidos':
            // Productos más vendidos (Top 10)
            $sql = "SELECT p.nombre, COUNT(k.id) as frecuencia, SUM(k.cantidad) as total_vendido
                    FROM kardex k
                    JOIN productos p ON k.producto_id = p.id
                    WHERE k.tipo_movimiento = 'salida' 
                    AND k.fecha BETWEEN :fecha_inicio AND :fecha_fin";
            
            if ($almacen_id) {
                $sql .= " AND k.almacen_id = :almacen_id";
            }
            
            $sql .= " GROUP BY p.id ORDER BY total_vendido DESC LIMIT 10";

            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':fecha_inicio', $fecha_inicio);
            $stmt->bindParam(':fecha_fin', $fecha_fin);
            if ($almacen_id) $stmt->bindParam(':almacen_id', $almacen_id);
            $stmt->execute();
            $response['mas_vendidos'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Menos vendidos (Bottom 10) - Solo considera productos que han tenido movimiento de salida
            // Para incluir productos sin ventas sería más complejo (LEFT JOIN)
            $sql = "SELECT p.nombre, COUNT(k.id) as frecuencia, SUM(k.cantidad) as total_vendido
                    FROM kardex k
                    JOIN productos p ON k.producto_id = p.id
                    WHERE k.tipo_movimiento = 'salida' 
                    AND k.fecha BETWEEN :fecha_inicio AND :fecha_fin";
            
            if ($almacen_id) {
                $sql .= " AND k.almacen_id = :almacen_id";
            }
            
            $sql .= " GROUP BY p.id ORDER BY total_vendido ASC LIMIT 10";
            
            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':fecha_inicio', $fecha_inicio);
            $stmt->bindParam(':fecha_fin', $fecha_fin);
            if ($almacen_id) $stmt->bindParam(':almacen_id', $almacen_id);
            $stmt->execute();
            $response['menos_vendidos'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'kardex':
            // Kardex detallado
            $sql = "SELECT k.*, p.nombre as producto, a.nombre as almacen 
                    FROM kardex k
                    JOIN productos p ON k.producto_id = p.id
                    JOIN almacenes a ON k.almacen_id = a.id
                    WHERE k.fecha BETWEEN :fecha_inicio AND :fecha_fin";
            
            if ($almacen_id) {
                $sql .= " AND k.almacen_id = :almacen_id";
            }
            
            $sql .= " ORDER BY k.fecha DESC, k.id DESC";

            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':fecha_inicio', $fecha_inicio);
            $stmt->bindParam(':fecha_fin', $fecha_fin);
            if ($almacen_id) $stmt->bindParam(':almacen_id', $almacen_id);
            $stmt->execute();
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'valorizacion':
            // Valorización por almacén
            $sql = "SELECT a.nombre as almacen, SUM(sa.cantidad * p.costo_promedio) as valor_total, COUNT(DISTINCT sa.producto_id) as total_items
                    FROM stock_almacen sa
                    JOIN productos p ON sa.producto_id = p.id
                    JOIN almacenes a ON sa.almacen_id = a.id
                    WHERE sa.cantidad > 0
                    GROUP BY a.id, a.nombre";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute();
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'alertas':
            // Alertas críticas (Stock bajo)
            // Compara stock global vs stock minimo global (ya que stock_minimo es de producto)
            // O si queremos ser más precisos por almacén, necesitaríamos stock minimo por almacén. 
            // Usaremos suma de stock_almacen vs stock_minimo del producto
            
            $sql = "SELECT p.nombre, p.stock_minimo, SUM(sa.cantidad) as stock_actual,
                    (p.stock_minimo - SUM(sa.cantidad)) as deficit
                    FROM productos p
                    LEFT JOIN stock_almacen sa ON p.id = sa.producto_id
                    GROUP BY p.id
                    HAVING stock_actual <= p.stock_minimo
                    ORDER BY deficit DESC";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute();
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        default:
            throw new Exception("Acción no válida");
    }

    $conn = null;
    echo json_encode($response);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>