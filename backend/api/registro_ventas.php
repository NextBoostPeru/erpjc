<?php
include_once '../config/db.php';
require_once '../config/jwt.php';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$action = $_GET['action'] ?? '';

function handleFileUpload($file, $prefix) {
    if (!isset($file) || $file['error'] !== UPLOAD_ERR_OK) {
        return null;
    }
    $targetDir = __DIR__ . '/uploads/ventas/';
    if (!file_exists($targetDir)) {
        mkdir($targetDir, 0777, true);
    }
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = $prefix . '_' . uniqid() . '.' . $ext;
    $targetPath = $targetDir . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $targetPath)) {
        return 'uploads/ventas/' . $filename;
    }
    return null;
}

function normalizeUploadFiles($fileField) {
    if (!isset($fileField['name'])) {
        return [];
    }
    if (!is_array($fileField['name'])) {
        return [$fileField];
    }
    $files = [];
    foreach ($fileField['name'] as $index => $name) {
        if ($fileField['error'][$index] !== UPLOAD_ERR_OK) {
            continue;
        }
        $files[] = [
            'name' => $name,
            'type' => $fileField['type'][$index],
            'tmp_name' => $fileField['tmp_name'][$index],
            'error' => $fileField['error'][$index],
            'size' => $fileField['size'][$index]
        ];
    }
    return $files;
}

switch ($action) {
    case 'listar':
        $mes = $_GET['mes'] ?? date('m');
        $anio = $_GET['anio'] ?? date('Y');
        $page = isset($_GET['page']) ? (int)$_GET['page'] : null;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $search = $_GET['search'] ?? '';

        // Optimize: Use BETWEEN for date range to use index
        $startDate = "$anio-$mes-01";
        $endDate = date("Y-m-t", strtotime($startDate));

        $where = ["fecha_emision BETWEEN :start AND :end"];
        $params = [':start' => $startDate, ':end' => $endDate];

        if ($search) {
            $where[] = "(cliente_razon_social LIKE :search OR cliente_num_doc LIKE :search OR serie LIKE :search OR correlativo LIKE :search)";
            $params[':search'] = "%$search%";
        }

        $whereSql = implode(" AND ", $where);

        if ($page) {
            $offset = ($page - 1) * $limit;
            
            // Count and Summary
            $countSql = "SELECT COUNT(*) as total_rows,
                                COUNT(CASE WHEN estado != 'Anulado' THEN 1 END) as total_activos,
                                SUM(CASE WHEN estado != 'Anulado' THEN total_importe ELSE 0 END) as total_ventas,
                                SUM(CASE WHEN estado != 'Anulado' THEN total_igv ELSE 0 END) as total_igv
                         FROM comprobantes_electronicos WHERE $whereSql";
            $stmtCount = $conn->prepare($countSql);
            $stmtCount->execute($params);
            $summary = $stmtCount->fetch(PDO::FETCH_ASSOC);

            // Daily Sales for Chart
            $chartSql = "SELECT DATE(fecha_emision) as fecha, SUM(total_importe) as total 
                         FROM comprobantes_electronicos 
                         WHERE $whereSql AND estado != 'Anulado'
                         GROUP BY DATE(fecha_emision) 
                         ORDER BY fecha ASC";
            $stmtChart = $conn->prepare($chartSql);
            $stmtChart->execute($params);
            $dailySales = $stmtChart->fetchAll(PDO::FETCH_ASSOC);
            
            $total = $summary['total_rows'];
            
            // Data
            $sql = "SELECT * FROM comprobantes_electronicos 
                    WHERE $whereSql 
                    ORDER BY fecha_emision DESC, correlativo DESC
                    LIMIT :limit OFFSET :offset";
            $stmt = $conn->prepare($sql);
            foreach($params as $k => $v) $stmt->bindValue($k, $v);
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
                ],
                'summary' => [
                    'total_ventas' => $summary['total_ventas'] ?? 0,
                    'total_igv' => $summary['total_igv'] ?? 0,
                    'total_registros' => $summary['total_activos'],
                    'daily_sales' => $dailySales
                ]
            ]);
        } else {
            // Optimized: Limit 5000 for monthly dump to prevent memory exhaustion
            $sql = "SELECT * FROM comprobantes_electronicos 
                    WHERE $whereSql 
                    ORDER BY fecha_emision DESC, correlativo DESC
                    LIMIT 5000";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $conn = null;
            echo json_encode($data);
        }
        break;

    case 'crear_manual':
        $data = json_decode(file_get_contents("php://input"), true);
        
        try {
            $conn->beginTransaction();
            
            // Validar duplicados
            $stmt = $conn->prepare("SELECT id FROM comprobantes_electronicos WHERE tipo_comprobante = :tipo AND serie = :serie AND correlativo = :corr");
            $stmt->execute([
                ':tipo' => $data['tipo_comprobante'],
                ':serie' => $data['serie'],
                ':corr' => $data['correlativo']
            ]);
            if ($stmt->fetch()) {
                throw new Exception("El comprobante ya existe");
            }

            // Datos complementarios
            $condicion = $data['condicion_pago'] ?? 'Contado';
            
            $sql = "INSERT INTO comprobantes_electronicos (
                tipo_comprobante, serie, correlativo, cliente_tipo_doc, cliente_num_doc, cliente_razon_social,
                moneda, tipo_cambio, total_gravada, total_exonerada, total_inafecta, total_igv, total_importe, 
                fecha_emision, estado, modo_registro, condicion_pago,
                ref_fecha_emision, ref_tipo_comprobante, ref_serie, ref_numero
            ) VALUES (
                :tipo, :serie, :corr, :ctipo, :cnum, :crazon,
                :moneda, :tc, :gravada, :exonerada, :inafecta, :igv, :importe, 
                :fecha, 'Aceptado', 'manual', :cond,
                :ref_fecha, :ref_tipo, :ref_serie, :ref_num
            )";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':tipo' => $data['tipo_comprobante'],
                ':serie' => $data['serie'],
                ':corr' => $data['correlativo'],
                ':ctipo' => $data['cliente_tipo_doc'],
                ':cnum' => $data['cliente_num_doc'],
                ':crazon' => $data['cliente_razon_social'],
                ':moneda' => $data['moneda'],
                ':tc' => $data['tipo_cambio'] ?? 1.000,
                ':gravada' => $data['total_gravada'] ?? 0,
                ':exonerada' => $data['total_exonerada'] ?? 0,
                ':inafecta' => $data['total_inafecta'] ?? 0,
                ':igv' => $data['total_igv'] ?? 0,
                ':importe' => $data['total_importe'],
                ':fecha' => $data['fecha_emision'] ?? date('Y-m-d'),
                ':cond' => $condicion,
                ':ref_fecha' => !empty($data['ref_fecha_emision']) ? $data['ref_fecha_emision'] : null,
                ':ref_tipo' => !empty($data['ref_tipo_comprobante']) ? $data['ref_tipo_comprobante'] : null,
                ':ref_serie' => $data['ref_serie'] ?? null,
                ':ref_num' => $data['ref_numero'] ?? null
            ]);
            
            // --- CONTABILIDAD AUTOMÁTICA ---
            $glosa = "Venta {$data['serie']}-{$data['correlativo']} {$data['cliente_razon_social']}";
            
            $stmtAsiento = $conn->prepare("INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, tipo_cambio, estado, usuario_id) VALUES (:fecha, :glosa, 'Venta', :moneda, :tc, 'Finalizado', :uid)");
            $stmtAsiento->execute([
                ':fecha' => $data['fecha_emision'],
                ':glosa' => $glosa,
                ':moneda' => $data['moneda'],
                ':tc' => $data['tipo_cambio'] ?? 1.0,
                ':uid' => $userData->id ?? null
            ]);
            $asientoId = $conn->lastInsertId();
            
            // Actualizar referencia al asiento en comprobante (si existe columna, opcional pero recomendado)
            // $conn->prepare("UPDATE comprobantes_electronicos SET asiento_id = ? WHERE id = ?")->execute([$asientoId, $conn->lastInsertId()]);
            
            $stmtDetalle = $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)");
            
            // 1. Cuentas por Cobrar (121) -> Debe (Total)
            $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '121', ':debe' => $data['total_importe'], ':haber' => 0]);
            
            // 2. IGV (4011) -> Haber
            $igvTotal = $data['total_igv'] ?? 0;
            if ($igvTotal > 0) {
                $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '4011', ':debe' => 0, ':haber' => $igvTotal]);
            }
            
            // 3. Ventas (701) -> Haber (Base Imponible)
            $baseTotal = ($data['total_gravada'] ?? 0) + ($data['total_exonerada'] ?? 0) + ($data['total_inafecta'] ?? 0);
            if ($baseTotal > 0) {
                $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '701', ':debe' => 0, ':haber' => $baseTotal]);
            }
            
            $conn->commit();
            echo json_encode(["message" => "Venta manual registrada y contabilizada correctamente"]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'editar_manual':
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) {
            $data = $_POST;
        }
        $id = $data['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $conn->beginTransaction();

            // Verificar si existe y es manual
            $stmt = $conn->prepare("SELECT modo_registro, estado, serie, correlativo, cliente_razon_social, archivo_pago, archivo_detraccion FROM comprobantes_electronicos WHERE id = ?");
            $stmt->execute([$id]);
            $oldData = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$oldData) throw new Exception("Registro no encontrado");
            if ($oldData['modo_registro'] !== 'manual') throw new Exception("Solo se pueden editar registros manuales");
            if ($oldData['estado'] === 'Anulado') throw new Exception("No se puede editar un registro anulado");

            // Verificar duplicados (excluyendo el actual)
            $stmt = $conn->prepare("SELECT id FROM comprobantes_electronicos WHERE tipo_comprobante = :tipo AND serie = :serie AND correlativo = :corr AND id != :id");
            $stmt->execute([
                ':tipo' => $data['tipo_comprobante'],
                ':serie' => $data['serie'],
                ':corr' => $data['correlativo'],
                ':id' => $id
            ]);
            if ($stmt->fetch()) {
                throw new Exception("Ya existe otro comprobante con esa serie y correlativo");
            }

            $archivo_pago = $oldData['archivo_pago'];
            if (isset($_FILES['archivo_pago'])) {
                $nuevoPago = handleFileUpload($_FILES['archivo_pago'], 'pago');
                if ($nuevoPago) {
                    if ($archivo_pago) {
                        $archivo_pago .= '|' . $nuevoPago;
                    } else {
                        $archivo_pago = $nuevoPago;
                    }
                }
            }
            
            $archivo_detraccion = $oldData['archivo_detraccion'];
            if (isset($_FILES['archivo_detraccion'])) {
                $nuevoDet = handleFileUpload($_FILES['archivo_detraccion'], 'detraccion');
                if ($nuevoDet) {
                    if ($archivo_detraccion) {
                        $archivo_detraccion .= '|' . $nuevoDet;
                    } else {
                        $archivo_detraccion = $nuevoDet;
                    }
                }
            }

            // Datos complementarios
            $condicion = $data['condicion_pago'] ?? 'Contado';

            $sql = "UPDATE comprobantes_electronicos SET 
                tipo_comprobante = :tipo, 
                serie = :serie, 
                correlativo = :corr, 
                cliente_tipo_doc = :ctipo, 
                cliente_num_doc = :cnum, 
                cliente_razon_social = :crazon,
                moneda = :moneda, 
                tipo_cambio = :tc,
                total_gravada = :gravada, 
                total_exonerada = :exonerada, 
                total_inafecta = :inafecta, 
                total_igv = :igv, 
                total_importe = :importe, 
                fecha_emision = :fecha,
                condicion_pago = :cond,
                ref_fecha_emision = :ref_fecha,
                ref_tipo_comprobante = :ref_tipo,
                ref_serie = :ref_serie,
                ref_numero = :ref_num,
                archivo_pago = :archivo_pago,
                archivo_detraccion = :archivo_detraccion
                WHERE id = :id";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':tipo' => $data['tipo_comprobante'],
                ':serie' => $data['serie'],
                ':corr' => $data['correlativo'],
                ':ctipo' => $data['cliente_tipo_doc'],
                ':cnum' => $data['cliente_num_doc'],
                ':crazon' => $data['cliente_razon_social'],
                ':moneda' => $data['moneda'],
                ':tc' => $data['tipo_cambio'] ?? 1.000,
                ':gravada' => $data['total_gravada'] ?? 0,
                ':exonerada' => $data['total_exonerada'] ?? 0,
                ':inafecta' => $data['total_inafecta'] ?? 0,
                ':igv' => $data['total_igv'] ?? 0,
                ':importe' => $data['total_importe'],
                ':fecha' => $data['fecha_emision'],
                ':cond' => $condicion,
                ':ref_fecha' => !empty($data['ref_fecha_emision']) ? $data['ref_fecha_emision'] : null,
                ':ref_tipo' => !empty($data['ref_tipo_comprobante']) ? $data['ref_tipo_comprobante'] : null,
                ':ref_serie' => $data['ref_serie'] ?? null,
                ':ref_num' => $data['ref_numero'] ?? null,
                ':archivo_pago' => $archivo_pago,
                ':archivo_detraccion' => $archivo_detraccion,
                ':id' => $id
            ]);
            
            // --- ACTUALIZAR CONTABILIDAD ---
            $glosaLike = "Venta {$oldData['serie']}-{$oldData['correlativo']}%";
            
            // Buscar asiento
            $stmtFindAsiento = $conn->prepare("SELECT id FROM asientos WHERE glosa LIKE ? AND tipo_asiento = 'Venta' LIMIT 1");
            $stmtFindAsiento->execute([$glosaLike]);
            $asiento = $stmtFindAsiento->fetch(PDO::FETCH_ASSOC);

            if ($asiento) {
                $asientoId = $asiento['id'];
                $newGlosa = "Venta {$data['serie']}-{$data['correlativo']} {$data['cliente_razon_social']}";

                // Update Header
                $stmtUpdAsiento = $conn->prepare("UPDATE asientos SET fecha = :fecha, glosa = :glosa, moneda = :moneda, tipo_cambio = :tc WHERE id = :aid");
                $stmtUpdAsiento->execute([
                    ':fecha' => $data['fecha_emision'],
                    ':glosa' => $newGlosa,
                    ':moneda' => $data['moneda'],
                    ':tc' => $data['tipo_cambio'] ?? 1.0,
                    ':aid' => $asientoId
                ]);

                // Delete old details
                $conn->prepare("DELETE FROM asientos_detalle WHERE asiento_id = ?")->execute([$asientoId]);

                // Insert new details
                $stmtDetalle = $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)");

                // 1. Cuentas por Cobrar (121) -> Debe (Total)
                $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '121', ':debe' => $data['total_importe'], ':haber' => 0]);
                
                // 2. IGV (4011) -> Haber
                $igvTotal = $data['total_igv'] ?? 0;
                if ($igvTotal > 0) {
                    $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '4011', ':debe' => 0, ':haber' => $igvTotal]);
                }
                
                // 3. Ventas (701) -> Haber (Base Imponible)
                $baseTotal = ($data['total_gravada'] ?? 0) + ($data['total_exonerada'] ?? 0) + ($data['total_inafecta'] ?? 0);
                if ($baseTotal > 0) {
                    $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '701', ':debe' => 0, ':haber' => $baseTotal]);
                }
            } else {
                // Si no existía asiento (casos antiguos), crearlo
                $glosa = "Venta {$data['serie']}-{$data['correlativo']} {$data['cliente_razon_social']}";
                $stmtAsiento = $conn->prepare("INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, tipo_cambio, estado, usuario_id) VALUES (:fecha, :glosa, 'Venta', :moneda, :tc, 'Finalizado', :uid)");
                $stmtAsiento->execute([
                    ':fecha' => $data['fecha_emision'],
                    ':glosa' => $glosa,
                    ':moneda' => $data['moneda'],
                    ':tc' => $data['tipo_cambio'] ?? 1.0,
                    ':uid' => $userData->id ?? null
                ]);
                $asientoId = $conn->lastInsertId();
                
                $stmtDetalle = $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)");
                $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '121', ':debe' => $data['total_importe'], ':haber' => 0]);
                if (($data['total_igv'] ?? 0) > 0) $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '4011', ':debe' => 0, ':haber' => $data['total_igv']]);
                $baseTotal = ($data['total_gravada'] ?? 0) + ($data['total_exonerada'] ?? 0) + ($data['total_inafecta'] ?? 0);
                if ($baseTotal > 0) $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '701', ':debe' => 0, ':haber' => $baseTotal]);
            }

            $conn->commit();
            echo json_encode(["message" => "Registro manual actualizado y contabilizado correctamente"]);

        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'subir_adjuntos':
        $data = $_POST;
        $id = $data['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            // Verificar si existe
            $stmt = $conn->prepare("SELECT archivo_pago, archivo_detraccion FROM comprobantes_electronicos WHERE id = ?");
            $stmt->execute([$id]);
            $oldData = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$oldData) {
                http_response_code(404);
                echo json_encode(["message" => "Registro no encontrado"]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $updates = [];
            $params = [':id' => $id];

            $existingPago = [];
            $existingDet = [];

            if (!empty($oldData['archivo_pago'])) {
                $existingPago = array_filter(explode('|', $oldData['archivo_pago']));
            }
            if (!empty($oldData['archivo_detraccion'])) {
                $existingDet = array_filter(explode('|', $oldData['archivo_detraccion']));
            }

            if (isset($_FILES['archivo_pago'])) {
                $filesPago = normalizeUploadFiles($_FILES['archivo_pago']);
                foreach ($filesPago as $file) {
                    $path = handleFileUpload($file, 'pago');
                    if ($path) {
                        $existingPago[] = $path;
                    }
                }
                if (!empty($filesPago) && !empty($existingPago)) {
                    $updates[] = "archivo_pago = :archivo_pago";
                    $params[':archivo_pago'] = implode('|', $existingPago);
                }
            }
            
            if (isset($_FILES['archivo_detraccion'])) {
                $filesDet = normalizeUploadFiles($_FILES['archivo_detraccion']);
                foreach ($filesDet as $file) {
                    $path = handleFileUpload($file, 'detraccion');
                    if ($path) {
                        $existingDet[] = $path;
                    }
                }
                if (!empty($filesDet) && !empty($existingDet)) {
                    $updates[] = "archivo_detraccion = :archivo_detraccion";
                    $params[':archivo_detraccion'] = implode('|', $existingDet);
                }
            }

            if (empty($updates)) {
                echo json_encode(["message" => "No se enviaron archivos para actualizar"]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $sql = "UPDATE comprobantes_electronicos SET " . implode(", ", $updates) . " WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            
            echo json_encode(["message" => "Archivos adjuntados correctamente"]);

        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'eliminar':
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

            // Obtener datos para buscar asiento
            $stmt = $conn->prepare("SELECT serie, correlativo FROM comprobantes_electronicos WHERE id = ?");
            $stmt->execute([$id]);
            $venta = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$venta) throw new Exception("Venta no encontrada");

            // Eliminar Venta
            $stmt = $conn->prepare("DELETE FROM comprobantes_electronicos WHERE id = ?");
            $stmt->execute([$id]);

            // Eliminar Asiento
            $glosaLike = "Venta {$venta['serie']}-{$venta['correlativo']}%";
            
            // Buscar ID de asiento para borrar detalles
            $stmtAsiento = $conn->prepare("SELECT id FROM asientos WHERE glosa LIKE ? AND tipo_asiento = 'Venta' LIMIT 1");
            $stmtAsiento->execute([$glosaLike]);
            $asiento = $stmtAsiento->fetch(PDO::FETCH_ASSOC);

            if ($asiento) {
                // Borrar detalles
                $conn->prepare("DELETE FROM asientos_detalle WHERE asiento_id = ?")->execute([$asiento['id']]);
                // Borrar asiento
                $conn->prepare("DELETE FROM asientos WHERE id = ?")->execute([$asiento['id']]);
            }

            $conn->commit();
            echo json_encode(["message" => "Venta eliminada correctamente"]);

        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'exportar_ple':
        $mes = $_GET['mes'] ?? date('m');
        $anio = $_GET['anio'] ?? date('Y');
        
        $sql = "SELECT * FROM comprobantes_electronicos 
                WHERE MONTH(fecha_emision) = :mes AND YEAR(fecha_emision) = :anio 
                AND estado != 'Anulado'";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':mes' => $mes, ':anio' => $anio]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $content = "";
        foreach ($rows as $r) {
            // Estructura 14.1 SUNAT
            $periodo = $anio . $mes . "00";
            $cuo = $r['id']; // Usamos ID como CUO simple
            $fecha = date('d/m/Y', strtotime($r['fecha_emision']));
            
            $line = [
                $periodo, // 1. Periodo
                $cuo, // 2. CUO
                "M0001", // 3. Num correlativo asiento
                $fecha, // 4. Fecha emision
                "", // 5. Fecha vencimiento (opcional en ventas)
                $r['tipo_comprobante'], // 6. Tipo Comp
                $r['serie'], // 7. Serie
                $r['correlativo'], // 8. Numero
                "", // 9. Final
                $r['cliente_tipo_doc'], // 10. Tipo Doc Identidad
                $r['cliente_num_doc'], // 11. Num Doc Identidad
                $r['cliente_razon_social'], // 12. Razon Social
                "", // 13. Valor Facturado Exportacion
                number_format($r['total_gravada'], 2, '.', ''), // 14. Base Imponible
                number_format($r['total_exonerada'], 2, '.', ''), // 15. Exonerada
                number_format($r['total_inafecta'], 2, '.', ''), // 16. Inafecta
                "0.00", // 17. ISC
                number_format($r['total_igv'], 2, '.', ''), // 18. IGV
                "0.00", // 19. ICBPER
                "0.00", // 20. Otros
                number_format($r['total_importe'], 2, '.', ''), // 21. Importe Total
                $r['moneda'], // 22. Moneda
                number_format($r['tipo_cambio'] ?? 1.000, 3, '.', ''), // 23. TC
                $r['ref_fecha_emision'] ? date('d/m/Y', strtotime($r['ref_fecha_emision'])) : "", // 24. Fecha Ref
                $r['ref_tipo_comprobante'] ?? "", // 25. Tipo Ref
                $r['ref_serie'] ?? "", // 26. Serie Ref
                $r['ref_numero'] ?? "", // 27. Num Ref
                "", // 28. Contrato
                "", // 29. Error 1
                "", // 30. Medio Pago
                "1" // 31. Estado (1: Anotado en el periodo)
            ];
            
            $content .= implode("|", $line) . "|\r\n";
        }
        
        header('Content-Type: text/plain');
        header('Content-Disposition: attachment; filename="LE20100000001'.$anio.$mes.'00140100001111.txt"');
        echo $content;
        break;

    case 'cuadre_sunat':
        // Simulación de cruce de información
        $mes = $_GET['mes'] ?? date('m');
        $anio = $_GET['anio'] ?? date('Y');

        // Obtener Total ERP
        $sql = "SELECT SUM(total_importe) as total, COUNT(*) as cantidad FROM comprobantes_electronicos 
                WHERE MONTH(fecha_emision) = :mes AND YEAR(fecha_emision) = :anio AND estado = 'Aceptado'";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':mes' => $mes, ':anio' => $anio]);
        $erp = $stmt->fetch(PDO::FETCH_ASSOC);

        // Simular Total SUNAT (un poco diferente para que sea realista)
        $sunat_total = $erp['total'] ?? 0;
        $sunat_cantidad = $erp['cantidad'] ?? 0;
        
        // Randomizar un poco si hay datos
        if ($sunat_cantidad > 0) {
            // 20% chance of discrepancy
            if (rand(1, 5) == 1) {
                $sunat_total += rand(-100, 100);
            }
        }

        echo json_encode([
            "erp" => [
                "total" => (float)$erp['total'],
                "cantidad" => (int)$erp['cantidad']
            ],
            "sunat" => [
                "total" => (float)$sunat_total,
                "cantidad" => (int)$sunat_cantidad
            ],
            "diferencia" => (float)($erp['total'] - $sunat_total),
            "estado" => ($erp['total'] == $sunat_total) ? "Cuadrado" : "Con Diferencias"
        ]);
        break;

    case 'anular':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? null;
        
        if (!$id) {
            http_response_code(400);
            echo json_encode(["error" => "ID requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $conn->beginTransaction();
            
            // Verificar estado actual
            $stmt = $conn->prepare("SELECT estado FROM comprobantes_electronicos WHERE id = ?");
            $stmt->execute([$id]);
            $venta = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$venta) throw new Exception("Venta no encontrada");
            if ($venta['estado'] === 'Anulado') throw new Exception("La venta ya está anulada");
            
            // Actualizar estado venta
            $stmt = $conn->prepare("UPDATE comprobantes_electronicos SET estado = 'Anulado' WHERE id = ?");
            $stmt->execute([$id]);
            
            $conn->commit();
            echo json_encode(["message" => "Venta anulada correctamente"]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["error" => $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(["message" => "Acción no válida"]);
        break;
}
if (isset($conn)) $conn = null;
?>
