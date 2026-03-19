<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header('Content-Type: application/json');

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    $userData = $jwtHandler->validateToken($token);

    if (!$userData) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];
    rbac_require($conn, $userData, 'cobranzas', $method);

    $usuario_id = $userData->id;
    $action = $_GET['action'] ?? '';

    // Helper to get input data (JSON or POST)
    $inputJSON = json_decode(file_get_contents("php://input"), true);
    $data = $inputJSON ?? $_POST;

    switch ($action) {
        case 'dashboard':
            $sql = "SELECT 
                        SUM(saldo_pendiente) as total_por_cobrar,
                        SUM(CASE WHEN fecha_vencimiento < CURDATE() THEN saldo_pendiente ELSE 0 END) as total_vencido
                    FROM comprobantes_electronicos 
                    WHERE estado = 'Aceptado'
                      AND saldo_pendiente > 0";
            $stmt = $conn->query($sql);
            $totals = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['total_por_cobrar' => 0, 'total_vencido' => 0];

            // Cobrado este mes (pagos registrados en el mes actual)
            $sql = "SELECT SUM(monto) as cobrado_mes 
                    FROM cobranzas_pagos 
                    WHERE MONTH(fecha) = MONTH(CURRENT_DATE()) AND YEAR(fecha) = YEAR(CURRENT_DATE())";
            $stmt = $conn->query($sql);
            $cobrado = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['cobrado_mes' => 0];

            echo json_encode([
                "por_cobrar" => (float) ($totals['total_por_cobrar'] ?? 0),
                "vencido" => (float) ($totals['total_vencido'] ?? 0),
                "cobrado_mes" => (float) ($cobrado['cobrado_mes'] ?? 0)
            ]);
            break;

        case 'totales_por_mes':
            $startDate = date('Y-m-01', strtotime('-11 months'));
            $endDate = date('Y-m-t');

            $sql = "
                SELECT 
                    DATE_FORMAT(fecha_emision, '%Y-%m') as ym,
                    YEAR(fecha_emision) as anio,
                    MONTH(fecha_emision) as mes,
                    SUM(total_importe) as total
                FROM comprobantes_electronicos
                WHERE estado = 'Aceptado'
                  AND fecha_emision >= :start
                  AND fecha_emision <= :end
                GROUP BY anio, mes
                ORDER BY anio, mes
            ";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':start' => $startDate, ':end' => $endDate]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $map = [];
            foreach ($rows as $r) {
                $ym = $r['ym'] ?? null;
                if ($ym) {
                    $map[$ym] = (float)($r['total'] ?? 0);
                }
            }

            $out = [];
            for ($i = 0; $i < 12; $i++) {
                $ym = date('Y-m', strtotime($startDate . " +$i months"));
                $out[] = [
                    'ym' => $ym,
                    'total' => (float)($map[$ym] ?? 0)
                ];
            }

            echo json_encode(['data' => $out, 'range' => ['start' => $startDate, 'end' => $endDate]]);
            break;

        case 'listar_pendientes':
            $cliente = $_GET['cliente'] ?? '';
            $estado_filter = $_GET['estado_filter'] ?? '';
            $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 20;
            if ($page < 1) $page = 1;
            if ($limit < 1) $limit = 20;

            $where = [
                "estado = 'Aceptado'",
                "saldo_pendiente > 0"
            ];
            $params = [];

            if (!empty($cliente)) {
                $where[] = "(cliente_razon_social LIKE :cliente OR cliente_num_doc LIKE :cliente)";
                $params[':cliente'] = "%$cliente%";
            }

            if ($estado_filter === 'vencido') {
                $where[] = "fecha_vencimiento < CURDATE()";
            } elseif ($estado_filter === 'al_dia') {
                $where[] = "fecha_vencimiento >= CURDATE()";
            }

            $whereSql = 'WHERE ' . implode(' AND ', $where);

            // Count total
            $countSql = "SELECT COUNT(*) as total 
                         FROM comprobantes_electronicos 
                         $whereSql";
            $stmtCount = $conn->prepare($countSql);
            foreach ($params as $k => $v) {
                $stmtCount->bindValue($k, $v);
            }
            $stmtCount->execute();
            $totalRows = (int) $stmtCount->fetchColumn();

            $offset = ($page - 1) * $limit;

            // Fetch paginated data
            $sql = "SELECT id, fecha_emision, fecha_vencimiento, serie, correlativo, 
                           cliente_razon_social, cliente_num_doc, moneda, total_importe, saldo_pendiente, 
                           DATEDIFF(CURDATE(), fecha_vencimiento) as dias_retraso, estado_cobro
                    FROM comprobantes_electronicos 
                    $whereSql
                    ORDER BY fecha_vencimiento ASC
                    LIMIT :limit OFFSET :offset";

            $stmt = $conn->prepare($sql);
            foreach ($params as $k => $v) {
                $stmt->bindValue($k, $v);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'data' => is_array($rows) ? $rows : [],
                'pagination' => [
                    'total' => $totalRows,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int) ceil($totalRows / $limit) : 1
                ]
            ]);
            break;

        case 'historial_pagos':
            $id = $_GET['id'] ?? 0;
            if (!$id) {
                throw new Exception("ID de comprobante requerido");
            }

            $sql = "SELECT p.*, u.usuario as usuario 
                    FROM cobranzas_pagos p
                    LEFT JOIN usuarios u ON p.usuario_id = u.id
                    WHERE p.comprobante_id = :id 
                    ORDER BY p.fecha DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':id' => $id]);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(is_array($result) ? $result : []);
            break;

        case 'listar_pagos':
            $cliente = $_GET['cliente'] ?? '';
            $medio = $_GET['medio_pago'] ?? '';
            $fecha_desde = $_GET['fecha_desde'] ?? '';
            $fecha_hasta = $_GET['fecha_hasta'] ?? '';
            $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 20;
            if ($page < 1) $page = 1;
            if ($limit < 1) $limit = 20;

            $where = [];
            $params = [];

            if (!empty($cliente)) {
                $where[] = "(ce.cliente_razon_social LIKE :cliente OR ce.cliente_num_doc LIKE :cliente)";
                $params[':cliente'] = "%$cliente%";
            }

            if (!empty($medio) && $medio !== 'todos') {
                $where[] = "cp.medio_pago = :medio";
                $params[':medio'] = $medio;
            }

            if (!empty($fecha_desde)) {
                $where[] = "DATE(cp.fecha) >= :fdesde";
                $params[':fdesde'] = $fecha_desde;
            }

            if (!empty($fecha_hasta)) {
                $where[] = "DATE(cp.fecha) <= :fhasta";
                $params[':fhasta'] = $fecha_hasta;
            }

            $whereSql = '';
            if (count($where) > 0) {
                $whereSql = 'WHERE ' . implode(' AND ', $where);
            }

            $countSql = "SELECT COUNT(*) as total
                         FROM cobranzas_pagos cp
                         INNER JOIN comprobantes_electronicos ce ON cp.comprobante_id = ce.id
                         $whereSql";
            $stmtCount = $conn->prepare($countSql);
            foreach ($params as $k => $v) {
                $stmtCount->bindValue($k, $v);
            }
            $stmtCount->execute();
            $totalRows = (int) $stmtCount->fetchColumn();

            $offset = ($page - 1) * $limit;

            $sql = "SELECT 
                        cp.id,
                        cp.fecha,
                        cp.monto,
                        cp.medio_pago,
                        cp.referencia,
                        cp.observaciones,
                        cp.archivo_constancia,
                        ce.serie,
                        ce.correlativo,
                        ce.moneda,
                        ce.cliente_razon_social,
                        ce.cliente_num_doc
                    FROM cobranzas_pagos cp
                    INNER JOIN comprobantes_electronicos ce ON cp.comprobante_id = ce.id
                    $whereSql
                    ORDER BY cp.fecha DESC
                    LIMIT :limit OFFSET :offset";

            $stmt = $conn->prepare($sql);
            foreach ($params as $k => $v) {
                $stmt->bindValue($k, $v);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'data' => is_array($rows) ? $rows : [],
                'pagination' => [
                    'total' => $totalRows,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int) ceil($totalRows / $limit) : 1
                ]
            ]);
            break;

        case 'registrar_pago':
            
            $conn->beginTransaction();

            // 1. Validar Comprobante
            $stmt = $conn->prepare("SELECT * FROM comprobantes_electronicos WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $data['comprobante_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$comp) throw new Exception("Comprobante no encontrado");
            if ($data['monto'] > $comp['saldo_pendiente']) {
                throw new Exception("El monto excede el saldo pendiente ({$comp['saldo_pendiente']})");
            }

            $caja_mov_id = null;
            $banco_mov_id = null;

            // 2. Integración con Caja/Bancos (Antes de insertar pago para obtener ID)
            if ($data['medio_pago'] === 'Efectivo') {
                // Verificar sesión de caja abierta
                if (empty($data['destino_id'])) { // Si no viene ID de sesión, buscar la del usuario
                    $stmt = $conn->prepare("SELECT id FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' ORDER BY id DESC LIMIT 1");
                    $stmt->execute([':uid' => $usuario_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$sesion) throw new Exception("No tienes una caja abierta para recibir efectivo.");
                    $caja_sesion_id = $sesion['id'];
                } else {
                    $caja_sesion_id = $data['destino_id'];
                }

                $concepto = "Cobro Factura {$comp['serie']}-{$comp['correlativo']}";
                $sqlCaja = "INSERT INTO caja_movimientos (sesion_id, tipo, monto, concepto, usuario_id, fecha) 
                            VALUES (:sid, 'Ingreso', :monto, :conc, :uid, NOW())";
                $conn->prepare($sqlCaja)->execute([
                    ':sid' => $caja_sesion_id,
                    ':monto' => $data['monto'],
                    ':conc' => $concepto,
                    ':uid' => $usuario_id
                ]);
                $caja_mov_id = $conn->lastInsertId();

            } elseif (in_array($data['medio_pago'], ['Transferencia', 'Cheque', 'Deposito'])) {
                if (empty($data['destino_id'])) throw new Exception("Debe seleccionar una cuenta bancaria destino");
                
                $concepto = "Cobro Factura {$comp['serie']}-{$comp['correlativo']} ({$data['referencia']})";
                $sqlBanco = "INSERT INTO bancos_movimientos (cuenta_id, tipo, origen_destino, monto, concepto, referencia, entidad, usuario_id, fecha) 
                             VALUES (:cid, 'Ingreso', :origen, :monto, :conc, :ref, :entidad, :uid, NOW())";
                $conn->prepare($sqlBanco)->execute([
                    ':cid' => $data['destino_id'],
                    ':origen' => 'Cliente',
                    ':monto' => $data['monto'],
                    ':conc' => $concepto,
                    ':ref' => $data['referencia'] ?? '',
                    ':entidad' => $comp['cliente_razon_social'],
                    ':uid' => $usuario_id
                ]);
                $banco_mov_id = $conn->lastInsertId();
                
                // Actualizar saldo banco
                $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :monto WHERE id = :id")
                     ->execute([':monto' => $data['monto'], ':id' => $data['destino_id']]);
            }

            // 3. Insertar Pago
            $archivoPath = null;
            if (isset($_FILES['archivo'])) {
                $archivoPath = handleFileUpload($_FILES['archivo']);
            }

            $sql = "INSERT INTO cobranzas_pagos (comprobante_id, monto, medio_pago, referencia, destino_id, observaciones, usuario_id, caja_movimiento_id, banco_movimiento_id, archivo_constancia) 
                    VALUES (:cid, :monto, :medio, :ref, :dest, :obs, :uid, :caja_id, :banco_id, :archivo)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':cid' => $data['comprobante_id'],
                ':monto' => $data['monto'],
                ':medio' => $data['medio_pago'],
                ':ref' => $data['referencia'] ?? '',
                ':dest' => $data['destino_id'] ?? null,
                ':obs' => $data['observaciones'] ?? '',
                ':uid' => $usuario_id,
                ':caja_id' => $caja_mov_id,
                ':banco_id' => $banco_mov_id,
                ':archivo' => $archivoPath
            ]);

            // 4. Actualizar Comprobante
            $nuevo_saldo = bcsub($comp['saldo_pendiente'], $data['monto'], 2);
            $estado_cobro = ($nuevo_saldo <= 0) ? 'Pagado' : 'Parcial';
            
            $sql = "UPDATE comprobantes_electronicos SET saldo_pendiente = :saldo, estado_cobro = :estado WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':saldo' => $nuevo_saldo, ':estado' => $estado_cobro, ':id' => $data['comprobante_id']]);

            $conn->commit();
            echo json_encode(["message" => "Pago registrado correctamente", "nuevo_saldo" => $nuevo_saldo]);
            break;

        case 'eliminar_pago':
            $id = $_GET['id'] ?? 0;
            if (!$id) throw new Exception("ID de pago requerido");

            $conn->beginTransaction();

            // Obtener pago
            $stmt = $conn->prepare("SELECT * FROM cobranzas_pagos WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $id]);
            $pago = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$pago) throw new Exception("Pago no encontrado");

            // 1. Revertir movimiento financiero
            if ($pago['caja_movimiento_id']) {
                $conn->prepare("DELETE FROM caja_movimientos WHERE id = :id")->execute([':id' => $pago['caja_movimiento_id']]);
            } elseif ($pago['banco_movimiento_id']) {
                // Obtener cuenta_id para revertir saldo
                $stmt = $conn->prepare("SELECT cuenta_id FROM bancos_movimientos WHERE id = :id");
                $stmt->execute([':id' => $pago['banco_movimiento_id']]);
                $mov = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($mov) {
                    $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :monto WHERE id = :id")
                         ->execute([':monto' => $pago['monto'], ':id' => $mov['cuenta_id']]);
                    
                    $conn->prepare("DELETE FROM bancos_movimientos WHERE id = :id")->execute([':id' => $pago['banco_movimiento_id']]);
                }
            }

            // 2. Revertir saldo comprobante
            $stmt = $conn->prepare("UPDATE comprobantes_electronicos SET saldo_pendiente = saldo_pendiente + :monto, estado_cobro = 'Parcial' WHERE id = :id");
            $stmt->execute([':monto' => $pago['monto'], ':id' => $pago['comprobante_id']]);

            // Verificar si el nuevo saldo es igual al total (o mayor por error), y ajustar estado si es necesario
            // (La lógica simple es poner Parcial, o Pendiente si saldo == total)
            $stmt = $conn->prepare("SELECT saldo_pendiente, total_importe FROM comprobantes_electronicos WHERE id = :id");
            $stmt->execute([':id' => $pago['comprobante_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);
            
            // Ajuste de estado
            if ($comp['saldo_pendiente'] >= $comp['total_importe']) {
                $conn->prepare("UPDATE comprobantes_electronicos SET estado_cobro = 'Pendiente' WHERE id = :id")->execute([':id' => $pago['comprobante_id']]);
            } else if ($comp['saldo_pendiente'] <= 0) {
                 // Raro al eliminar un pago, pero por si acaso
                $conn->prepare("UPDATE comprobantes_electronicos SET estado_cobro = 'Pagado' WHERE id = :id")->execute([':id' => $pago['comprobante_id']]);
            }

            // 3. Eliminar registro de pago
            $conn->prepare("DELETE FROM cobranzas_pagos WHERE id = :id")->execute([':id' => $id]);

            $conn->commit();
            echo json_encode(["message" => "Pago eliminado correctamente"]);
            break;

        case 'editar_pago':
            $pago_id = $data['id'] ?? 0;
            if (!$pago_id) throw new Exception("ID de pago requerido");

            $conn->beginTransaction();

            // --- REVERTIR PAGO ANTERIOR ---
            $stmt = $conn->prepare("SELECT * FROM cobranzas_pagos WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $pago_id]);
            $pago_old = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$pago_old) throw new Exception("Pago no encontrado");

            // Revertir movimiento financiero antiguo
            if ($pago_old['caja_movimiento_id']) {
                $conn->prepare("DELETE FROM caja_movimientos WHERE id = :id")->execute([':id' => $pago_old['caja_movimiento_id']]);
            } elseif ($pago_old['banco_movimiento_id']) {
                $stmt = $conn->prepare("SELECT cuenta_id FROM bancos_movimientos WHERE id = :id");
                $stmt->execute([':id' => $pago_old['banco_movimiento_id']]);
                $mov = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($mov) {
                    $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :monto WHERE id = :id")
                         ->execute([':monto' => $pago_old['monto'], ':id' => $mov['cuenta_id']]);
                    $conn->prepare("DELETE FROM bancos_movimientos WHERE id = :id")->execute([':id' => $pago_old['banco_movimiento_id']]);
                }
            }

            // Revertir saldo comprobante
            $conn->prepare("UPDATE comprobantes_electronicos SET saldo_pendiente = saldo_pendiente + :monto WHERE id = :id")
                 ->execute([':monto' => $pago_old['monto'], ':id' => $pago_old['comprobante_id']]);

            // --- APLICAR NUEVO PAGO ---
            // Validar Comprobante (Refrescar datos)
            $stmt = $conn->prepare("SELECT * FROM comprobantes_electronicos WHERE id = :id");
            $stmt->execute([':id' => $pago_old['comprobante_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($data['monto'] > $comp['saldo_pendiente']) {
                throw new Exception("El nuevo monto excede el saldo pendiente ({$comp['saldo_pendiente']})");
            }

            $caja_mov_id = null;
            $banco_mov_id = null;

            // Integración Caja/Bancos Nuevo
            if ($data['medio_pago'] === 'Efectivo') {
                if (empty($data['destino_id'])) {
                    $stmt = $conn->prepare("SELECT id FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' ORDER BY id DESC LIMIT 1");
                    $stmt->execute([':uid' => $usuario_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$sesion) throw new Exception("No tienes una caja abierta.");
                    $caja_sesion_id = $sesion['id'];
                } else {
                    $caja_sesion_id = $data['destino_id'];
                }

                $concepto = "Cobro Factura {$comp['serie']}-{$comp['correlativo']} (Editado)";
                $sqlCaja = "INSERT INTO caja_movimientos (sesion_id, tipo, monto, concepto, usuario_id, fecha) 
                            VALUES (:sid, 'Ingreso', :monto, :conc, :uid, NOW())";
                $conn->prepare($sqlCaja)->execute([
                    ':sid' => $caja_sesion_id,
                    ':monto' => $data['monto'],
                    ':conc' => $concepto,
                    ':uid' => $usuario_id
                ]);
                $caja_mov_id = $conn->lastInsertId();

            } elseif (in_array($data['medio_pago'], ['Transferencia', 'Cheque', 'Deposito'])) {
                if (empty($data['destino_id'])) throw new Exception("Debe seleccionar una cuenta bancaria");
                
                $concepto = "Cobro Factura {$comp['serie']}-{$comp['correlativo']} ({$data['referencia']}) (Editado)";
                $sqlBanco = "INSERT INTO bancos_movimientos (cuenta_id, tipo, origen_destino, monto, concepto, referencia, entidad, usuario_id, fecha) 
                             VALUES (:cid, 'Ingreso', :origen, :monto, :conc, :ref, :entidad, :uid, NOW())";
                $conn->prepare($sqlBanco)->execute([
                    ':cid' => $data['destino_id'],
                    ':origen' => 'Cliente',
                    ':monto' => $data['monto'],
                    ':conc' => $concepto,
                    ':ref' => $data['referencia'] ?? '',
                    ':entidad' => $comp['cliente_razon_social'],
                    ':uid' => $usuario_id
                ]);
                $banco_mov_id = $conn->lastInsertId();
                
                $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :monto WHERE id = :id")
                     ->execute([':monto' => $data['monto'], ':id' => $data['destino_id']]);
            }

            // Manejo de archivo
            $archivoPath = $pago_old['archivo_constancia']; 
            if (isset($_FILES['archivo'])) {
                $nuevoArchivo = handleFileUpload($_FILES['archivo']);
                if ($nuevoArchivo) {
                    $archivoPath = $nuevoArchivo;
                    if ($pago_old['archivo_constancia'] && file_exists($pago_old['archivo_constancia'])) {
                        unlink($pago_old['archivo_constancia']);
                    }
                }
            }

            // Actualizar registro de pago (UPDATE)
            $sql = "UPDATE cobranzas_pagos SET 
                    monto = :monto, 
                    medio_pago = :medio, 
                    referencia = :ref, 
                    destino_id = :dest, 
                    observaciones = :obs, 
                    caja_movimiento_id = :caja_id, 
                    banco_movimiento_id = :banco_id,
                    archivo_constancia = :archivo
                    WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':monto' => $data['monto'],
                ':medio' => $data['medio_pago'],
                ':ref' => $data['referencia'] ?? '',
                ':dest' => $data['destino_id'] ?? null,
                ':obs' => $data['observaciones'] ?? '',
                ':caja_id' => $caja_mov_id,
                ':banco_id' => $banco_mov_id,
                ':archivo' => $archivoPath,
                ':id' => $pago_id
            ]);

            // Actualizar saldo Comprobante
            $nuevo_saldo = bcsub($comp['saldo_pendiente'], $data['monto'], 2);
            $estado_cobro = ($nuevo_saldo <= 0) ? 'Pagado' : 'Parcial';
            // Si saldo es igual al total -> Pendiente
            if ($nuevo_saldo >= $comp['total_importe']) $estado_cobro = 'Pendiente';

            $sql = "UPDATE comprobantes_electronicos SET saldo_pendiente = :saldo, estado_cobro = :estado WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':saldo' => $nuevo_saldo, ':estado' => $estado_cobro, ':id' => $comp['id']]);

            $conn->commit();
            echo json_encode(["message" => "Pago actualizado correctamente"]);
            break;

        case 'reporte_morosidad':
            $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 20;
            if ($page < 1) $page = 1;
            if ($limit < 1) $limit = 20;

            $baseSql = "FROM comprobantes_electronicos 
                        WHERE estado = 'Aceptado'
                          AND saldo_pendiente > 0
                          AND fecha_vencimiento < CURDATE()";

            $countSql = "SELECT COUNT(*) as total FROM (
                            SELECT cliente_num_doc 
                            $baseSql
                            GROUP BY cliente_num_doc, cliente_razon_social
                         ) t";
            $stmtCount = $conn->query($countSql);
            $totalRows = (int) $stmtCount->fetchColumn();

            $offset = ($page - 1) * $limit;

            $sql = "SELECT cliente_razon_social, 
                           cliente_num_doc, 
                           SUM(saldo_pendiente) as total_deuda,
                           COUNT(id) as cantidad_facturas,
                           MAX(DATEDIFF(CURDATE(), fecha_vencimiento)) as max_dias_atraso
                    $baseSql
                    GROUP BY cliente_num_doc, cliente_razon_social
                    ORDER BY total_deuda DESC
                    LIMIT :limit OFFSET :offset";

            $stmt = $conn->prepare($sql);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'data' => is_array($rows) ? $rows : [],
                'pagination' => [
                    'total' => $totalRows,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int) ceil($totalRows / $limit) : 1
                ]
            ]);
            break;
            
        case 'estado_cuenta':
            $cliente_doc = $_GET['doc'] ?? '';
            $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 20;
            if ($page < 1) $page = 1;
            if ($limit < 1) $limit = 20;

            if (empty($cliente_doc)) {
                $baseSql = "FROM comprobantes_electronicos 
                            WHERE estado = 'Aceptado'
                              AND saldo_pendiente > 0";

                $countSql = "SELECT COUNT(*) as total FROM (
                                SELECT cliente_num_doc 
                                $baseSql
                                GROUP BY cliente_num_doc, cliente_razon_social
                             ) t";
                $stmtCount = $conn->query($countSql);
                $totalRows = (int) $stmtCount->fetchColumn();

                $offset = ($page - 1) * $limit;

                $sql = "SELECT cliente_razon_social, cliente_num_doc, SUM(saldo_pendiente) as deuda_total 
                        $baseSql
                        GROUP BY cliente_num_doc, cliente_razon_social
                        ORDER BY deuda_total DESC
                        LIMIT :limit OFFSET :offset";
                $stmt = $conn->prepare($sql);
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $whereSql = "FROM comprobantes_electronicos 
                             WHERE cliente_num_doc = :doc
                               AND estado = 'Aceptado'";

                $countSql = "SELECT COUNT(*) as total $whereSql";
                $stmtCount = $conn->prepare($countSql);
                $stmtCount->execute([':doc' => $cliente_doc]);
                $totalRows = (int) $stmtCount->fetchColumn();

                $offset = ($page - 1) * $limit;

                $sql = "SELECT * 
                        $whereSql
                        ORDER BY fecha_emision DESC
                        LIMIT :limit OFFSET :offset";
                $stmt = $conn->prepare($sql);
                $stmt->bindValue(':doc', $cliente_doc);
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            echo json_encode([
                'data' => is_array($rows) ? $rows : [],
                'pagination' => [
                    'total' => $totalRows,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int) ceil($totalRows / $limit) : 1
                ]
            ]);
            break;

        default:
            http_response_code(400);
            echo json_encode(["message" => "Accion invalida"]);
    }
} catch (Exception $e) {
    if (isset($conn) && $conn->inTransaction()) {
        $conn->rollBack();
    }
    http_response_code(500);
    echo json_encode(["message" => "Error interno: " . $e->getMessage()]);
}
if (isset($conn)) $conn = null;
?>
