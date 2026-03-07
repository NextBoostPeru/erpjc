<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function ensureQuoteApproverTable($conn) {
    $conn->exec("CREATE TABLE IF NOT EXISTS cotizaciones_aprobadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        activo TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_usuario (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function hasQuoteApprovalRight($conn, $usuario_id) {
    // Gerencia always allowed
    $q = $conn->prepare("SELECT r.nombre AS rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.id = ?");
    $q->execute([$usuario_id]);
    $u = $q->fetch(PDO::FETCH_ASSOC);
    $rol = strtolower($u['rol_nombre'] ?? '');
    if (in_array($rol, ['gerente','gerencia'])) return true;
    // Else check configured approvers
    ensureQuoteApproverTable($conn);
    $stmt = $conn->prepare("SELECT COUNT(*) FROM cotizaciones_aprobadores WHERE usuario_id = ? AND activo = 1");
    $stmt->execute([$usuario_id]);
    return ((int)$stmt->fetchColumn()) > 0;
}
include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/includes/facturacion_functions.php';

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

// Convertir a array si es objeto (para compatibilidad con JWT)
$userData = (array) $userData;

// Directorio para adjuntos
$uploadDir = __DIR__ . '/../uploads/cotizaciones/';
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'approvers':
        ensureQuoteApproverTable($conn);
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $conn->query("SELECT ca.id, ca.usuario_id, u.usuario, u.nombre_real 
                                  FROM cotizaciones_aprobadores ca 
                                  LEFT JOIN usuarios u ON ca.usuario_id = u.id 
                                  WHERE ca.activo = 1 
                                  ORDER BY ca.id DESC");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $rows]);
            break;
        } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $rol = strtolower($userData['rol_nombre'] ?? '');
            if (!in_array($rol, ['gerente', 'gerencia'])) {
                http_response_code(403);
                echo json_encode(["message" => "Solo Gerencia puede configurar aprobadores"]);
                break;
            }
            $data = json_decode(file_get_contents("php://input"), true);
            $uid = $data['usuario_id'] ?? null;
            if (!$uid) {
                http_response_code(400);
                echo json_encode(["message" => "usuario_id requerido"]);
                break;
            }
            $chk = $conn->prepare("SELECT id FROM cotizaciones_aprobadores WHERE usuario_id = ? AND activo = 1");
            $chk->execute([$uid]);
            if ($chk->fetch()) {
                http_response_code(400);
                echo json_encode(["message" => "Ya está configurado"]);
                break;
            }
            $stmt = $conn->prepare("INSERT INTO cotizaciones_aprobadores (usuario_id, activo) VALUES (?, 1)");
            $stmt->execute([$uid]);
            echo json_encode(["message" => "Aprobador agregado"]);
            break;
        } elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $rol = strtolower($userData['rol_nombre'] ?? '');
            if (!in_array($rol, ['gerente', 'gerencia'])) {
                http_response_code(403);
                echo json_encode(["message" => "Solo Gerencia puede eliminar aprobadores"]);
                break;
            }
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(["message" => "ID requerido"]);
                break;
            }
            $stmt = $conn->prepare("DELETE FROM cotizaciones_aprobadores WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(["message" => "Aprobador eliminado"]);
            break;
        }
        break;
    case 'list':
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
        if ($limit < 10) $limit = 10;
        if ($limit > 500) $limit = 500;

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        if ($page < 1) $page = 1;
        $offset = ($page - 1) * $limit;

        $search = isset($_GET['search']) ? trim($_GET['search']) : '';
        $whereClause = "";
        $params = [];

        if (!empty($search)) {
            $whereClause = " WHERE (c.serie LIKE :search1 
                             OR c.correlativo LIKE :search2 
                             OR CONCAT(c.serie, '-', IF(LENGTH(c.correlativo) < 6, LPAD(c.correlativo, 6, '0'), c.correlativo)) LIKE :search3
                             OR CONCAT(c.serie, '-', c.correlativo) LIKE :search4
                             OR c.cliente_razon_social LIKE :search5 
                             OR c.cliente_num_doc LIKE :search6)";
            $searchTerm = "%$search%";
            $params[':search1'] = $searchTerm;
            $params[':search2'] = $searchTerm;
            $params[':search3'] = $searchTerm;
            $params[':search4'] = $searchTerm;
            $params[':search5'] = $searchTerm;
            $params[':search6'] = $searchTerm;
        }

        $countSql = "SELECT COUNT(*) FROM cotizaciones c $whereClause";
        $countStmt = $conn->prepare($countSql);
        foreach ($params as $key => $value) {
            $countStmt->bindValue($key, $value);
        }
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();

        $sql = "SELECT c.*, u.usuario as vendedor, u.nombre_real as asesor_nombre, u.telefono as asesor_telefono 
                FROM cotizaciones c 
                LEFT JOIN usuarios u ON c.created_by = u.id 
                $whereClause
                ORDER BY c.id DESC
                LIMIT :limit OFFSET :offset";
        
        $stmt = $conn->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode([
            'data' => $rows,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => $limit > 0 ? max(1, (int)ceil($total / $limit)) : 1
            ]
        ]);
        break;

    case 'get':
        $id = $_GET['id'] ?? 0;
        $stmt = $conn->prepare("SELECT c.*, u.usuario as vendedor, u.nombre_real as asesor_nombre, u.telefono as asesor_telefono 
                                FROM cotizaciones c 
                                LEFT JOIN usuarios u ON c.created_by = u.id 
                                WHERE c.id = ?");
        $stmt->execute([$id]);
        $cotizacion = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($cotizacion) {
            $stmtDetalle = $conn->prepare("SELECT * FROM cotizaciones_detalles WHERE cotizacion_id = ?");
            $stmtDetalle->execute([$id]);
            $cotizacion['items'] = $stmtDetalle->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($cotizacion);
        } else {
            http_response_code(404);
            echo json_encode(["message" => "Cotización no encontrada"]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'create':
        $data = json_decode(file_get_contents("php://input"), true);
        
        try {
            $conn->beginTransaction();

            // Generar Serie/Correlativo
            $serie = 'COT';
            $stmt = $conn->prepare("SELECT MAX(correlativo) as max_corr FROM cotizaciones");
            $stmt->execute();
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $correlativo = ($row['max_corr'] ?? 0) + 1;

            $sql = "INSERT INTO cotizaciones (
                serie, correlativo, fecha_emision, fecha_vencimiento,
                condicion_pago, validez_oferta,
                cliente_tipo_doc, cliente_num_doc, cliente_razon_social, cliente_direccion, cliente_email,
                cliente_nombre_contacto, cliente_telefono,
                moneda, total_gravada, total_exonerada, total_inafecta, total_igv, descuento_global, total_importe,
                estado, observaciones, created_by, condiciones_servicio
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?
            )";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                $serie, $correlativo, $data['fecha_emision'], $data['fecha_vencimiento'] ?? null,
                $data['condicion_pago'] ?? 'Contado', $data['validez_oferta'] ?? null,
                $data['cliente_tipo_doc'], $data['cliente_num_doc'], $data['cliente_razon_social'], $data['cliente_direccion'] ?? '', $data['cliente_email'] ?? '',
                $data['cliente_nombre_contacto'] ?? null, $data['cliente_telefono'] ?? null,
                $data['moneda'], $data['total_gravada'], $data['total_exonerada'] ?? 0, $data['total_inafecta'] ?? 0, $data['total_igv'], 
                $data['descuento_global'] ?? 0, 
                $data['total_importe'],
                $data['estado'] ?? 'Borrador', $data['observaciones'] ?? '', $userData['id'],
                $data['condiciones_servicio'] ?? null
            ]);
            
            $cotizacionId = $conn->lastInsertId();

            $sqlDetalle = "INSERT INTO cotizaciones_detalles (
                cotizacion_id, item_codigo, descripcion, unidad_medida, cantidad,
                valor_unitario, precio_unitario, descuento, valor_venta, igv, sub_concepto
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmtDetalle = $conn->prepare($sqlDetalle);

            foreach ($data['items'] as $item) {
                $stmtDetalle->execute([
                    $cotizacionId,
                    $item['item_codigo'] ?? '',
                    $item['descripcion'],
                    $item['unidad_medida'] ?? 'NIU',
                    $item['cantidad'],
                    $item['valor_unitario'],
                    $item['precio_unitario'],
                    $item['descuento'] ?? 0,
                    $item['valor_venta'],
                    $item['igv'],
                    $item['sub_concepto'] ?? ''
                ]);
            }

            $conn->commit();
            echo json_encode(["message" => "Cotización creada", "id" => $cotizacionId, "numero" => "$serie-" . str_pad($correlativo, 6, '0', STR_PAD_LEFT)]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al crear cotización: " . $e->getMessage()]);
        }
        break;

    case 'update':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID no proporcionado"]);
            if (isset($conn)) $conn = null;
            break;
        }

        try {
            $conn->beginTransaction();

            // Verificar estado
            $stmtCheck = $conn->prepare("SELECT estado FROM cotizaciones WHERE id = ?");
            $stmtCheck->execute([$id]);
            $current = $stmtCheck->fetch(PDO::FETCH_ASSOC);

            if (!$current) {
                throw new Exception("Cotización no encontrada");
            }

            if ($current['estado'] === 'Convertida') {
                throw new Exception("No se puede editar una cotización ya convertida a venta");
            }

            $sql = "UPDATE cotizaciones SET 
                fecha_emision = ?, fecha_vencimiento = ?,
                condicion_pago = ?, validez_oferta = ?,
                cliente_tipo_doc = ?, cliente_num_doc = ?, cliente_razon_social = ?, cliente_direccion = ?, cliente_email = ?,
                cliente_nombre_contacto = ?, cliente_telefono = ?,
                moneda = ?, total_gravada = ?, total_exonerada = ?, total_inafecta = ?, total_igv = ?, descuento_global = ?, total_importe = ?,
                observaciones = ?, condiciones_servicio = ?, estado = ?
                WHERE id = ?";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                $data['fecha_emision'], $data['fecha_vencimiento'] ?? null,
                $data['condicion_pago'] ?? 'Contado', $data['validez_oferta'] ?? null,
                $data['cliente_tipo_doc'], $data['cliente_num_doc'], $data['cliente_razon_social'], $data['cliente_direccion'] ?? '', $data['cliente_email'] ?? '',
                $data['cliente_nombre_contacto'] ?? null, $data['cliente_telefono'] ?? null,
                $data['moneda'], $data['total_gravada'], $data['total_exonerada'] ?? 0, $data['total_inafecta'] ?? 0, $data['total_igv'], 
                $data['descuento_global'] ?? 0, 
                $data['total_importe'],
                $data['observaciones'] ?? '', 
                $data['condiciones_servicio'] ?? null,
                $data['estado'] ?? $current['estado'],
                $id
            ]);

            // Eliminar detalles anteriores
            $stmtDel = $conn->prepare("DELETE FROM cotizaciones_detalles WHERE cotizacion_id = ?");
            $stmtDel->execute([$id]);

            // Insertar nuevos detalles
            $sqlDetalle = "INSERT INTO cotizaciones_detalles (
                cotizacion_id, item_codigo, descripcion, unidad_medida, cantidad,
                valor_unitario, precio_unitario, descuento, valor_venta, igv, sub_concepto
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmtDetalle = $conn->prepare($sqlDetalle);

            foreach ($data['items'] as $item) {
                $stmtDetalle->execute([
                    $id,
                    $item['item_codigo'] ?? '',
                    $item['descripcion'],
                    $item['unidad_medida'] ?? 'NIU',
                    $item['cantidad'],
                    $item['valor_unitario'],
                    $item['precio_unitario'],
                    $item['descuento'] ?? 0,
                    $item['valor_venta'],
                    $item['igv'],
                    $item['sub_concepto'] ?? ''
                ]);
            }

            $conn->commit();
            echo json_encode(["message" => "Cotización actualizada correctamente"]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al actualizar: " . $e->getMessage()]);
        }
        break;

    case 'duplicate':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID no proporcionado"]);
            if (isset($conn)) $conn = null;
            break;
        }

        try {
            $conn->beginTransaction();

            // 1. Obtener datos originales
            $stmt = $conn->prepare("SELECT * FROM cotizaciones WHERE id = ?");
            $stmt->execute([$id]);
            $original = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$original) {
                throw new Exception("Cotización original no encontrada");
            }

            // 2. Generar nuevo correlativo
            $serie = $original['serie']; 
            $stmtCorr = $conn->prepare("SELECT MAX(correlativo) as max_corr FROM cotizaciones WHERE serie = ?");
            $stmtCorr->execute([$serie]);
            $rowCorr = $stmtCorr->fetch(PDO::FETCH_ASSOC);
            $correlativo = ($rowCorr['max_corr'] ?? 0) + 1;

            // 3. Insertar nueva cabecera
            $sql = "INSERT INTO cotizaciones (
                serie, correlativo, fecha_emision, fecha_vencimiento,
                condicion_pago, validez_oferta,
                cliente_tipo_doc, cliente_num_doc, cliente_razon_social, cliente_direccion, cliente_email,
                cliente_nombre_contacto, cliente_telefono,
                moneda, total_gravada, total_exonerada, total_inafecta, total_igv, descuento_global, total_importe,
                estado, observaciones, created_by, condiciones_servicio
            ) VALUES (
                ?, ?, CURDATE(), ?,
                ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                'Borrador', ?, ?, ?
            )";

            // Calcular nueva fecha vencimiento
            $fechaVencimiento = null;
            if (!empty($original['fecha_vencimiento']) && $original['fecha_vencimiento'] != '0000-00-00') {
                $dias = (strtotime($original['fecha_vencimiento']) - strtotime($original['fecha_emision'])) / (60 * 60 * 24);
                if ($dias > 0) {
                    $fechaVencimiento = date('Y-m-d', strtotime("+$dias days"));
                }
            }
            
            // Check if descuento_global exists in original, if not default 0
            $descuentoGlobal = $original['descuento_global'] ?? 0;

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                $serie, $correlativo, $fechaVencimiento,
                $original['condicion_pago'], $original['validez_oferta'],
                $original['cliente_tipo_doc'], $original['cliente_num_doc'], $original['cliente_razon_social'], $original['cliente_direccion'], $original['cliente_email'],
                $original['cliente_nombre_contacto'] ?? null, $original['cliente_telefono'] ?? null,
                $original['moneda'], $original['total_gravada'], $original['total_exonerada'], $original['total_inafecta'], $original['total_igv'], 
                $descuentoGlobal,
                $original['total_importe'],
                $original['observaciones'], $userData['id'], $original['condiciones_servicio']
            ]);
            
            $newId = $conn->lastInsertId();

            // 4. Copiar detalles
            $stmtDetalle = $conn->prepare("SELECT * FROM cotizaciones_detalles WHERE cotizacion_id = ?");
            $stmtDetalle->execute([$id]);
            $items = $stmtDetalle->fetchAll(PDO::FETCH_ASSOC);

            $sqlInsertDet = "INSERT INTO cotizaciones_detalles (
                cotizacion_id, item_codigo, descripcion, unidad_medida, cantidad,
                valor_unitario, precio_unitario, descuento, valor_venta, igv, sub_concepto
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmtInsertDet = $conn->prepare($sqlInsertDet);

            foreach ($items as $item) {
                $stmtInsertDet->execute([
                    $newId,
                    $item['item_codigo'],
                    $item['descripcion'],
                    $item['unidad_medida'],
                    $item['cantidad'],
                    $item['valor_unitario'],
                    $item['precio_unitario'],
                    $item['descuento'],
                    $item['valor_venta'],
                    $item['igv'],
                    $item['sub_concepto'] ?? ''
                ]);
            }

            $conn->commit();
            echo json_encode([
                "message" => "Cotización duplicada exitosamente", 
                "id" => $newId, 
                "numero" => "$serie-" . str_pad($correlativo, 6, '0', STR_PAD_LEFT)
            ]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al duplicar: " . $e->getMessage()]);
        }
        break;

    case 'update_status':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'];
        $estado = $data['estado']; 
        $observacion_rechazo = $data['observacion_rechazo'] ?? null;

        if (!in_array($estado, ['Borrador', 'Enviada', 'Aprobada', 'Rechazada'])) {
            http_response_code(400);
            echo json_encode(["message" => "Estado inválido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        // Permission: only configured approvers or Gerencia can approve/rechazar
        if (in_array($estado, ['Aprobada', 'Rechazada'])) {
            $uid = (int)($userData['id'] ?? 0);
            if ($uid <= 0 || !hasQuoteApprovalRight($conn, $uid)) {
                http_response_code(403);
                echo json_encode(["message" => "No autorizado para cambiar estado a $estado"]);
                exit;
            }
        }

        if ($estado === 'Rechazada') {
            $stmt = $conn->prepare("UPDATE cotizaciones SET estado = ?, observacion_rechazo = ? WHERE id = ?");
            $stmt->execute([$estado, $observacion_rechazo, $id]);
        } else {
            $stmt = $conn->prepare("UPDATE cotizaciones SET estado = ? WHERE id = ?");
            $stmt->execute([$estado, $id]);
        }

        echo json_encode(["message" => "Estado actualizado a $estado"]);
        break;

    case 'delete':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID no proporcionado"]);
            if (isset($conn)) $conn = null;
            break;
        }

        try {
            $conn->beginTransaction();

            $stmtCheck = $conn->prepare("SELECT estado FROM cotizaciones WHERE id = ?");
            $stmtCheck->execute([$id]);
            $cot = $stmtCheck->fetch(PDO::FETCH_ASSOC);

            if (!$cot) {
                throw new Exception("Cotización no encontrada");
            }
            
            if ($cot['estado'] === 'Convertida') {
                throw new Exception("No se puede eliminar una cotización convertida");
            }

            $stmtDet = $conn->prepare("DELETE FROM cotizaciones_detalles WHERE cotizacion_id = ?");
            $stmtDet->execute([$id]);

            $stmt = $conn->prepare("DELETE FROM cotizaciones WHERE id = ?");
            $stmt->execute([$id]);

            $conn->commit();
            echo json_encode(["message" => "Cotización eliminada correctamente"]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al eliminar: " . $e->getMessage()]);
            $conn = null;
        }
        break;

    case 'convert':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'];

        try {
            $conn->beginTransaction();

            $stmt = $conn->prepare("SELECT * FROM cotizaciones WHERE id = ?");
            $stmt->execute([$id]);
            $cot = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$cot) throw new Exception("Cotización no encontrada");
            if ($cot['estado'] === 'Convertida') throw new Exception("La cotización ya fue convertida");

            $tipo_comprobante = (strlen($cot['cliente_num_doc']) == 11) ? '01' : '03'; 
            $serie_comp = ($tipo_comprobante == '01') ? 'FFF1' : 'BBB1';

            $stmtMax = $conn->prepare("SELECT MAX(correlativo) as max_corr FROM comprobantes_electronicos WHERE tipo_comprobante = ? AND serie = ?");
            $stmtMax->execute([$tipo_comprobante, $serie_comp]);
            $rowMax = $stmtMax->fetch();
            $correlativo_comp = ($rowMax['max_corr'] ?? 0) + 1;

            $condicion = $cot['condicion_pago'] ?? 'Contado';
            $fecha_vencimiento = date('Y-m-d');
            
            if (preg_match('/Crédito (\d+) días/i', $condicion, $matches)) {
                $dias = (int)$matches[1];
                $fecha_vencimiento = date('Y-m-d', strtotime("+$dias days"));
            }

            $sqlComp = "INSERT INTO comprobantes_electronicos (
                tipo_comprobante, serie, correlativo, cliente_tipo_doc, cliente_num_doc, cliente_razon_social,
                moneda, total_gravada, total_igv, total_importe, estado,
                fecha_vencimiento, condicion_pago, saldo_pendiente, estado_cobro
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, 'Generado',
                ?, ?, ?, 'Pendiente'
            )";

            $stmtComp = $conn->prepare($sqlComp);
            $stmtComp->execute([
                $tipo_comprobante, $serie_comp, $correlativo_comp,
                $cot['cliente_tipo_doc'], $cot['cliente_num_doc'], $cot['cliente_razon_social'],
                $cot['moneda'], $cot['total_gravada'], $cot['total_igv'], $cot['total_importe'],
                $fecha_vencimiento, $condicion, $cot['total_importe']
            ]);
            
            $comprobanteId = $conn->lastInsertId();

            $stmtDetalleCot = $conn->prepare("SELECT * FROM cotizaciones_detalles WHERE cotizacion_id = ?");
            $stmtDetalleCot->execute([$id]);
            $items = $stmtDetalleCot->fetchAll(PDO::FETCH_ASSOC);

            $sqlCompDet = "INSERT INTO comprobantes_electronicos_detalle (
                comprobante_id, item_codigo, descripcion, unidad_medida, cantidad,
                valor_unitario, precio_unitario, valor_venta, igv
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmtCompDet = $conn->prepare($sqlCompDet);

            foreach ($items as $item) {
                // Concatenar sub_concepto a la descripción si existe
                $descripcionCompleta = $item['descripcion'];
                if (!empty($item['sub_concepto'])) {
                    $subConceptoLines = array_filter(array_map('trim', explode("\n", $item['sub_concepto'])));
                    if (!empty($subConceptoLines)) {
                        // Agregar cada línea con viñeta
                        $descripcionCompleta .= "\n" . implode("\n", array_map(function($l) { 
                            return "• " . $l; 
                        }, $subConceptoLines));
                    }
                }

                $stmtCompDet->execute([
                    $comprobanteId, $item['item_codigo'], $descripcionCompleta, $item['unidad_medida'],
                    $item['cantidad'], $item['valor_unitario'], $item['precio_unitario'],
                    $item['valor_venta'], $item['igv']
                ]);
            }

            $conn->prepare("UPDATE cotizaciones SET estado = 'Convertida' WHERE id = ?")->execute([$id]);

            $conn->commit();

            // Enviar a Nubefact automáticamente
            $nubefactRes = enviarComprobanteNubefact($conn, $comprobanteId);

            echo json_encode([
                "message" => "Cotización convertida a venta exitosamente", 
                "comprobante_id" => $comprobanteId,
                "nubefact" => $nubefactRes
            ]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al convertir: " . $e->getMessage()]);
            $conn = null;
        }
        break;

    case 'upload_attachment':
        $id = $_POST['id'] ?? 0;
        if (isset($_FILES['archivo']) && $_FILES['archivo']['error'] === UPLOAD_ERR_OK) {
            $fileTmpPath = $_FILES['archivo']['tmp_name'];
            $fileName = $_FILES['archivo']['name'];
            $newFileName = "cot_" . $id . "_" . time() . "_" . $fileName;
            $dest_path = $uploadDir . $newFileName;
            
            if(move_uploaded_file($fileTmpPath, $dest_path)) {
                // Verify file exists
                if (!file_exists($dest_path)) {
                    http_response_code(500);
                    echo json_encode(["message" => "Error: El archivo no se guardó correctamente en disco."]);
                    break;
                }

                $dbPath = 'uploads/cotizaciones/' . $newFileName;
                $stmt = $conn->prepare("UPDATE cotizaciones SET archivo_adjunto = ? WHERE id = ?");
                $stmt->execute([$dbPath, $id]);
                
                // Generar URL pública segura
                $salt = 'NextBoostPeru_Secure_2024';
                $token = md5($id . $salt);
                // Asumimos que la URL base de la API es accesible, construimos URL relativa a la API
                // Nota: El frontend deberá anteponer la URL base si es necesario, o podemos devolver la ruta relativa al script
                $publicUrl = "view_quote.php?id=$id&token=$token";

                echo json_encode([
                    "message" => "Archivo subido exitosamente", 
                    "path" => $dbPath,
                    "public_url" => $publicUrl
                ]);
            } else {
                http_response_code(500);
                echo json_encode(["message" => "Error moviendo el archivo"]);
            }
        } else {
            http_response_code(400);
            echo json_encode(["message" => "No se subió ningún archivo o hubo un error"]);
        }
        break;

    // --- Nuevas Acciones ---

    case 'get_templates':
        $stmt = $conn->prepare("SELECT * FROM plantillas_terminos ORDER BY titulo ASC");
        $stmt->execute();
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'save_template':
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['titulo']) || empty($data['contenido'])) {
            http_response_code(400);
            echo json_encode(["message" => "Título y contenido son requeridos"]);
            $conn = null;
            break;
        }
        
        $stmt = $conn->prepare("INSERT INTO plantillas_terminos (titulo, contenido) VALUES (?, ?)");
        if ($stmt->execute([$data['titulo'], $data['contenido']])) {
            echo json_encode(["message" => "Plantilla guardada", "id" => $conn->lastInsertId()]);
        } else {
            http_response_code(500);
            echo json_encode(["message" => "Error al guardar plantilla"]);
        }
        break;
        
    case 'delete_template':
        $id = $_GET['id'] ?? 0;
        $stmt = $conn->prepare("DELETE FROM plantillas_terminos WHERE id = ?");
        if ($stmt->execute([$id])) {
            echo json_encode(["message" => "Plantilla eliminada"]);
        } else {
            http_response_code(500);
            echo json_encode(["message" => "Error al eliminar plantilla"]);
        }
        break;

    case 'send_email':
        $id = $_POST['id'] ?? null;
        $email = $_POST['email'] ?? null;
        if (!$id || !$email) {
            $json = json_decode(file_get_contents("php://input"), true);
            if (is_array($json)) {
                $id = $id ?: ($json['id'] ?? null);
                $email = $email ?: ($json['email'] ?? null);
            }
        }
        if (!$id || !$email) {
            http_response_code(400);
            echo json_encode(["message" => "ID y Email son requeridos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        // Obtener datos de cotización para el asunto
        $stmt = $conn->prepare("SELECT * FROM cotizaciones WHERE id = ?");
        $stmt->execute([$id]);
        $cot = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$cot) {
            http_response_code(404);
            echo json_encode(["message" => "Cotización no encontrada"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $numero = $cot['serie'] . '-' . str_pad($cot['correlativo'], 6, '0', STR_PAD_LEFT);
        $asunto = "Cotización $numero - " . ($cot['cliente_razon_social'] ?? 'Cliente');
        $mensaje = "Estimado cliente,\n\nAdjunto sírvase encontrar la cotización $numero.\n\nAtentamente,\nEl Equipo.";
        
        $attachmentPath = null;
        $attachmentName = "Cotizacion_$numero.pdf";

        // Si se subió el PDF
        if (isset($_FILES['pdf']) && $_FILES['pdf']['error'] === UPLOAD_ERR_OK) {
            $attachmentPath = $_FILES['pdf']['tmp_name'];
        } 
        // Si no, verificar si ya tiene archivo adjunto en BD
        else if (!empty($cot['archivo_adjunto'])) {
            $realPath = __DIR__ . '/../' . $cot['archivo_adjunto'];
            if (file_exists($realPath)) {
                $attachmentPath = $realPath;
                $attachmentName = basename($cot['archivo_adjunto']);
            }
        }

        // Intentar enviar con PHPMailer y configuración SMTP del sistema
        require_once __DIR__ . '/../vendor/autoload.php';
        $smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_email', 'smtp_from_name'];
        $stmtSettings = $conn->prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('" . implode("','", $smtpKeys) . "')");
        $stmtSettings->execute();
        $settings = $stmtSettings->fetchAll(PDO::FETCH_KEY_PAIR);

        $canSend = !empty($settings['smtp_host']) && !empty($settings['smtp_user']) && !empty($settings['smtp_pass']) && !empty($settings['smtp_port']);

        if ($canSend) {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            try {
                $mail->isSMTP();
                $mail->Host       = $settings['smtp_host'];
                $mail->SMTPAuth   = true;
                $mail->Username   = $settings['smtp_user'];
                $mail->Password   = $settings['smtp_pass'];
                $mail->SMTPSecure = $settings['smtp_secure'] ?? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
                $mail->Port       = (int)$settings['smtp_port'];

                $fromEmail = $settings['smtp_from_email'] ?: 'noreply@erp.com';
                $fromName = $settings['smtp_from_name'] ?: 'ERP Cotizaciones';
                
                $mail->setFrom($fromEmail, $fromName);
                $mail->addAddress($email);

                $mail->isHTML(true);
                $mail->Subject = $asunto;
                $bodyLines = nl2br(htmlentities($mensaje));
                $mail->Body    = "<p>{$bodyLines}</p>";

                if ($attachmentPath && file_exists($attachmentPath)) {
                    $mail->addAttachment($attachmentPath, $attachmentName);
                }

                $mail->send();

                $stmt = $conn->prepare("UPDATE cotizaciones SET estado = 'Enviada' WHERE id = ? AND estado = 'Borrador'");
                $stmt->execute([$id]);

                echo json_encode(["success" => true, "message" => "Correo enviado a $email"]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(["message" => "Error al enviar correo: " . $mail->ErrorInfo]);
            }
        } else {
            http_response_code(400);
            echo json_encode(["message" => "Falta configuración SMTP. Configure el correo en Configuración > Sistema."]);
        }
        break;
}

if (isset($conn)) $conn = null;
?>
