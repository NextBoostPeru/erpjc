<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

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
$usuario_id = $userData->id;
$action = $_GET['action'] ?? '';

if (!($method === 'GET' && $action === 'listar_cuentas')) {
    rbac_require($conn, $userData, 'bancos', $method);
}

function moneyToFloat($value) {
    if ($value === null) return null;
    if (is_int($value) || is_float($value)) return (float)$value;
    $s = trim((string)$value);
    if ($s === '') return null;
    $s = preg_replace('/[^\d\.,\-]/', '', $s);

    $hasComma = strpos($s, ',') !== false;
    $hasDot = strpos($s, '.') !== false;

    if ($hasComma && $hasDot) {
        $lastComma = strrpos($s, ',');
        $lastDot = strrpos($s, '.');
        if ($lastComma > $lastDot) {
            $s = str_replace('.', '', $s);
            $s = str_replace(',', '.', $s);
        } else {
            $s = str_replace(',', '', $s);
        }
    } elseif ($hasComma) {
        $s = str_replace('.', '', $s);
        $s = str_replace(',', '.', $s);
    } else {
        if (substr_count($s, '.') > 1) {
            $parts = explode('.', $s);
            $dec = array_pop($parts);
            $s = implode('', $parts) . '.' . $dec;
        }
    }

    if (!is_numeric($s)) return null;
    return (float)$s;
}

switch ($action) {
    case 'listar_cuentas':
        $sql = "SELECT * FROM bancos_cuentas ORDER BY nombre_banco";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        $cuentas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Calcular totales del mes
        foreach ($cuentas as &$cuenta) {
            $cuenta['es_detraccion'] = ($cuenta['tipo_cuenta'] === 'Detracciones' || stripos($cuenta['nombre_banco'], 'Naci') !== false);

            $sql = "SELECT 
                        COALESCE(SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE 0 END), 0) as ingresos_mes,
                        COALESCE(SUM(CASE WHEN (tipo = 'Egreso' OR tipo = 'Transferencia') THEN monto ELSE 0 END), 0) as egresos_mes
                    FROM bancos_movimientos 
                    WHERE cuenta_id = :cid AND MONTH(fecha) = MONTH(CURRENT_DATE()) AND YEAR(fecha) = YEAR(CURRENT_DATE())";
            $stmtMov = $conn->prepare($sql);
            $stmtMov->execute([':cid' => $cuenta['id']]);
            $totales = $stmtMov->fetch(PDO::FETCH_ASSOC);
            $cuenta['ingresos_mes'] = $totales['ingresos_mes'];
            $cuenta['egresos_mes'] = $totales['egresos_mes'];
        }
        
        echo json_encode($cuentas);
        break;

    case 'crear_cuenta':
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['nombre_banco']) || empty($data['numero_cuenta'])) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $saldoInicial = moneyToFloat($data['saldo_inicial'] ?? 0) ?? 0;
        $mostrarEnPdf = !empty($data['mostrar_en_pdf']) ? 1 : 0;
        $sql = "INSERT INTO bancos_cuentas (nombre_banco, numero_cuenta, tipo_cuenta, moneda, saldo_actual, cuenta_contable, cci, titular, mostrar_en_pdf) 
                VALUES (:nombre, :numero, :tipo, :moneda, :saldo, :contable, :cci, :titular, :mostrar)";
        $stmt = $conn->prepare($sql);
        if ($stmt->execute([
            ':nombre' => $data['nombre_banco'],
            ':numero' => $data['numero_cuenta'],
            ':tipo' => $data['tipo_cuenta'],
            ':moneda' => $data['moneda'],
            ':saldo' => $saldoInicial,
            ':contable' => $data['cuenta_contable'] ?? null,
            ':cci' => $data['cci'] ?? null,
            ':titular' => $data['titular'] ?? null,
            ':mostrar' => $mostrarEnPdf
        ])) {
            echo json_encode(["message" => "Cuenta bancaria creada"]);
        } else {
            http_response_code(500);
            echo json_encode(["message" => "Error al crear cuenta"]);
        }
        break;

    case 'editar_cuenta':
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['id']) || empty($data['nombre_banco']) || empty($data['numero_cuenta'])) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $mostrarEnPdf = !empty($data['mostrar_en_pdf']) ? 1 : 0;
        $sql = "UPDATE bancos_cuentas SET 
                    nombre_banco = :nombre, 
                    numero_cuenta = :numero, 
                    tipo_cuenta = :tipo, 
                    moneda = :moneda, 
                    cuenta_contable = :contable,
                    cci = :cci,
                    titular = :titular,
                    mostrar_en_pdf = :mostrar
                WHERE id = :id";
        $stmt = $conn->prepare($sql);
        if ($stmt->execute([
            ':nombre' => $data['nombre_banco'],
            ':numero' => $data['numero_cuenta'],
            ':tipo' => $data['tipo_cuenta'],
            ':moneda' => $data['moneda'],
            ':contable' => $data['cuenta_contable'] ?? null,
            ':cci' => $data['cci'] ?? null,
            ':titular' => $data['titular'] ?? null,
            ':mostrar' => $mostrarEnPdf,
            ':id' => $data['id']
        ])) {
            echo json_encode(["message" => "Cuenta actualizada"]);
        } else {
            http_response_code(500);
            echo json_encode(["message" => "Error al actualizar cuenta"]);
        }
        break;

    case 'eliminar_cuenta':
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['id'])) {
            http_response_code(400);
            echo json_encode(["message" => "ID requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            // Verificar movimientos (Advertencia: Eliminará en cascada si está configurado en BD, 
            // pero si no, fallará por FK. Intentaremos eliminar directo para permitir limpieza).
            // Si se desea bloqueo estricto, descomentar lo siguiente:
            /*
            $stmt = $conn->prepare("SELECT COUNT(*) FROM bancos_movimientos WHERE cuenta_id = :id");
            $stmt->execute([':id' => $data['id']]);
            if ($stmt->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(["message" => "No se puede eliminar: tiene movimientos registrados"]);
                if (isset($conn)) $conn = null;
                exit;
            }
            */

            $stmt = $conn->prepare("DELETE FROM bancos_cuentas WHERE id = :id");
            if ($stmt->execute([':id' => $data['id']])) {
                echo json_encode(["message" => "Cuenta eliminada correctamente"]);
            } else {
                http_response_code(500);
                echo json_encode(["message" => "Error al eliminar la cuenta. Verifique que no tenga movimientos asociados si la BD no soporta borrado en cascada."]);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'listar_movimientos':
        $cuenta_id = $_GET['cuenta_id'] ?? null;
        if (!$cuenta_id) {
            echo json_encode([]);
            break;
        }

        $hasPaging = isset($_GET['page']) || isset($_GET['limit']) || isset($_GET['search']);
        if (!$hasPaging) {
            $sql = "SELECT m.*, u.usuario 
                    FROM bancos_movimientos m 
                    LEFT JOIN usuarios u ON m.usuario_id = u.id 
                    WHERE m.cuenta_id = :id 
                    ORDER BY m.fecha DESC LIMIT 100";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':id' => $cuenta_id]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        }

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        if ($page < 1) $page = 1;

        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        if ($limit < 1) $limit = 20;
        if ($limit > 200) $limit = 200;

        $search = trim((string)($_GET['search'] ?? ''));

        $where = "m.cuenta_id = :id";
        $params = [':id' => $cuenta_id];
        if ($search !== '') {
            $where .= " AND (m.concepto LIKE :q OR m.referencia LIKE :q OR m.entidad LIKE :q OR u.usuario LIKE :q)";
            $params[':q'] = '%' . $search . '%';
        }

        $sqlCount = "SELECT COUNT(*) 
                     FROM bancos_movimientos m 
                     LEFT JOIN usuarios u ON m.usuario_id = u.id 
                     WHERE $where";
        $stmtCount = $conn->prepare($sqlCount);
        $stmtCount->execute($params);
        $total = (int)$stmtCount->fetchColumn();
        $totalPages = max(1, (int)ceil($total / $limit));
        if ($page > $totalPages) $page = $totalPages;
        $offset = ($page - 1) * $limit;

        $sql = "SELECT m.*, u.usuario 
                FROM bancos_movimientos m 
                LEFT JOIN usuarios u ON m.usuario_id = u.id 
                WHERE $where 
                ORDER BY m.fecha DESC 
                LIMIT $limit OFFSET $offset";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);

        echo json_encode([
            "data" => $stmt->fetchAll(PDO::FETCH_ASSOC),
            "pagination" => [
                "total" => $total,
                "page" => $page,
                "limit" => $limit,
                "totalPages" => $totalPages
            ]
        ]);
        break;

    case 'registrar_movimiento':
        $data = json_decode(file_get_contents("php://input"), true);
        $monto = moneyToFloat($data['monto'] ?? null);
        if (empty($data['cuenta_id']) || $monto === null || $monto <= 0 || empty($data['tipo']) || empty($data['concepto'])) {
            http_response_code(400);
            echo json_encode(["message" => "Datos inválidos: Monto debe ser mayor a 0"]);
            exit;
        }

        try {
            $conn->beginTransaction();
            
            // Prevent Deadlock: Lock account row first (Explicit Exclusive Lock)
            $stmtLock = $conn->prepare("SELECT id FROM bancos_cuentas WHERE id = ? FOR UPDATE");
            $stmtLock->execute([$data['cuenta_id']]);
            
            // 1. Insertar Movimiento
            $sql = "INSERT INTO bancos_movimientos (cuenta_id, tipo, origen_destino, monto, concepto, referencia, entidad, usuario_id, fecha) 
                    VALUES (:cid, :tipo, :origen, :monto, :concepto, :ref, :entidad, :uid, IFNULL(:fecha, NOW()))";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':cid' => $data['cuenta_id'],
                ':tipo' => $data['tipo'], // Ingreso, Egreso, Transferencia
                ':origen' => $data['origen_destino'] ?? 'Ventanilla',
                ':monto' => $monto,
                ':concepto' => $data['concepto'],
                ':ref' => $data['referencia'] ?? '',
                ':entidad' => $data['entidad'] ?? '',
                ':uid' => $usuario_id,
                ':fecha' => !empty($data['fecha']) ? $data['fecha'] : null
            ]);
            $movimiento_id = $conn->lastInsertId();

            // 2. Actualizar Saldo Cuenta
            $factor = ($data['tipo'] === 'Ingreso') ? 1 : -1;
            $sql = "UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :monto WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':monto' => $monto * $factor, ':id' => $data['cuenta_id']]);

            // 3. Integración Contable (Simplificada)
            if (!empty($data['cuenta_contable'])) {
                // Obtener cuenta contable del banco
                $stmt = $conn->prepare("SELECT cuenta_contable FROM bancos_cuentas WHERE id = :id");
                $stmt->execute([':id' => $data['cuenta_id']]);
                $banco = $stmt->fetch(PDO::FETCH_ASSOC);
                $cta_banco = $banco['cuenta_contable'] ?: '104'; // Default 104
                $cta_contra = $data['cuenta_contable']; // La cuenta de gasto/ingreso seleccionada

                // Crear Asiento
                $glosa = "Banco " . $data['tipo'] . ": " . $data['concepto'];
                $sqlHead = "INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, estado, usuario_id) 
                            VALUES (NOW(), :glosa, 'Diario', 'PEN', 'Finalizado', :uid)";
                $conn->prepare($sqlHead)->execute([':glosa' => $glosa, ':uid' => $usuario_id]);
                $asiento_id = $conn->lastInsertId();

                // Detalles
                $sqlDet = "INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)";
                $stmtDet = $conn->prepare($sqlDet);

                if ($data['tipo'] === 'Ingreso') {
                    // Debe: Banco, Haber: Contrapartida
                    $stmtDet->execute([':aid' => $asiento_id, ':cta' => $cta_banco, ':debe' => $monto, ':haber' => 0]);
                    $stmtDet->execute([':aid' => $asiento_id, ':cta' => $cta_contra, ':debe' => 0, ':haber' => $monto]);
                } else {
                    // Haber: Banco, Debe: Contrapartida
                    $stmtDet->execute([':aid' => $asiento_id, ':cta' => $cta_contra, ':debe' => $monto, ':haber' => 0]);
                    $stmtDet->execute([':aid' => $asiento_id, ':cta' => $cta_banco, ':debe' => 0, ':haber' => $monto]);
                }
            }

            $conn->commit();
            echo json_encode(["message" => "Movimiento registrado"]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'transferencia':
        $data = json_decode(file_get_contents("php://input"), true);
        $monto = moneyToFloat($data['monto'] ?? null);
        if (empty($data['cuenta_origen']) || $monto === null || $monto <= 0) {
            http_response_code(400);
            echo json_encode(["message" => "Datos inválidos"]);
            exit;
        }

        try {
            $conn->beginTransaction();
            
            // Prevent Deadlock: Lock involved accounts in deterministic order (by ID)
            $cuentas_ids = [$data['cuenta_origen']];
            if (!empty($data['cuenta_destino_id'])) {
                $cuentas_ids[] = $data['cuenta_destino_id'];
            }
            sort($cuentas_ids); // Sort to ensure consistent locking order (avoid A->B vs B->A)
            
            $stmtLock = $conn->prepare("SELECT id, nombre_banco FROM bancos_cuentas WHERE id = ? FOR UPDATE");
            $nombres_bancos = [];
            foreach ($cuentas_ids as $cid) {
                $stmtLock->execute([$cid]);
                $row = $stmtLock->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $nombres_bancos[$cid] = $row['nombre_banco'];
                } else {
                    throw new Exception("Cuenta ID $cid no encontrada");
                }
            }
            
            $nombre_origen = $nombres_bancos[$data['cuenta_origen']];
            $nombre_destino = !empty($data['cuenta_destino_id']) ? $nombres_bancos[$data['cuenta_destino_id']] : ($data['cuenta_destino_nombre'] ?? 'Externo');

            // 1. Salida de Origen
            $sql = "INSERT INTO bancos_movimientos (cuenta_id, tipo, monto, concepto, referencia, usuario_id, fecha) 
                    VALUES (:cid, 'Transferencia', :monto, :concepto, :ref, :uid, IFNULL(:fecha, NOW()))";
            $conn->prepare($sql)->execute([
                ':cid' => $data['cuenta_origen'],
                ':monto' => $monto,
                ':concepto' => 'Transferencia a ' . $nombre_destino, 
                ':ref' => $data['referencia'],
                ':uid' => $usuario_id,
                ':fecha' => !empty($data['fecha']) ? $data['fecha'] : null
            ]);
            // Actualizar Saldo Origen
            $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :m WHERE id = :id")
                 ->execute([':m' => $monto, ':id' => $data['cuenta_origen']]);

            // 2. Entrada a Destino (si es interna)
            if (!empty($data['cuenta_destino_id'])) {
                $sql = "INSERT INTO bancos_movimientos (cuenta_id, tipo, monto, concepto, referencia, usuario_id, fecha) 
                        VALUES (:cid, 'Ingreso', :monto, :concepto, :ref, :uid, IFNULL(:fecha, NOW()))";
                $conn->prepare($sql)->execute([
                    ':cid' => $data['cuenta_destino_id'],
                    ':monto' => $monto,
                    ':concepto' => 'Transferencia desde ' . $nombre_origen,
                    ':ref' => $data['referencia'],
                    ':uid' => $usuario_id,
                    ':fecha' => !empty($data['fecha']) ? $data['fecha'] : null
                ]);
                // Actualizar Saldo Destino
                $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :m WHERE id = :id")
                     ->execute([':m' => $monto, ':id' => $data['cuenta_destino_id']]);
            }

            $conn->commit();
            echo json_encode(["message" => "Transferencia realizada"]);
        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'emitir_cheque':
        $data = json_decode(file_get_contents("php://input"), true);
        $monto = moneyToFloat($data['monto'] ?? null);
        if (empty($data['cuenta_id']) || $monto === null || $monto <= 0 || empty($data['numero_cheque'])) {
            http_response_code(400);
            echo json_encode(["message" => "Datos inválidos"]);
            exit;
        }

        try {
            $conn->beginTransaction();
            
            // Prevent Deadlock: Lock account row first
            $stmtLock = $conn->prepare("SELECT id FROM bancos_cuentas WHERE id = ? FOR UPDATE");
            $stmtLock->execute([$data['cuenta_id']]);
            
            // Registrar Movimiento (Egreso pendiente o directo?)
            // Generalmente el cheque reduce el saldo contable, pero el disponible hasta que se cobra.
            // Aqui lo trataremos como egreso inmediato para simplificar saldo contable.
            
            $sql = "INSERT INTO bancos_movimientos (cuenta_id, tipo, origen_destino, monto, concepto, referencia, entidad, usuario_id, fecha) 
                    VALUES (:cid, 'Egreso', 'Cheque', :monto, :concepto, :ref, :entidad, :uid, IFNULL(:fecha, NOW()))";
            $conn->prepare($sql)->execute([
                ':cid' => $data['cuenta_id'],
                ':monto' => $monto,
                ':concepto' => 'Cheque Girado: ' . $data['numero_cheque'],
                ':ref' => $data['numero_cheque'],
                ':entidad' => $data['beneficiario'],
                ':uid' => $usuario_id,
                ':fecha' => !empty($data['fecha_emision']) ? ($data['fecha_emision'] . ' 00:00:00') : null
            ]);
            $mov_id = $conn->lastInsertId();

            // Registrar Cheque
            $sql = "INSERT INTO bancos_cheques (cuenta_id, numero_cheque, beneficiario, monto, fecha_emision, fecha_pago, estado, movimiento_id) 
                    VALUES (:cid, :num, :ben, :monto, :fecha, :pago, 'Emitido', :mid)";
            $conn->prepare($sql)->execute([
                ':cid' => $data['cuenta_id'],
                ':num' => $data['numero_cheque'],
                ':ben' => $data['beneficiario'],
                ':monto' => $monto,
                ':fecha' => !empty($data['fecha_emision']) ? $data['fecha_emision'] : null,
                ':pago' => !empty($data['fecha_pago']) ? $data['fecha_pago'] : null,
                ':mid' => $mov_id
            ]);

            // Actualizar Saldo
            $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :m WHERE id = :id")
                 ->execute([':m' => $data['monto'], ':id' => $data['cuenta_id']]);

            $conn->commit();
            echo json_encode(["message" => "Cheque emitido correctamente"]);

        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;
        
    case 'conciliar':
        $data = json_decode(file_get_contents("php://input"), true);
        if (!isset($data['ids']) || !is_array($data['ids']) || empty($data['ids'])) {
            http_response_code(400);
            echo json_encode(["message" => "No se seleccionaron movimientos"]);
            $conn = null;
            exit;
        }
        $ids = $data['ids']; // Array de IDs de movimientos
        
        $inQuery = implode(',', array_fill(0, count($ids), '?'));
        $sql = "UPDATE bancos_movimientos SET estado = 'Conciliado' WHERE id IN ($inQuery)";
        $stmt = $conn->prepare($sql);
        if ($stmt->execute($ids)) {
            echo json_encode(["message" => "Movimientos conciliados"]);
        } else {
            http_response_code(500);
            echo json_encode(["message" => "Error al conciliar"]);
        }
        break;
    
    case 'editar_movimiento':
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['id'])) {
            http_response_code(400);
            echo json_encode(["message" => "ID de movimiento requerido"]);
            exit;
        }
        try {
            // Obtener movimiento actual
            $stmt = $conn->prepare("SELECT * FROM bancos_movimientos WHERE id = :id");
            $stmt->execute([':id' => $data['id']]);
            $mov = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$mov) {
                http_response_code(404);
                echo json_encode(["message" => "Movimiento no encontrado"]);
                exit;
            }
            if (isset($mov['estado']) && $mov['estado'] === 'Conciliado') {
                http_response_code(400);
                echo json_encode(["message" => "No se puede editar un movimiento conciliado"]);
                exit;
            }

            // Campos editables
            $nuevo_monto = (float)$mov['monto'];
            if (array_key_exists('monto', $data)) {
                $parsed = moneyToFloat($data['monto']);
                if ($parsed === null || $parsed <= 0) {
                    http_response_code(400);
                    echo json_encode(["message" => "Monto inválido"]);
                    exit;
                }
                $nuevo_monto = $parsed;
            }
            $concepto = $data['concepto'] ?? $mov['concepto'];
            $referencia = $data['referencia'] ?? $mov['referencia'];
            $entidad = $data['entidad'] ?? $mov['entidad'];
            $origen_destino = $data['origen_destino'] ?? $mov['origen_destino'];
            $fecha = !empty($data['fecha']) ? $data['fecha'] : null;

            $conn->beginTransaction();
            // Ajustar saldo por delta
            $delta = $nuevo_monto - (float)$mov['monto'];
            if (abs($delta) > 0.0000001) {
                if ($mov['tipo'] === 'Ingreso') {
                    // Ingreso suma saldo; delta positivo suma, negativo resta
                    $stmtSaldo = $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :d WHERE id = :id");
                    $stmtSaldo->execute([':d' => $delta, ':id' => $mov['cuenta_id']]);
                } else {
                    // Egreso/Transferencia restan saldo; aumentar monto -> restar más (delta positivo => restar), delta negativo => sumar
                    $stmtSaldo = $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :d WHERE id = :id");
                    $stmtSaldo->execute([':d' => $delta, ':id' => $mov['cuenta_id']]);
                }
            }

            // Actualizar movimiento
            $sqlUpd = "UPDATE bancos_movimientos 
                       SET monto = :monto, concepto = :concepto, referencia = :ref, entidad = :entidad, origen_destino = :origen" . 
                      ($fecha ? ", fecha = :fecha" : "") . " 
                       WHERE id = :id";
            $stmtUpd = $conn->prepare($sqlUpd);
            $params = [
                ':monto' => $nuevo_monto,
                ':concepto' => $concepto,
                ':ref' => $referencia,
                ':entidad' => $entidad,
                ':origen' => $origen_destino,
                ':id' => $data['id']
            ];
            if ($fecha) {
                $params[':fecha'] = $fecha;
            }
            $stmtUpd->execute($params);

            $conn->commit();
            echo json_encode(["message" => "Movimiento actualizado"]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al editar: " . $e->getMessage()]);
        }
        break;

    case 'eliminar_movimiento':
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['id'])) {
            http_response_code(400);
            echo json_encode(["message" => "ID de movimiento requerido"]);
            exit;
        }
        try {
            // Obtener movimiento actual
            $stmt = $conn->prepare("SELECT * FROM bancos_movimientos WHERE id = :id");
            $stmt->execute([':id' => $data['id']]);
            $mov = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$mov) {
                http_response_code(404);
                echo json_encode(["message" => "Movimiento no encontrado"]);
                exit;
            }
            if (isset($mov['estado']) && $mov['estado'] === 'Conciliado') {
                http_response_code(400);
                echo json_encode(["message" => "No se puede eliminar un movimiento conciliado"]);
                exit;
            }

            $conn->beginTransaction();
            // Revertir saldo
            if ($mov['tipo'] === 'Ingreso') {
                $stmtSaldo = $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :m WHERE id = :id");
                $stmtSaldo->execute([':m' => $mov['monto'], ':id' => $mov['cuenta_id']]);
            } else {
                $stmtSaldo = $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :m WHERE id = :id");
                $stmtSaldo->execute([':m' => $mov['monto'], ':id' => $mov['cuenta_id']]);
            }

            // Eliminar movimiento
            $stmtDel = $conn->prepare("DELETE FROM bancos_movimientos WHERE id = :id");
            $stmtDel->execute([':id' => $mov['id']]);

            $conn->commit();
            echo json_encode(["message" => "Movimiento eliminado"]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "No se pudo eliminar el movimiento. " . $e->getMessage()]);
        }
        break;
        
    default:
        echo json_encode(["message" => "Accion invalida"]);
}

if (isset($conn)) $conn = null;
?>
