<?php
include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

// Robust include for StockHelper
$stockHelperPath = __DIR__ . '/helpers/StockHelper.php';
if (file_exists($stockHelperPath)) {
    require_once $stockHelperPath;
}

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

// Ensure tables exist (Auto-migration)
try {
    $conn->exec("CREATE TABLE IF NOT EXISTS almacenes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        tipo VARCHAR(50) NULL,
        direccion VARCHAR(255) NULL,
        responsable_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $conn->exec("CREATE TABLE IF NOT EXISTS devoluciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo_origen ENUM('venta', 'compra') NOT NULL DEFAULT 'venta',
        referencia_id INT NULL,
        almacen_id INT NULL,
        cliente_nombre VARCHAR(255) NULL,
        cliente_doc VARCHAR(20) NULL,
        fecha_solicitud DATE NOT NULL,
        motivo VARCHAR(255) NULL,
        descripcion TEXT NULL,
        estado ENUM('pendiente', 'aprobado', 'rechazado') DEFAULT 'pendiente',
        nota_credito_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (almacen_id) REFERENCES almacenes(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    
    $conn->exec("CREATE TABLE IF NOT EXISTS devoluciones_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        devolucion_id INT NOT NULL,
        producto_id INT NULL,
        descripcion VARCHAR(255) NULL,
        cantidad DECIMAL(10,2) NOT NULL,
        precio_unitario DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        estado_producto ENUM('aprobado', 'observado', 'merma') DEFAULT 'aprobado',
        FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Exception $e) {
    // Continue
}

$action = $_GET['action'] ?? '';
$stockHelper = (class_exists('StockHelper')) ? new StockHelper($conn) : null;

// Enable error logging
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/devoluciones_error.log');

switch ($action) {
    case 'listar':
        try {
            // Filtrar por tipo si se solicita
            $tipo = $_GET['tipo'] ?? null;
            $where = "";
            $params = [];
            
            if ($tipo) {
                $where = "WHERE d.tipo_origen = ?";
                $params[] = $tipo;
            }

            $sql = "SELECT d.*, a.nombre as almacen_nombre 
                    FROM devoluciones d
                    LEFT JOIN almacenes a ON d.almacen_id = a.id
                    $where
                    ORDER BY d.fecha_solicitud DESC";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $devoluciones = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($devoluciones as &$dev) {
                $stmt = $conn->prepare("SELECT di.*, p.nombre as producto_nombre, p.codigo_interno as codigo 
                                      FROM devoluciones_items di 
                                      LEFT JOIN productos p ON di.producto_id = p.id 
                                      WHERE devolucion_id = :id");
                $stmt->execute([':id' => $dev['id']]);
                $dev['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
            
            echo json_encode($devoluciones);
        } catch (PDOException $e) {
            error_log("Devoluciones Error (Listar): " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["message" => "Error al listar: " . $e->getMessage()]);
        }
        break;

    case 'crear':
        $data = json_decode(file_get_contents("php://input"), true);
        
        try {
            $conn->beginTransaction();
            
            $sql = "INSERT INTO devoluciones (
                tipo_origen, referencia_id, almacen_id, cliente_nombre, cliente_doc, 
                fecha_solicitud, motivo, descripcion, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                $data['tipo_origen'],
                $data['referencia_id'] ?? null,
                $data['almacen_id'] ?? null,
                $data['cliente_nombre'] ?? '',
                $data['cliente_doc'] ?? '',
                date('Y-m-d'),
                $data['motivo'],
                $data['descripcion'] ?? ''
            ]);
            $devId = $conn->lastInsertId();
            
            foreach ($data['items'] as $item) {
                $sqlItem = "INSERT INTO devoluciones_items (
                    devolucion_id, producto_id, descripcion, cantidad, 
                    precio_unitario, subtotal, estado_producto
                ) VALUES (?, ?, ?, ?, ?, ?, ?)";
                
                $stmtItem = $conn->prepare($sqlItem);
                $stmtItem->execute([
                    $devId,
                    $item['producto_id'] ?? null,
                    $item['descripcion'],
                    $item['cantidad'],
                    $item['precio_unitario'] ?? 0,
                    ($item['cantidad'] * ($item['precio_unitario'] ?? 0)),
                    $item['estado_producto'] ?? 'aprobado'
                ]);
            }
            
            $conn->commit();
            echo json_encode(["message" => "Devolución registrada", "id" => $devId]);
            
        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al registrar: " . $e->getMessage()]);
        }
        break;

    case 'aprobar':
        $data = json_decode(file_get_contents("php://input"), true);
        $devId = $data['id'];
        
        try {
            $conn->beginTransaction();
            
            $stmt = $conn->prepare("SELECT * FROM devoluciones WHERE id = ?");
            $stmt->execute([$devId]);
            $dev = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$dev || $dev['estado'] != 'pendiente') {
                throw new Exception("Devolución inválida o ya procesada");
            }
            
            // Obtener items
            $stmtItems = $conn->prepare("SELECT * FROM devoluciones_items WHERE devolucion_id = ?");
            $stmtItems->execute([$devId]);
            $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);
            
            // Procesar Movimientos de Inventario
            if ($dev['almacen_id']) {
                $movItems = [];
                
                foreach ($items as $item) {
                    if (!$item['producto_id']) continue;
                    
                    // Lógica de Reversión de Stock según Tipo y Estado
                    $procesarStock = false;

                    if ($dev['tipo_origen'] === 'venta') {
                        // Devolución de Venta (Entrada al Almacén)
                        // Solo ingresan al stock los Aprobados y Observados. 
                        // Merma se considera pérdida y no suma al inventario disponible.
                        if (in_array($item['estado_producto'], ['aprobado', 'observado'])) {
                            $procesarStock = true;
                        }
                    } else {
                        // Devolución de Compra (Salida del Almacén)
                        // Siempre sale del stock, independientemente del estado (estamos devolviendo lo que tenemos)
                        $procesarStock = true;
                    }

                    if ($procesarStock) {
                        $movItems[] = [
                            'producto_id' => $item['producto_id'],
                            'cantidad' => $item['cantidad'],
                            'costo_unitario' => $item['precio_unitario']
                        ];
                    }
                }
                
                if (!empty($movItems)) {
                    $tipoMov = ($dev['tipo_origen'] === 'venta') ? 'entrada' : 'salida';
                    $motivo = "Devolución " . ucfirst($dev['tipo_origen']) . " #" . $devId;
                    
                    $datosMov = [
                        'almacen_id' => $dev['almacen_id'],
                        'usuario_id' => $userData->data->id,
                        'tipo' => $tipoMov,
                        'motivo' => $motivo,
                        'documento_referencia' => "DEV-" . $devId,
                        'items' => $movItems
                    ];
                    
                    $stockHelper->registrarMovimiento($datosMov);
                }
            }
            
            // Actualizar estado devolucion
            $conn->prepare("UPDATE devoluciones SET estado = 'aprobado' WHERE id = ?")->execute([$devId]);
            
            $conn->commit();
            echo json_encode(["message" => "Devolución aprobada y stock actualizado"]);
            
        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al aprobar: " . $e->getMessage()]);
        }
        break;
        
    case 'rechazar':
        $data = json_decode(file_get_contents("php://input"), true);
        $conn->prepare("UPDATE devoluciones SET estado = 'rechazado' WHERE id = ?")->execute([$data['id']]);
        echo json_encode(["message" => "Devolución rechazada"]);
        break;

    case 'buscar_ventas':
        $q = $_GET['q'] ?? '';
        if (strlen($q) < 2) {
            echo json_encode([]);
            exit;
        }
        
        try {
            // Buscar por Serie-Correlativo, Razón Social o Documento (RUC/DNI)
            // Solo facturas (01) y boletas (03)
            $sql = "SELECT id, tipo_comprobante, serie, correlativo, 
                           cliente_num_doc, cliente_razon_social, 
                           fecha_emision, total_importe 
                    FROM comprobantes_electronicos 
                    WHERE (CONCAT(serie, '-', correlativo) LIKE ? OR cliente_razon_social LIKE ? OR cliente_num_doc LIKE ?)
                    AND tipo_comprobante IN ('01', '03')
                    LIMIT 20";
            
            $stmt = $conn->prepare($sql);
            $term = "%$q%";
            $stmt->execute([$term, $term, $term]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error al buscar ventas: " . $e->getMessage()]);
        }
        break;

    case 'obtener_detalle_venta':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID de venta requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $sql = "SELECT d.id, d.item_codigo, d.descripcion, d.cantidad, d.precio_unitario, p.id as producto_id
                    FROM comprobantes_electronicos_detalle d
                    LEFT JOIN productos p ON (d.item_codigo <> '' AND (
                        d.item_codigo COLLATE utf8mb4_unicode_ci = p.codigo_interno COLLATE utf8mb4_unicode_ci 
                        OR 
                        d.item_codigo COLLATE utf8mb4_unicode_ci = p.codigo_barras COLLATE utf8mb4_unicode_ci
                    ))
                    WHERE d.comprobante_id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (PDOException $e) {
            error_log("Error obtener_detalle_venta: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(["message" => "Error al obtener detalles: " . $e->getMessage()]);
        }
        break;

    case 'editar':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? null;
        
        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $conn->beginTransaction();

            // Verificar estado pendiente
            $stmt = $conn->prepare("SELECT estado FROM devoluciones WHERE id = ?");
            $stmt->execute([$id]);
            $estado = $stmt->fetchColumn();

            if ($estado !== 'pendiente') {
                throw new Exception("Solo se pueden editar devoluciones pendientes");
            }

            // Actualizar cabecera
            $sql = "UPDATE devoluciones SET 
                motivo = ?, descripcion = ?
                WHERE id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                $data['motivo'],
                $data['descripcion'] ?? '',
                $id
            ]);

            // Actualizar items (Estrategia: Eliminar e insertar de nuevo para simplificar)
            // Ojo: Si ya hubiera items aprobados/observados manualmente, esto los resetearía. 
            // Pero como es estado 'pendiente', asumimos que aún no se ha procesado item por item.
            $conn->prepare("DELETE FROM devoluciones_items WHERE devolucion_id = ?")->execute([$id]);

            foreach ($data['items'] as $item) {
                $sqlItem = "INSERT INTO devoluciones_items (
                    devolucion_id, producto_id, descripcion, cantidad, 
                    precio_unitario, subtotal, estado_producto
                ) VALUES (?, ?, ?, ?, ?, ?, ?)";
                
                $stmtItem = $conn->prepare($sqlItem);
                $stmtItem->execute([
                    $id,
                    $item['producto_id'] ?? null,
                    $item['descripcion'],
                    $item['cantidad'],
                    $item['precio_unitario'] ?? 0,
                    ($item['cantidad'] * ($item['precio_unitario'] ?? 0)),
                    $item['estado_producto'] ?? 'aprobado'
                ]);
            }

            $conn->commit();
            echo json_encode(["message" => "Devolución actualizada"]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al actualizar: " . $e->getMessage()]);
        }
        break;

    case 'eliminar':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            // Verificar estado
            $stmt = $conn->prepare("SELECT estado FROM devoluciones WHERE id = ?");
            $stmt->execute([$id]);
            $estado = $stmt->fetchColumn();

            // Allow deleting if pending OR rechazado (rejected items are safe to delete as they didn't affect stock)
            if (!in_array($estado, ['pendiente', 'rechazado'])) {
                throw new Exception("Solo se pueden eliminar devoluciones pendientes o rechazadas");
            }

            // Eliminar items primero (FK cascade debería encargarse, pero por seguridad explícita)
            // Si la tabla se creó con ON DELETE CASCADE, borrar la cabecera basta. 
            // Revisando el código de creación: FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id) ON DELETE CASCADE
            // Así que solo borramos la cabecera.
            
            $stmt = $conn->prepare("DELETE FROM devoluciones WHERE id = ?");
            $stmt->execute([$id]);

            if ($stmt->rowCount() > 0) {
                echo json_encode(["message" => "Devolución eliminada"]);
            } else {
                http_response_code(404);
                echo json_encode(["message" => "Devolución no encontrada"]);
            }

        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error al eliminar: " . $e->getMessage()]);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(["message" => "Acción inválida"]);
}
if (isset($conn)) $conn = null;
?>
