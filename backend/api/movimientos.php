<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

$method = $_SERVER['REQUEST_METHOD'];

// Auth logic
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user_data = $jwt->validateToken($token);

if (!$user_data) {
    if (isset($conn)) $conn = null;
    header("HTTP/1.1 401 Unauthorized");
    exit;
}

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

rbac_require_any($conn, $user_data, ['movimientos_inventario', 'movimientos'], $method);

// Función auxiliar para registrar en Kardex y actualizar Costo Promedio / FIFO
function processKardex($conn, $movimiento, $detalles) {
    foreach ($detalles as $detalle) {
        $productoId = $detalle['producto_id'];
        $cantidad = $detalle['cantidad'];
        $costoUnitario = $detalle['costo_unitario']; // Para entradas, este es el costo de compra
        $tipo = $movimiento['tipo'];
        
        // Obtener datos actuales del producto
        $stmt = $conn->prepare("SELECT stock, costo_promedio, metodo_costeo FROM productos WHERE id = ?");
        $stmt->execute([$productoId]);
        $prod = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $stockActual = $prod['stock']; // Este stock YA FUE ACTUALIZADO por updateStock antes de llamar a esta función? 
        // NO, updateStock actualiza 'productos.stock' al final. 
        // Si llamamos a processKardex DESPUÉS de updateStock, el $stockActual ya tiene la cantidad nueva.
        // Si llamamos ANTES, tiene la vieja.
        // Vamos a asumir que updateStock ya corrió, por lo que $stockActual es el saldo FINAL.
        
        // Pero para calcular el promedio ponderado necesito el stock ANTERIOR a la operación.
        // Así que mejor calculamos los valores basándonos en la operación inversa.
        
        $stockAnterior = $stockActual;
        if ($tipo === 'entrada' || ($tipo === 'transferencia' && $movimiento['almacen_destino_id'])) {
            // Si fue entrada, el stock actual ya suma la cantidad. Stock anterior era menos.
            // OJO: updateStock se llama antes en el bucle principal?
            // Revisemos el flujo principal: updateStock se llama dentro del loop de detalles.
            // Si llamamos a processKardex al final de todo, el stock en DB ya está actualizado.
            
            // Para simplificar, pasaremos el stock previo o calcularemos dentro de la lógica.
            // Mejor: hagamos la lógica de Kardex *junto* con updateStock o justo después de cada updateStock.
        }
    }
}

function registrarKardex($conn, $productoId, $almacenId, $movimientoDetalleId, $tipo, $cantidad, $costoUnitario, $documento) {
    // Obtener producto para saber costo actual y stock actual (GLOBAL)
    // NOTA: El stock en la tabla 'productos' es global. 
    // Kardex Cuantitativo y Valorizado suele ser global para el Costo Promedio.
    
    $stmt = $conn->prepare("SELECT stock, costo_promedio, metodo_costeo FROM productos WHERE id = ?");
    $stmt->execute([$productoId]);
    $prod = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $stockGlobal = $prod['stock']; // Stock actual en DB
    $costoPromedio = $prod['costo_promedio'];
    $nuevoCosto = $costoPromedio;
    
    // Calcular nuevos valores
    if ($tipo === 'entrada') {
        // Promedio Ponderado: (StockAnt * CostoAnt + Cant * CostoEnt) / (StockAnt + Cant)
        // El stockGlobal en DB *ya debería* incluir la cantidad si updateStock se ejecutó antes?
        // En mi implementación anterior, updateStock actualiza stock_almacen y luego productos.stock.
        // Si llamo a registrarKardex DESPUÉS de updateStock, $stockGlobal es el FINAL.
        
        // Recuperar Stock Anterior
        $stockAnterior = $stockGlobal - $cantidad;
        
        if ($stockGlobal > 0) {
            $nuevoCosto = (($stockAnterior * $costoPromedio) + ($cantidad * $costoUnitario)) / $stockGlobal;
        } else {
            $nuevoCosto = $costoUnitario;
        }
        
        // Actualizar costo en producto
        $stmtUpd = $conn->prepare("UPDATE productos SET costo_promedio = ? WHERE id = ?");
        $stmtUpd->execute([$nuevoCosto, $productoId]);
        
    } elseif ($tipo === 'salida') {
        // En salida, el costo unitario de la transacción es el Costo Promedio actual
        $costoUnitario = $costoPromedio; 
        // El nuevo costo promedio NO cambia en salida (matemáticamente se mantiene)
        $nuevoCosto = $costoPromedio;
        
        // Stock final ya es $stockGlobal (que disminuyó)
    } elseif ($tipo === 'transferencia') {
        // Transferencia no cambia costo promedio global, pero genera movimientos en Kardex
        // Entrada en destino, Salida en origen
        // Se manejará como dos llamadas a esta función
        $costoUnitario = $costoPromedio;
    }
    
    // Insertar en Kardex
    $sql = "INSERT INTO kardex (
        producto_id, almacen_id, movimiento_detalle_id, tipo_movimiento, documento_referencia,
        cantidad, costo_unitario,
        saldo_cantidad, saldo_costo_unitario, saldo_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        $productoId, 
        $almacenId, 
        $movimientoDetalleId, 
        $tipo, 
        $documento,
        $cantidad, 
        $costoUnitario,
        $stockGlobal, // Saldo Cantidad (Global) -> Ojo: Kardex usually tracks Global Stock for Average Cost
        $nuevoCosto, 
        $stockGlobal * $nuevoCosto
    ]);
}

// Función auxiliar para actualizar stock
function updateStock($conn, $almacenId, $productoId, $cantidad, $operacion) {
    // Verificar si existe el registro de stock
    $stmt = $conn->prepare("SELECT cantidad FROM stock_almacen WHERE almacen_id = ? AND producto_id = ?");
    $stmt->execute([$almacenId, $productoId]);
    $currentStock = $stmt->fetchColumn();

    if ($currentStock === false) {
        if ($operacion === 'resta' && $cantidad > 0) {
             // Si no existe y queremos restar, asumimos 0 y permitimos negativo o lanzamos error. 
             // Permitiremos negativo temporalmente o lanzaremos error según regla de negocio.
             // Aquí crearemos el registro con valor negativo.
             $newStock = -$cantidad;
        } else {
             $newStock = $cantidad;
        }
        $stmt = $conn->prepare("INSERT INTO stock_almacen (almacen_id, producto_id, cantidad) VALUES (?, ?, ?)");
        $stmt->execute([$almacenId, $productoId, $newStock]);
    } else {
        if ($operacion === 'suma') {
            $newStock = $currentStock + $cantidad;
        } else {
            $newStock = $currentStock - $cantidad;
        }
        $stmt = $conn->prepare("UPDATE stock_almacen SET cantidad = ? WHERE almacen_id = ? AND producto_id = ?");
        $stmt->execute([$newStock, $almacenId, $productoId]);
    }
    
    // Actualizar stock global en tabla productos (cache)
    $stmt = $conn->prepare("UPDATE productos SET stock = (SELECT SUM(cantidad) FROM stock_almacen WHERE producto_id = ?) WHERE id = ?");
    $stmt->execute([$productoId, $productoId]);
}

if ($method === 'GET') {
    try {
        if (isset($_GET['id'])) {
            // Obtener detalle de un movimiento
            $stmt = $conn->prepare("
                SELECT m.*, 
                       u.usuario as usuario_nombre,
                       ao.nombre as almacen_origen_nombre,
                       ad.nombre as almacen_destino_nombre
                FROM movimientos_inventario m
                LEFT JOIN usuarios u ON m.usuario_id = u.id
                LEFT JOIN almacenes ao ON m.almacen_origen_id = ao.id
                LEFT JOIN almacenes ad ON m.almacen_destino_id = ad.id
                WHERE m.id = ?
            ");
            $stmt->execute([$_GET['id']]);
            $movimiento = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($movimiento) {
                $stmt = $conn->prepare("
                    SELECT md.*, p.nombre as producto_nombre, p.codigo_interno
                    FROM movimientos_detalles md
                    JOIN productos p ON md.producto_id = p.id
                    WHERE md.movimiento_id = ?
                ");
                $stmt->execute([$_GET['id']]);
                $movimiento['detalles'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
            
            echo json_encode($movimiento);
            
        } else {
            // Listar movimientos
            $page = isset($_GET['page']) ? (int)$_GET['page'] : null;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
            $search = isset($_GET['search']) ? $_GET['search'] : '';
            
            $where = [];
            $params = [];
            
            if ($search) {
                $where[] = "(m.documento_referencia LIKE :search OR u.usuario LIKE :search OR ao.nombre LIKE :search OR ad.nombre LIKE :search OR m.id LIKE :search)";
                $params[':search'] = "%$search%";
            }
            
            $whereSql = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";

            if ($page) {
                // Conteo total para paginación
                $countSql = "SELECT COUNT(*) 
                             FROM movimientos_inventario m
                             LEFT JOIN usuarios u ON m.usuario_id = u.id
                             LEFT JOIN almacenes ao ON m.almacen_origen_id = ao.id
                             LEFT JOIN almacenes ad ON m.almacen_destino_id = ad.id
                             $whereSql";
                $stmtCount = $conn->prepare($countSql);
                $stmtCount->execute($params);
                $total = $stmtCount->fetchColumn();
                
                $offset = ($page - 1) * $limit;
                
                $sql = "
                    SELECT m.*, 
                           u.usuario as usuario_nombre,
                           ao.nombre as almacen_origen_nombre,
                           ad.nombre as almacen_destino_nombre
                    FROM movimientos_inventario m
                    LEFT JOIN usuarios u ON m.usuario_id = u.id
                    LEFT JOIN almacenes ao ON m.almacen_origen_id = ao.id
                    LEFT JOIN almacenes ad ON m.almacen_destino_id = ad.id
                    $whereSql
                    ORDER BY m.fecha DESC, m.id DESC
                    LIMIT :limit OFFSET :offset
                ";
                
                $stmt = $conn->prepare($sql);
                foreach ($params as $k => $v) $stmt->bindValue($k, $v);
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $conn = null;
                echo json_encode([
                    'data' => $data,
                    'pagination' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'total_pages' => ceil($total / $limit)
                    ]
                ]);
            } else {
                $sql = "
                    SELECT m.*, 
                           u.usuario as usuario_nombre,
                           ao.nombre as almacen_origen_nombre,
                           ad.nombre as almacen_destino_nombre
                    FROM movimientos_inventario m
                    LEFT JOIN usuarios u ON m.usuario_id = u.id
                    LEFT JOIN almacenes ao ON m.almacen_origen_id = ao.id
                    LEFT JOIN almacenes ad ON m.almacen_destino_id = ad.id
                    $whereSql
                    ORDER BY m.fecha DESC, m.id DESC
                    LIMIT 1000
                ";
                $stmt = $conn->prepare($sql);
                $stmt->execute($params);
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $conn = null;
                echo json_encode($data);
            }
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'POST') {
    // Crear nuevo movimiento
    $data = json_decode(file_get_contents("php://input"), true);
    
    // Validaciones básicas
    if (!isset($data['tipo']) || !isset($data['motivo']) || !isset($data['detalles']) || empty($data['detalles'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Faltan datos requeridos (tipo, motivo, detalles)']);
        if (isset($conn)) $conn = null;
        exit;
    }

    // Validar almacenes según tipo
    if ($data['tipo'] === 'entrada' && empty($data['almacen_destino_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Almacén destino requerido para Entradas']);
        if (isset($conn)) $conn = null;
        exit;
    }
    if ($data['tipo'] === 'salida' && empty($data['almacen_origen_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Almacén origen requerido para Salidas']);
        if (isset($conn)) $conn = null;
        exit;
    }
    if ($data['tipo'] === 'transferencia' && (empty($data['almacen_origen_id']) || empty($data['almacen_destino_id']))) {
        http_response_code(400);
        echo json_encode(['error' => 'Almacén origen y destino requeridos para Transferencias']);
        exit;
    }

    try {
        $conn->beginTransaction();

        $stmt = $conn->prepare("INSERT INTO movimientos_inventario (
            tipo, motivo, almacen_origen_id, almacen_destino_id, 
            fecha, estado, documento_referencia, observacion, usuario_id
        ) VALUES (?, ?, ?, ?, NOW(), 'pendiente', ?, ?, ?)");
        
        $stmt->execute([
            $data['tipo'],
            $data['motivo'],
            !empty($data['almacen_origen_id']) ? $data['almacen_origen_id'] : null,
            !empty($data['almacen_destino_id']) ? $data['almacen_destino_id'] : null,
            $data['documento_referencia'] ?? null,
            $data['observacion'] ?? null,
            $user_data->id
        ]);
        
        $movimientoId = $conn->lastInsertId();

        $stmtDetalle = $conn->prepare("INSERT INTO movimientos_detalles (movimiento_id, producto_id, cantidad, costo_unitario) VALUES (?, ?, ?, ?)");
        
        foreach ($data['detalles'] as $detalle) {
            $stmtDetalle->execute([
                $movimientoId,
                $detalle['producto_id'],
                $detalle['cantidad'],
                $detalle['costo_unitario'] ?? 0
            ]);
        }

        $conn->commit();
        echo json_encode(['message' => 'Movimiento creado exitosamente', 'id' => $movimientoId]);

    } catch (PDOException $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
        if (isset($conn)) $conn = null;
    }
} elseif ($method === 'PUT') {
    // Confirmar, Anular o Editar movimiento
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'ID requerido']);
        if (isset($conn)) $conn = null;
        exit;
    }

    $movimientoId = $_GET['id'];

    // Caso 1: Cambio de Estado (Confirmar/Anular)
    if (isset($data['estado'])) {
        $nuevoEstado = $data['estado'];
        
        if (!in_array($nuevoEstado, ['confirmado', 'anulado'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Estado inválido']);
            if (isset($conn)) $conn = null;
            exit;
        }
    
        try {
            $conn->beginTransaction();
            
            // Obtener estado actual y datos del movimiento
            $stmt = $conn->prepare("SELECT * FROM movimientos_inventario WHERE id = ? FOR UPDATE");
            $stmt->execute([$movimientoId]);
            $movimiento = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$movimiento) {
                throw new Exception("Movimiento no encontrado");
            }
            
            if ($movimiento['estado'] !== 'pendiente') {
                throw new Exception("Solo se pueden cambiar movimientos en estado pendiente");
            }
            
            // Obtener detalles
            $stmt = $conn->prepare("SELECT * FROM movimientos_detalles WHERE movimiento_id = ?");
            $stmt->execute([$movimientoId]);
            $detalles = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            if ($nuevoEstado === 'confirmado') {
                // Aplicar cambios al stock
                foreach ($detalles as $detalle) {
                    if ($movimiento['tipo'] === 'entrada') {
                        updateStock($conn, $movimiento['almacen_destino_id'], $detalle['producto_id'], $detalle['cantidad'], 'suma');
                        registrarKardex($conn, $detalle['producto_id'], $movimiento['almacen_destino_id'], $detalle['id'], 'entrada', $detalle['cantidad'], $detalle['costo_unitario'], $movimiento['documento_referencia']);
                    } elseif ($movimiento['tipo'] === 'salida') {
                        updateStock($conn, $movimiento['almacen_origen_id'], $detalle['producto_id'], $detalle['cantidad'], 'resta');
                        registrarKardex($conn, $detalle['producto_id'], $movimiento['almacen_origen_id'], $detalle['id'], 'salida', $detalle['cantidad'], 0, $movimiento['documento_referencia']);
                    } elseif ($movimiento['tipo'] === 'transferencia') {
                        updateStock($conn, $movimiento['almacen_origen_id'], $detalle['producto_id'], $detalle['cantidad'], 'resta');
                        registrarKardex($conn, $detalle['producto_id'], $movimiento['almacen_origen_id'], $detalle['id'], 'salida', $detalle['cantidad'], 0, $movimiento['documento_referencia']); // Salida de origen
                        
                        updateStock($conn, $movimiento['almacen_destino_id'], $detalle['producto_id'], $detalle['cantidad'], 'suma');
                        registrarKardex($conn, $detalle['producto_id'], $movimiento['almacen_destino_id'], $detalle['id'], 'entrada', $detalle['cantidad'], 0, $movimiento['documento_referencia']); // Entrada a destino
                    }
                }
            }
            
            // Actualizar estado
            $stmt = $conn->prepare("UPDATE movimientos_inventario SET estado = ? WHERE id = ?");
            $stmt->execute([$nuevoEstado, $movimientoId]);
            
            $conn->commit();
            echo json_encode(['message' => "Movimiento $nuevoEstado exitosamente"]);
    
        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    } 
    // Caso 2: Edición de datos (Solo si está pendiente)
    else {
        // Validaciones básicas para edición
        if (!isset($data['tipo']) || !isset($data['motivo']) || !isset($data['detalles']) || empty($data['detalles'])) {
            http_response_code(400);
            $conn = null;
            echo json_encode(['error' => 'Faltan datos requeridos para editar']);
            exit;
        }

        try {
            $conn->beginTransaction();

            // Verificar estado actual
            $stmt = $conn->prepare("SELECT estado FROM movimientos_inventario WHERE id = ?");
            $stmt->execute([$movimientoId]);
            $currentStatus = $stmt->fetchColumn();

            if (!$currentStatus) {
                throw new Exception("Movimiento no encontrado");
            }
            if ($currentStatus !== 'pendiente') {
                throw new Exception("Solo se pueden editar movimientos pendientes");
            }

            // Actualizar cabecera
            $stmt = $conn->prepare("UPDATE movimientos_inventario SET 
                tipo = ?, motivo = ?, almacen_origen_id = ?, almacen_destino_id = ?, 
                documento_referencia = ?, observacion = ?
                WHERE id = ?");
            
            $stmt->execute([
                $data['tipo'],
                $data['motivo'],
                !empty($data['almacen_origen_id']) ? $data['almacen_origen_id'] : null,
                !empty($data['almacen_destino_id']) ? $data['almacen_destino_id'] : null,
                $data['documento_referencia'] ?? null,
                $data['observacion'] ?? null,
                $movimientoId
            ]);

            // Actualizar detalles: Borrar anteriores e insertar nuevos
            $stmt = $conn->prepare("DELETE FROM movimientos_detalles WHERE movimiento_id = ?");
            $stmt->execute([$movimientoId]);

            $stmtDetalle = $conn->prepare("INSERT INTO movimientos_detalles (movimiento_id, producto_id, cantidad, costo_unitario) VALUES (?, ?, ?, ?)");
            
            foreach ($data['detalles'] as $detalle) {
                $stmtDetalle->execute([
                    $movimientoId,
                    $detalle['producto_id'],
                    $detalle['cantidad'],
                    $detalle['costo_unitario'] ?? 0
                ]);
            }

            $conn->commit();
            echo json_encode(['message' => 'Movimiento actualizado exitosamente']);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
    }
} elseif ($method === 'DELETE') {
    // Eliminar movimiento (Solo si está pendiente)
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'ID requerido']);
        if (isset($conn)) $conn = null;
        exit;
    }

    $movimientoId = $_GET['id'];

    try {
        $conn->beginTransaction();

        // Verificar estado
        $stmt = $conn->prepare("SELECT estado FROM movimientos_inventario WHERE id = ?");
        $stmt->execute([$movimientoId]);
        $estado = $stmt->fetchColumn();

        if (!$estado) {
            throw new Exception("Movimiento no encontrado");
        }
        if ($estado !== 'pendiente') {
            throw new Exception("Solo se pueden eliminar movimientos pendientes");
        }

        // Eliminar detalles primero (aunque ON DELETE CASCADE podría manejarlo, mejor ser explícito o seguro)
        $stmt = $conn->prepare("DELETE FROM movimientos_detalles WHERE movimiento_id = ?");
        $stmt->execute([$movimientoId]);

        // Eliminar cabecera
        $stmt = $conn->prepare("DELETE FROM movimientos_inventario WHERE id = ?");
        $stmt->execute([$movimientoId]);

        $conn->commit();
        echo json_encode(['message' => 'Movimiento eliminado exitosamente']);

    } catch (Exception $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
        if (isset($conn)) $conn = null;
    }
}
if (isset($conn)) $conn = null;
?>
