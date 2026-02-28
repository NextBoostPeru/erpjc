<?php
include_once '../config/db.php';
require_once '../config/jwt.php';

$jwtHandler = new JWTHandler();

// Handle OPTIONS request for CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'listar':
        $mes = $_GET['mes'] ?? date('m');
        $anio = $_GET['anio'] ?? date('Y');
        
        // Optimize: Use BETWEEN for date range to use index
        $startDate = "$anio-$mes-01";
        $endDate = date("Y-m-t", strtotime($startDate));

        // Parámetros de paginación y búsqueda
        $page = isset($_GET['page']) ? (int)$_GET['page'] : null;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $search = isset($_GET['search']) ? trim($_GET['search']) : '';
        
        // Construcción de filtros
        $whereParams = [':start' => $startDate, ':end' => $endDate];
        $whereSql = "fecha_emision BETWEEN :start AND :end";
        
        if (!empty($search)) {
            $whereSql .= " AND (proveedor_razon_social LIKE :search OR proveedor_num_doc LIKE :search OR numero LIKE :search)";
            $whereParams[':search'] = "%$search%";
        }

        // Si no se solicita paginación, mantener comportamiento antiguo (retornar todo)
        if ($page === null) {
            $sql = "SELECT * FROM comprobantes_compra 
                    WHERE $whereSql 
                    ORDER BY fecha_emision DESC, id DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute($whereParams);
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $conn = null;
            echo json_encode($data);
            break;
        }

        // Obtener resumen (totales) considerando filtros pero SIN paginación
        // Total de registros activos (no anulados) para sumas monetarias
        // Total de filas encontradas para paginación
        
        // 1. Conteo total para paginación (incluye anulados si se muestran, pero aquí filtramos por search)
        $countSql = "SELECT COUNT(*) as total_rows FROM comprobantes_compra WHERE $whereSql";
        $stmtCount = $conn->prepare($countSql);
        $stmtCount->execute($whereParams);
        $totalRows = $stmtCount->fetch(PDO::FETCH_ASSOC)['total_rows'];
        $totalPages = ceil($totalRows / $limit);
        
        // 2. Resumen financiero (solo activos)
        // Nota: Si el usuario busca "Anulado", el search filtra. 
        // El resumen debe reflejar lo que se ve o el total del mes?
        // En RegistroVentas el resumen era del filtro actual. Haremos lo mismo.
        
        $summarySql = "SELECT 
                        COUNT(*) as total_registros,
                        SUM(CASE WHEN estado != 'Anulado' THEN importe_total ELSE 0 END) as total_compras,
                        SUM(CASE WHEN estado != 'Anulado' THEN (igv_gravado + igv_mixto + igv_no_gravado) ELSE 0 END) as total_igv
                       FROM comprobantes_compra WHERE $whereSql";
        $stmtSummary = $conn->prepare($summarySql);
        $stmtSummary->execute($whereParams);
        $summary = $stmtSummary->fetch(PDO::FETCH_ASSOC);

        // 3. Obtener datos paginados
        $offset = ($page - 1) * $limit;
        $sql = "SELECT * FROM comprobantes_compra 
                WHERE $whereSql 
                ORDER BY fecha_emision DESC, id DESC
                LIMIT :limit OFFSET :offset";
        
        $stmt = $conn->prepare($sql);
        foreach ($whereParams as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $registros = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response = [
            'data' => $registros,
            'meta' => [
                'page' => $page,
                'limit' => $limit,
                'total_rows' => $totalRows,
                'total_pages' => $totalPages
            ],
            'summary' => [
                'total_registros' => $summary['total_registros'], // Total coincidente con filtros
                'total_compras' => $summary['total_compras'], // Suma importes (activos)
                'total_igv' => $summary['total_igv'] // Suma IGV (activos)
            ]
        ];
        $conn = null;
        echo json_encode($response);
        break;

    case 'crear':
        $data = json_decode(file_get_contents("php://input"), true);
        
        try {
            $conn->beginTransaction();
            
            // Validar duplicados (Tipo + Serie + Numero + Proveedor)
            $stmt = $conn->prepare("SELECT id FROM comprobantes_compra WHERE tipo_comprobante = :tipo AND serie = :serie AND numero = :num AND proveedor_num_doc = :ruc");
            $stmt->execute([
                ':tipo' => $data['tipo_comprobante'],
                ':serie' => $data['serie'],
                ':num' => $data['numero'],
                ':ruc' => $data['proveedor_num_doc']
            ]);
            if ($stmt->fetch()) {
                throw new Exception("El comprobante ya existe");
            }

            // Datos Cuentas por Pagar
            $condicion = $data['condicion_pago'] ?? 'Contado';
            $fecha_venc = !empty($data['fecha_vencimiento']) ? $data['fecha_vencimiento'] : $data['fecha_emision'];
            $saldo_pendiente = $data['importe_total'];
            $estado_pago = 'Pendiente';

            if ($condicion === 'Contado') {
                $saldo_pendiente = 0;
                $estado_pago = 'Pagado';
            }

            $sql = "INSERT INTO comprobantes_compra (
                fecha_emision, fecha_vencimiento, tipo_comprobante, serie, numero,
                proveedor_tipo_doc, proveedor_num_doc, proveedor_razon_social,
                clasificacion_bienes_servicios,
                moneda, tipo_cambio, 
                base_imponible_gravada, igv_gravado,
                base_imponible_mixta, igv_mixto,
                base_imponible_no_gravada, igv_no_gravado,
                valor_no_gravado, isc, icbper, otros_tributos, importe_total,
                tiene_detraccion, constancia_detraccion, fecha_detraccion, monto_detraccion,
                monto_retencion, estado,
                condicion_pago, saldo_pendiente, estado_pago,
                ref_fecha_emision, ref_tipo_comprobante, ref_serie, ref_numero
            ) VALUES (
                :fecha_emision, :fecha_vencimiento, :tipo, :serie, :numero,
                :prov_tipo, :prov_doc, :prov_razon,
                :clasif,
                :moneda, :tc,
                :bi_grav, :igv_grav,
                :bi_mix, :igv_mix,
                :bi_no_grav, :igv_no_grav,
                :val_no_grav, :isc, :icbper, :otros, :total,
                :tiene_det, :const_det, :fecha_det, :monto_det,
                :retencion, 'Registrado',
                :cond, :saldo, :est_pago,
                :ref_fecha, :ref_tipo, :ref_serie, :ref_num
            )";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':fecha_emision' => $data['fecha_emision'],
                ':fecha_vencimiento' => $fecha_venc,
                ':tipo' => $data['tipo_comprobante'],
                ':serie' => $data['serie'],
                ':numero' => $data['numero'],
                ':prov_tipo' => $data['proveedor_tipo_doc'],
                ':prov_doc' => $data['proveedor_num_doc'],
                ':prov_razon' => $data['proveedor_razon_social'],
                ':clasif' => $data['clasificacion_bienes_servicios'] ?? '5',
                ':moneda' => $data['moneda'],
                ':tc' => $data['tipo_cambio'] ?? 1.0,
                ':bi_grav' => $data['base_imponible_gravada'] ?? 0,
                ':igv_grav' => $data['igv_gravado'] ?? 0,
                ':bi_mix' => $data['base_imponible_mixta'] ?? 0,
                ':igv_mix' => $data['igv_mixto'] ?? 0,
                ':bi_no_grav' => $data['base_imponible_no_gravada'] ?? 0,
                ':igv_no_grav' => $data['igv_no_gravado'] ?? 0,
                ':val_no_grav' => $data['valor_no_gravado'] ?? 0,
                ':isc' => $data['isc'] ?? 0,
                ':icbper' => $data['icbper'] ?? 0,
                ':otros' => $data['otros_tributos'] ?? 0,
                ':total' => $data['importe_total'],
                ':tiene_det' => $data['tiene_detraccion'] ?? 0,
                ':const_det' => !empty($data['constancia_detraccion']) ? $data['constancia_detraccion'] : null,
                ':fecha_det' => !empty($data['fecha_detraccion']) ? $data['fecha_detraccion'] : null,
                ':monto_det' => $data['monto_detraccion'] ?? 0,
                ':retencion' => $data['monto_retencion'] ?? 0,
                ':cond' => $condicion,
                ':saldo' => $saldo_pendiente,
                ':est_pago' => $estado_pago,
                ':ref_fecha' => !empty($data['ref_fecha_emision']) ? $data['ref_fecha_emision'] : null,
                ':ref_tipo' => !empty($data['ref_tipo_comprobante']) ? $data['ref_tipo_comprobante'] : null,
                ':ref_serie' => $data['ref_serie'] ?? null,
                ':ref_num' => $data['ref_numero'] ?? null
            ]);
            
            // --- CONTABILIDAD AUTOMÁTICA ---
            $glosa = "Compra {$data['serie']}-{$data['numero']} {$data['proveedor_razon_social']}";
            
            $stmtAsiento = $conn->prepare("INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, tipo_cambio, estado, usuario_id) VALUES (:fecha, :glosa, 'Compra', :moneda, :tc, 'Finalizado', :uid)");
            $stmtAsiento->execute([
                ':fecha' => $data['fecha_emision'],
                ':glosa' => $glosa,
                ':moneda' => $data['moneda'],
                ':tc' => $data['tipo_cambio'] ?? 1.0,
                ':uid' => $userData->id ?? null
            ]);
            $asientoId = $conn->lastInsertId();
            
            $stmtDetalle = $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)");
            
            // 1. Gasto (Base Imponible) -> Debe
            $baseTotal = ($data['base_imponible_gravada'] ?? 0) + ($data['base_imponible_mixta'] ?? 0) + ($data['base_imponible_no_gravada'] ?? 0) + ($data['valor_no_gravado'] ?? 0);
            if ($baseTotal > 0) {
                $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '601', ':debe' => $baseTotal, ':haber' => 0]);
            }
            
            // 2. IGV -> Debe
            $igvTotal = ($data['igv_gravado'] ?? 0) + ($data['igv_mixto'] ?? 0) + ($data['igv_no_gravado'] ?? 0) + ($data['isc'] ?? 0) + ($data['icbper'] ?? 0) + ($data['otros_tributos'] ?? 0);
            if ($igvTotal > 0) {
                $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '4011', ':debe' => $igvTotal, ':haber' => 0]);
            }
            
            // 3. Total -> Haber (421)
            $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '421', ':debe' => 0, ':haber' => $data['importe_total']]);
            
            $conn->commit();
            echo json_encode(["message" => "Comprobante de compra registrado y contabilizado correctamente"]);

        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
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

            // Obtener datos antiguos para buscar asiento
            $stmtOld = $conn->prepare("SELECT serie, numero, proveedor_razon_social FROM comprobantes_compra WHERE id = ?");
            $stmtOld->execute([$id]);
            $oldData = $stmtOld->fetch(PDO::FETCH_ASSOC);

            if (!$oldData) throw new Exception("Compra no encontrada");

            // Recalcular condición pago
            $condicion = $data['condicion_pago'] ?? 'Contado';
            $fecha_venc = !empty($data['fecha_vencimiento']) ? $data['fecha_vencimiento'] : $data['fecha_emision'];
            $saldo_pendiente = $data['importe_total'];
            $estado_pago = 'Pendiente';

            if ($condicion === 'Contado') {
                $saldo_pendiente = 0;
                $estado_pago = 'Pagado';
            }

            $sql = "UPDATE comprobantes_compra SET 
                fecha_emision = :fecha_emision,
                fecha_vencimiento = :fecha_vencimiento,
                tipo_comprobante = :tipo,
                serie = :serie,
                numero = :numero,
                proveedor_tipo_doc = :prov_tipo,
                proveedor_num_doc = :prov_doc,
                proveedor_razon_social = :prov_razon,
                clasificacion_bienes_servicios = :clasif,
                moneda = :moneda,
                tipo_cambio = :tc,
                base_imponible_gravada = :bi_grav,
                igv_gravado = :igv_grav,
                base_imponible_mixta = :bi_mix,
                igv_mixto = :igv_mix,
                base_imponible_no_gravada = :bi_no_grav,
                igv_no_gravado = :igv_no_grav,
                valor_no_gravado = :val_no_grav,
                isc = :isc,
                icbper = :icbper,
                otros_tributos = :otros,
                importe_total = :total,
                tiene_detraccion = :tiene_det,
                constancia_detraccion = :const_det,
                fecha_detraccion = :fecha_det,
                monto_detraccion = :monto_det,
                monto_retencion = :retencion,
                condicion_pago = :cond,
                saldo_pendiente = :saldo,
                estado_pago = :est_pago,
                ref_fecha_emision = :ref_fecha,
                ref_tipo_comprobante = :ref_tipo,
                ref_serie = :ref_serie,
                ref_numero = :ref_num
                WHERE id = :id";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':fecha_emision' => $data['fecha_emision'],
                ':fecha_vencimiento' => $fecha_venc,
                ':tipo' => $data['tipo_comprobante'],
                ':serie' => $data['serie'],
                ':numero' => $data['numero'],
                ':prov_tipo' => $data['proveedor_tipo_doc'],
                ':prov_doc' => $data['proveedor_num_doc'],
                ':prov_razon' => $data['proveedor_razon_social'],
                ':clasif' => $data['clasificacion_bienes_servicios'] ?? '5',
                ':moneda' => $data['moneda'],
                ':tc' => $data['tipo_cambio'] ?? 1.0,
                ':bi_grav' => $data['base_imponible_gravada'] ?? 0,
                ':igv_grav' => $data['igv_gravado'] ?? 0,
                ':bi_mix' => $data['base_imponible_mixta'] ?? 0,
                ':igv_mix' => $data['igv_mixto'] ?? 0,
                ':bi_no_grav' => $data['base_imponible_no_gravada'] ?? 0,
                ':igv_no_grav' => $data['igv_no_gravado'] ?? 0,
                ':val_no_grav' => $data['valor_no_gravado'] ?? 0,
                ':isc' => $data['isc'] ?? 0,
                ':icbper' => $data['icbper'] ?? 0,
                ':otros' => $data['otros_tributos'] ?? 0,
                ':total' => $data['importe_total'],
                ':tiene_det' => $data['tiene_detraccion'] ?? 0,
                ':const_det' => !empty($data['constancia_detraccion']) ? $data['constancia_detraccion'] : null,
                ':fecha_det' => !empty($data['fecha_detraccion']) ? $data['fecha_detraccion'] : null,
                ':monto_det' => $data['monto_detraccion'] ?? 0,
                ':retencion' => $data['monto_retencion'] ?? 0,
                ':cond' => $condicion,
                ':saldo' => $saldo_pendiente,
                ':est_pago' => $estado_pago,
                ':ref_fecha' => !empty($data['ref_fecha_emision']) ? $data['ref_fecha_emision'] : null,
                ':ref_tipo' => !empty($data['ref_tipo_comprobante']) ? $data['ref_tipo_comprobante'] : null,
                ':ref_serie' => $data['ref_serie'] ?? null,
                ':ref_num' => $data['ref_numero'] ?? null,
                ':id' => $id
            ]);

            // --- ACTUALIZAR CONTABILIDAD ---
            $glosaLike = "Compra {$oldData['serie']}-{$oldData['numero']}%";
            
            // Buscar asiento
            $stmtFindAsiento = $conn->prepare("SELECT id FROM asientos WHERE glosa LIKE ? AND tipo_asiento = 'Compra' LIMIT 1");
            $stmtFindAsiento->execute([$glosaLike]);
            $asiento = $stmtFindAsiento->fetch(PDO::FETCH_ASSOC);

            if ($asiento) {
                $asientoId = $asiento['id'];
                $newGlosa = "Compra {$data['serie']}-{$data['numero']} {$data['proveedor_razon_social']}";

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

                // 1. Gasto
                $baseTotal = ($data['base_imponible_gravada'] ?? 0) + ($data['base_imponible_mixta'] ?? 0) + ($data['base_imponible_no_gravada'] ?? 0) + ($data['valor_no_gravado'] ?? 0);
                if ($baseTotal > 0) {
                    $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '601', ':debe' => $baseTotal, ':haber' => 0]);
                }
                
                // 2. IGV
                $igvTotal = ($data['igv_gravado'] ?? 0) + ($data['igv_mixto'] ?? 0) + ($data['igv_no_gravado'] ?? 0) + ($data['isc'] ?? 0) + ($data['icbper'] ?? 0) + ($data['otros_tributos'] ?? 0);
                if ($igvTotal > 0) {
                    $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '4011', ':debe' => $igvTotal, ':haber' => 0]);
                }
                
                // 3. Total
                $stmtDetalle->execute([':aid' => $asientoId, ':cta' => '421', ':debe' => 0, ':haber' => $data['importe_total']]);
            }

            $conn->commit();
            echo json_encode(["message" => "Compra actualizada correctamente"]);

        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
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
            $stmt = $conn->prepare("SELECT serie, numero FROM comprobantes_compra WHERE id = ?");
            $stmt->execute([$id]);
            $compra = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$compra) throw new Exception("Compra no encontrada");

            // Eliminar Compra
            $stmt = $conn->prepare("DELETE FROM comprobantes_compra WHERE id = ?");
            $stmt->execute([$id]);

            // Eliminar Asiento (y detalles por FK on delete cascade si existe, sino manual)
            // Asumimos manual por seguridad si no hay FK
            $glosaLike = "Compra {$compra['serie']}-{$compra['numero']}%";
            
            // Buscar ID de asiento para borrar detalles
            $stmtFind = $conn->prepare("SELECT id FROM asientos WHERE glosa LIKE ? AND tipo_asiento = 'Compra'");
            $stmtFind->execute([$glosaLike]);
            $asiento = $stmtFind->fetch(PDO::FETCH_ASSOC);

            if ($asiento) {
                $conn->prepare("DELETE FROM asientos_detalle WHERE asiento_id = ?")->execute([$asiento['id']]);
                $conn->prepare("DELETE FROM asientos WHERE id = ?")->execute([$asiento['id']]);
            }

            $conn->commit();
            echo json_encode(["message" => "Compra eliminada correctamente"]);

        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
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
            $stmt = $conn->prepare("SELECT estado, serie, numero FROM comprobantes_compra WHERE id = ?");
            $stmt->execute([$id]);
            $compra = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$compra) throw new Exception("Compra no encontrada");
            if ($compra['estado'] === 'Anulado') throw new Exception("La compra ya está anulada");
            
            // Actualizar estado compra
            $stmt = $conn->prepare("UPDATE comprobantes_compra SET estado = 'Anulado', saldo_pendiente = 0 WHERE id = ?");
            $stmt->execute([$id]);
            
            // Anular asiento contable asociado (Búsqueda por glosa aproximada ya que no hay FK directa aun)
            $glosaLike = "Compra {$compra['serie']}-{$compra['numero']}%";
            $stmtAsiento = $conn->prepare("UPDATE asientos SET estado = 'Anulado' WHERE glosa LIKE ? AND tipo_asiento = 'Compra' AND estado != 'Anulado'");
            $stmtAsiento->execute([$glosaLike]);
            
            $conn->commit();
            echo json_encode(["message" => "Compra anulada correctamente"]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["error" => $e->getMessage()]);
        }
        break;

    case 'exportar_ple':
        $mes = $_GET['mes'] ?? date('m');
        $anio = $_GET['anio'] ?? date('Y');
        
        $sql = "SELECT * FROM comprobantes_compra 
                WHERE MONTH(fecha_emision) = :mes AND YEAR(fecha_emision) = :anio 
                AND estado = 'Registrado'";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':mes' => $mes, ':anio' => $anio]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Formato 8.1 Registro de Compras
        $content = "";
        foreach ($rows as $r) {
            $periodo = $anio . $mes . "00";
            $cuo = $r['id']; // Identificador único
            $m = "M0001"; // Asiento (simulado)
            
            $fecha_emision = date('d/m/Y', strtotime($r['fecha_emision']));
            $fecha_venc = $r['fecha_vencimiento'] ? date('d/m/Y', strtotime($r['fecha_vencimiento'])) : "";
            
            $line = [
                $periodo,
                $cuo,
                $m,
                $fecha_emision,
                $fecha_venc,
                $r['tipo_comprobante'],
                $r['serie'],
                $r['anio'] ?? '0', // Año emisión DUA (no tenemos campo, asumir 0 o año actual)
                $r['numero'],
                "", // No usado
                $r['proveedor_tipo_doc'],
                $r['proveedor_num_doc'],
                $r['proveedor_razon_social'],
                number_format($r['base_imponible_gravada'], 2, '.', ''),
                number_format($r['igv_gravado'], 2, '.', ''),
                number_format($r['base_imponible_mixta'], 2, '.', ''),
                number_format($r['igv_mixto'], 2, '.', ''),
                number_format($r['base_imponible_no_gravada'], 2, '.', ''),
                number_format($r['igv_no_gravado'], 2, '.', ''),
                number_format($r['valor_no_gravado'], 2, '.', ''),
                number_format($r['isc'], 2, '.', ''),
                number_format($r['icbper'], 2, '.', ''),
                number_format($r['otros_tributos'], 2, '.', ''),
                number_format($r['importe_total'], 2, '.', ''),
                $r['moneda'],
                number_format($r['tipo_cambio'], 3, '.', ''),
                $r['ref_fecha_emision'] ? date('d/m/Y', strtotime($r['ref_fecha_emision'])) : "", // Fecha ref
                $r['ref_tipo_comprobante'] ?? "", // Tipo ref
                $r['ref_serie'] ?? "", // Serie ref
                $r['ref_numero'] ?? "", // Num ref
                "", // Valor FOB (no manejado)
                "", // Otros cargos (no manejado)
                "", // Total Importación (no manejado)
                $r['fecha_detraccion'] ? date('d/m/Y', strtotime($r['fecha_detraccion'])) : "",
                $r['constancia_detraccion'] ?? "",
                $r['monto_retencion'] > 0 ? '1' : '', // Ind. retención
                $r['clasificacion_bienes_servicios'] ?? "", // Clasif bienes
                "", // Ident contrato
                "", // Error tipo 1
                "", // Error tipo 2
                "", // Error tipo 3
                "", // Error tipo 4
                "1" // Estado
            ];
            
            $content .= implode("|", $line) . "|\r\n";
        }
        
        header('Content-Type: text/plain');
        header('Content-Disposition: attachment; filename="LE20601234567' . $anio . $mes . '00080100001111.txt"');
        echo $content;
        break;
        
    case 'importar_xml':
        if (!isset($_FILES['xml_file']) || $_FILES['xml_file']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(["message" => "No se envió archivo XML"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $conn->beginTransaction();
            
            $xmlContent = file_get_contents($_FILES['xml_file']['tmp_name']);
            // Intento básico de carga
            libxml_use_internal_errors(true);
            $xml = simplexml_load_string($xmlContent);
            
            if ($xml === false) {
                throw new Exception("XML inválido");
            }
            
            $ns = $xml->getNamespaces(true);
            // Detectar si es Invoice, Note, etc.
            
            // Lógica simplificada: extraer datos básicos
            // Asumimos UBL 2.1 Invoice
            
            // TODO: Implementar parser completo. Por ahora, solo simular éxito si es XML válido
            // Para una implementación real, se requiere mapear todos los campos del XML a la BD.
            
            // Ejemplo de extracción:
            $tipo = (string)($xml->xpath('//cbc:InvoiceTypeCode')[0] ?? '01');
            $id = (string)($xml->xpath('//cbc:ID')[0] ?? 'UNKNOWN');
            $parts = explode('-', $id);
            $serie = $parts[0] ?? 'F001';
            $numero = $parts[1] ?? '00000000';
            
            $fecha = (string)($xml->xpath('//cbc:IssueDate')[0] ?? date('Y-m-d'));
            
            $provNum = (string)($xml->xpath('//cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID')[0] ?? '');
            $provRazon = (string)($xml->xpath('//cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName')[0] ?? '');
            
            $total = (float)($xml->xpath('//cac:LegalMonetaryTotal/cbc:PayableAmount')[0] ?? 0);
            
            // Insertar
            $sql = "INSERT INTO comprobantes_compra (
                fecha_emision, fecha_vencimiento, tipo_comprobante, serie, numero,
                proveedor_tipo_doc, proveedor_num_doc, proveedor_razon_social,
                importe_total, moneda,
                saldo_pendiente, estado_pago, condicion_pago
            ) VALUES (
                :fecha, :fecha, :tipo, :serie, :num,
                '6', :provNum, :provRazon,
                :total, 'PEN',
                :total, 'Pendiente', 'Credito'
            )";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':fecha' => $fecha,
                ':tipo' => $tipo,
                ':serie' => $serie,
                ':num' => $numero,
                ':provNum' => $provNum,
                ':provRazon' => $provRazon,
                ':total' => $total
            ]);
            
            $conn->commit();
            echo json_encode(["message" => "XML Importado parcialmente (Datos básicos)"]);

        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error procesando XML: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;
}

$conn = null;
?>