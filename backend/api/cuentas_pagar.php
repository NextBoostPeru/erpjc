<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header('Content-Type: application/json');

function handleFileUpload($file, $uploadDir = '../uploads/pagos/') {
    if (!isset($file) || $file['error'] !== UPLOAD_ERR_OK) {
        return null;
    }

    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid('pago_') . '.' . $extension;
    $destination = $uploadDir . $filename;

    if (move_uploaded_file($file['tmp_name'], $destination)) {
        return $destination;
    }
    return null;
}

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
    rbac_require($conn, $userData, 'cuentas_pagar', $method);

    $usuario_id = $userData->id;
    $action = $_GET['action'] ?? '';

    // Helper to get input data (JSON or POST)
    $inputJSON = json_decode(file_get_contents("php://input"), true);
    $data = $inputJSON ?? $_POST;

    switch ($action) {
        case 'dashboard':
            // Total por pagar
            $sql = "SELECT 
                        SUM(saldo_pendiente) as total_por_pagar,
                        SUM(CASE WHEN fecha_vencimiento < CURDATE() THEN saldo_pendiente ELSE 0 END) as total_vencido
                    FROM comprobantes_compra 
                    WHERE estado != 'Anulado' AND saldo_pendiente > 0";
            $stmt = $conn->query($sql);
            $totals = $stmt->fetch(PDO::FETCH_ASSOC);

            // Pagado este mes
            $sql = "SELECT SUM(monto) as pagado_mes 
                    FROM pagos_proveedores 
                    WHERE MONTH(fecha) = MONTH(CURRENT_DATE()) AND YEAR(fecha) = YEAR(CURRENT_DATE())";
            $stmt = $conn->query($sql);
            $pagado = $stmt->fetch(PDO::FETCH_ASSOC);

            echo json_encode([
                "por_pagar" => $totals['total_por_pagar'] ?? 0,
                "vencido" => $totals['total_vencido'] ?? 0,
                "pagado_mes" => $pagado['pagado_mes'] ?? 0
            ]);
            break;

        case 'listar_pendientes':
            $proveedor = $_GET['proveedor'] ?? '';
            $estado_filter = $_GET['estado_filter'] ?? ''; // vencido, al_dia, todos

            $sql = "SELECT id, fecha_emision, fecha_vencimiento, serie, numero, 
                           proveedor_razon_social, proveedor_num_doc, moneda, importe_total, saldo_pendiente, 
                           DATEDIFF(CURDATE(), fecha_vencimiento) as dias_retraso, estado_pago
                    FROM comprobantes_compra 
                    WHERE estado != 'Anulado' AND saldo_pendiente > 0";
            
            if (!empty($proveedor)) {
                $sql .= " AND (proveedor_razon_social LIKE :prov OR proveedor_num_doc LIKE :prov)";
            }

            if ($estado_filter === 'vencido') {
                $sql .= " AND fecha_vencimiento < CURDATE()";
            } elseif ($estado_filter === 'al_dia') {
                $sql .= " AND fecha_vencimiento >= CURDATE()";
            }
            
            $sql .= " ORDER BY fecha_vencimiento ASC";
            
            $stmt = $conn->prepare($sql);
            if (!empty($proveedor)) {
                $stmt->bindValue(':prov', "%$proveedor%");
            }
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(is_array($result) ? $result : []);
            break;

        case 'historial_pagos':
            $compra_id = $_GET['id'] ?? 0;
            if (!$compra_id) {
                throw new Exception("ID de compra requerido");
            }
            
            $sql = "SELECT p.*, u.usuario as usuario 
                    FROM pagos_proveedores p
                    LEFT JOIN usuarios u ON p.usuario_id = u.id
                    WHERE p.compra_id = :cid 
                    ORDER BY p.fecha DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':cid' => $compra_id]);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(is_array($result) ? $result : []);
            break;

        case 'registrar_pago':
            $conn->beginTransaction();

            // 1. Validar Compra
            $stmt = $conn->prepare("SELECT * FROM comprobantes_compra WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $data['compra_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$comp) throw new Exception("Comprobante de compra no encontrado");
            
            if ($data['monto'] > $comp['saldo_pendiente']) {
                throw new Exception("El monto excede el saldo pendiente ({$comp['saldo_pendiente']})");
            }

            $caja_mov_id = null;
            $banco_mov_id = null;

            // Integración Caja/Bancos
            if ($data['medio_pago'] === 'Efectivo') {
                if (empty($data['origen_id'])) { 
                    $stmt = $conn->prepare("SELECT id FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' ORDER BY id DESC LIMIT 1");
                    $stmt->execute([':uid' => $usuario_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$sesion) throw new Exception("No tienes una caja abierta para realizar pagos en efectivo.");
                    $caja_sesion_id = $sesion['id'];
                } else {
                    $caja_sesion_id = $data['origen_id'];
                }

                $concepto = "Pago Factura Compra {$comp['serie']}-{$comp['numero']}";
                $sqlCaja = "INSERT INTO caja_movimientos (sesion_id, tipo, monto, concepto, usuario_id, fecha) 
                            VALUES (:sid, 'Egreso', :monto, :conc, :uid, NOW())";
                $conn->prepare($sqlCaja)->execute([
                    ':sid' => $caja_sesion_id,
                    ':monto' => $data['monto'],
                    ':conc' => $concepto,
                    ':uid' => $usuario_id
                ]);
                $caja_mov_id = $conn->lastInsertId();

            } elseif (in_array($data['medio_pago'], ['Transferencia', 'Cheque'])) {
                if (empty($data['origen_id'])) throw new Exception("Debe seleccionar una cuenta bancaria de origen");
                
                $concepto = "Pago Factura Compra {$comp['serie']}-{$comp['numero']} ({$data['referencia']})";
                $sqlBanco = "INSERT INTO bancos_movimientos (cuenta_id, tipo, origen_destino, monto, concepto, referencia, entidad, usuario_id, fecha) 
                             VALUES (:cid, 'Egreso', :origen, :monto, :conc, :ref, :entidad, :uid, NOW())";
                $conn->prepare($sqlBanco)->execute([
                    ':cid' => $data['origen_id'],
                    ':origen' => 'Proveedor',
                    ':monto' => $data['monto'],
                    ':conc' => $concepto,
                    ':ref' => $data['referencia'] ?? '',
                    ':entidad' => $comp['proveedor_razon_social'],
                    ':uid' => $usuario_id
                ]);
                $banco_mov_id = $conn->lastInsertId();
                
                $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :monto WHERE id = :id")
                     ->execute([':monto' => $data['monto'], ':id' => $data['origen_id']]);
            }

            // Manejo de archivo
            $archivoPath = null;
            if (isset($_FILES['archivo'])) {
                $archivoPath = handleFileUpload($_FILES['archivo']);
            }

            // 2. Insertar Pago
            $sql = "INSERT INTO pagos_proveedores (compra_id, monto, medio_pago, referencia, origen_id, observaciones, usuario_id, caja_movimiento_id, banco_movimiento_id, archivo_constancia) 
                    VALUES (:cid, :monto, :medio, :ref, :origen, :obs, :uid, :caja_id, :banco_id, :archivo)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':cid' => $data['compra_id'],
                ':monto' => $data['monto'],
                ':medio' => $data['medio_pago'],
                ':ref' => $data['referencia'] ?? '',
                ':origen' => $data['origen_id'] ?? null,
                ':obs' => $data['observaciones'] ?? '',
                ':uid' => $usuario_id,
                ':caja_id' => $caja_mov_id,
                ':banco_id' => $banco_mov_id,
                ':archivo' => $archivoPath
            ]);

            // 3. Actualizar Comprobante
            $nuevo_saldo = bcsub($comp['saldo_pendiente'], $data['monto'], 2);
            $estado_pago = ($nuevo_saldo <= 0) ? 'Pagado' : 'Parcial';
            
            $sql = "UPDATE comprobantes_compra SET saldo_pendiente = :saldo, estado_pago = :estado WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':saldo' => $nuevo_saldo, ':estado' => $estado_pago, ':id' => $data['compra_id']]);

            $conn->commit();
            echo json_encode(["message" => "Pago registrado correctamente", "nuevo_saldo" => $nuevo_saldo]);
            break;

        case 'eliminar_pago':
            $id = $_GET['id'] ?? 0;
            if (!$id) throw new Exception("ID de pago requerido");

            $conn->beginTransaction();

            $stmt = $conn->prepare("SELECT * FROM pagos_proveedores WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $id]);
            $pago = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$pago) throw new Exception("Pago no encontrado");

            // 1. Revertir movimiento financiero
            if ($pago['caja_movimiento_id']) {
                $conn->prepare("DELETE FROM caja_movimientos WHERE id = :id")->execute([':id' => $pago['caja_movimiento_id']]);
            } elseif ($pago['banco_movimiento_id']) {
                $stmt = $conn->prepare("SELECT cuenta_id FROM bancos_movimientos WHERE id = :id");
                $stmt->execute([':id' => $pago['banco_movimiento_id']]);
                $mov = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($mov) {
                    $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :monto WHERE id = :id")
                         ->execute([':monto' => $pago['monto'], ':id' => $mov['cuenta_id']]);
                    
                    $conn->prepare("DELETE FROM bancos_movimientos WHERE id = :id")->execute([':id' => $pago['banco_movimiento_id']]);
                }
            }

            // 2. Revertir saldo comprobante
            $stmt = $conn->prepare("UPDATE comprobantes_compra SET saldo_pendiente = saldo_pendiente + :monto, estado_pago = 'Parcial' WHERE id = :id");
            $stmt->execute([':monto' => $pago['monto'], ':id' => $pago['compra_id']]);

            // Ajuste de estado
            $stmt = $conn->prepare("SELECT saldo_pendiente, importe_total FROM comprobantes_compra WHERE id = :id");
            $stmt->execute([':id' => $pago['compra_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($comp['saldo_pendiente'] >= $comp['importe_total']) {
                $conn->prepare("UPDATE comprobantes_compra SET estado_pago = 'Pendiente' WHERE id = :id")->execute([':id' => $pago['compra_id']]);
            } else if ($comp['saldo_pendiente'] <= 0) {
                $conn->prepare("UPDATE comprobantes_compra SET estado_pago = 'Pagado' WHERE id = :id")->execute([':id' => $pago['compra_id']]);
            }

            // Eliminar archivo si existe
            if (!empty($pago['archivo_constancia']) && file_exists($pago['archivo_constancia'])) {
                unlink($pago['archivo_constancia']);
            }

            // 3. Eliminar registro de pago
            $conn->prepare("DELETE FROM pagos_proveedores WHERE id = :id")->execute([':id' => $id]);

            $conn->commit();
            echo json_encode(["message" => "Pago eliminado correctamente"]);
            break;

        case 'editar_pago':
            $pago_id = $data['id'] ?? 0;
            if (!$pago_id) throw new Exception("ID de pago requerido");

            $conn->beginTransaction();

            $stmt = $conn->prepare("SELECT * FROM pagos_proveedores WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $pago_id]);
            $pago_old = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$pago_old) throw new Exception("Pago no encontrado");

            // --- REVERTIR PAGO ANTERIOR ---
            if ($pago_old['caja_movimiento_id']) {
                $conn->prepare("DELETE FROM caja_movimientos WHERE id = :id")->execute([':id' => $pago_old['caja_movimiento_id']]);
            } elseif ($pago_old['banco_movimiento_id']) {
                $stmt = $conn->prepare("SELECT cuenta_id FROM bancos_movimientos WHERE id = :id");
                $stmt->execute([':id' => $pago_old['banco_movimiento_id']]);
                $mov = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($mov) {
                    $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :monto WHERE id = :id")
                         ->execute([':monto' => $pago_old['monto'], ':id' => $mov['cuenta_id']]);
                    $conn->prepare("DELETE FROM bancos_movimientos WHERE id = :id")->execute([':id' => $pago_old['banco_movimiento_id']]);
                }
            }

            $conn->prepare("UPDATE comprobantes_compra SET saldo_pendiente = saldo_pendiente + :monto WHERE id = :id")
                 ->execute([':monto' => $pago_old['monto'], ':id' => $pago_old['compra_id']]);

            // --- APLICAR NUEVO PAGO ---
            $stmt = $conn->prepare("SELECT * FROM comprobantes_compra WHERE id = :id");
            $stmt->execute([':id' => $pago_old['compra_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($data['monto'] > $comp['saldo_pendiente']) {
                throw new Exception("El nuevo monto excede el saldo pendiente ({$comp['saldo_pendiente']})");
            }

            $caja_mov_id = null;
            $banco_mov_id = null;

            if ($data['medio_pago'] === 'Efectivo') {
                if (empty($data['origen_id'])) {
                    $stmt = $conn->prepare("SELECT id FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' ORDER BY id DESC LIMIT 1");
                    $stmt->execute([':uid' => $usuario_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$sesion) throw new Exception("No tienes una caja abierta.");
                    $caja_sesion_id = $sesion['id'];
                } else {
                    $caja_sesion_id = $data['origen_id'];
                }

                $concepto = "Pago Factura Compra {$comp['serie']}-{$comp['numero']} (Editado)";
                $sqlCaja = "INSERT INTO caja_movimientos (sesion_id, tipo, monto, concepto, usuario_id, fecha) 
                            VALUES (:sid, 'Egreso', :monto, :conc, :uid, NOW())";
                $conn->prepare($sqlCaja)->execute([
                    ':sid' => $caja_sesion_id,
                    ':monto' => $data['monto'],
                    ':conc' => $concepto,
                    ':uid' => $usuario_id
                ]);
                $caja_mov_id = $conn->lastInsertId();

            } elseif (in_array($data['medio_pago'], ['Transferencia', 'Cheque', 'Deposito'])) {
                if (empty($data['origen_id'])) throw new Exception("Debe seleccionar una cuenta bancaria de origen");
                
                $concepto = "Pago Factura Compra {$comp['serie']}-{$comp['numero']} ({$data['referencia']}) (Editado)";
                $sqlBanco = "INSERT INTO bancos_movimientos (cuenta_id, tipo, origen_destino, monto, concepto, referencia, entidad, usuario_id, fecha) 
                             VALUES (:cid, 'Egreso', :origen, :monto, :conc, :ref, :entidad, :uid, NOW())";
                $conn->prepare($sqlBanco)->execute([
                    ':cid' => $data['origen_id'],
                    ':origen' => 'Proveedor',
                    ':monto' => $data['monto'],
                    ':conc' => $concepto,
                    ':ref' => $data['referencia'] ?? '',
                    ':entidad' => $comp['proveedor_razon_social'],
                    ':uid' => $usuario_id
                ]);
                $banco_mov_id = $conn->lastInsertId();
                
                $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :monto WHERE id = :id")
                     ->execute([':monto' => $data['monto'], ':id' => $data['origen_id']]);
            }

            // Manejo de archivo (Reemplazo)
            $archivoPath = $pago_old['archivo_constancia']; // Mantener el existente por defecto
            if (isset($_FILES['archivo'])) {
                // Borrar anterior si existe
                if (!empty($archivoPath) && file_exists($archivoPath)) {
                    unlink($archivoPath);
                }
                $archivoPath = handleFileUpload($_FILES['archivo']);
            }

            // Actualizar registro de pago
            $sql = "UPDATE pagos_proveedores SET 
                    monto = :monto, 
                    medio_pago = :medio, 
                    referencia = :ref, 
                    origen_id = :origen, 
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
                ':origen' => $data['origen_id'] ?? null,
                ':obs' => $data['observaciones'] ?? '',
                ':caja_id' => $caja_mov_id,
                ':banco_id' => $banco_mov_id,
                ':archivo' => $archivoPath,
                ':id' => $pago_id
            ]);

            // Actualizar saldo Comprobante
            $nuevo_saldo = bcsub($comp['saldo_pendiente'], $data['monto'], 2);
            $estado_pago = ($nuevo_saldo <= 0) ? 'Pagado' : 'Parcial';
            if ($nuevo_saldo >= $comp['importe_total']) $estado_pago = 'Pendiente';

            $sql = "UPDATE comprobantes_compra SET saldo_pendiente = :saldo, estado_pago = :estado WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':saldo' => $nuevo_saldo, ':estado' => $estado_pago, ':id' => $comp['id']]);

            $conn->commit();
            echo json_encode(["message" => "Pago actualizado correctamente"]);
            break;

        case 'reporte_vencimientos':
            $sql = "SELECT proveedor_razon_social, 
                           COUNT(id) as cantidad_facturas, 
                           SUM(saldo_pendiente) as total_deuda,
                           MAX(DATEDIFF(CURDATE(), fecha_vencimiento)) as max_dias_atraso
                    FROM comprobantes_compra 
                    WHERE estado != 'Anulado' AND saldo_pendiente > 0 AND fecha_vencimiento < CURDATE()
                    GROUP BY proveedor_num_doc, proveedor_razon_social
                    ORDER BY total_deuda DESC";
            $stmt = $conn->query($sql);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(is_array($result) ? $result : []);
            break;
            
        case 'estado_cuenta':
            $proveedor_doc = $_GET['doc'] ?? '';
            if (empty($proveedor_doc)) {
                $sql = "SELECT proveedor_razon_social, proveedor_num_doc, SUM(saldo_pendiente) as deuda_total 
                        FROM comprobantes_compra 
                        WHERE estado != 'Anulado' AND saldo_pendiente > 0
                        GROUP BY proveedor_num_doc, proveedor_razon_social";
                 $stmt = $conn->query($sql);
            } else {
                 $sql = "SELECT * FROM comprobantes_compra 
                         WHERE proveedor_num_doc = :doc AND estado != 'Anulado'
                         ORDER BY fecha_emision DESC";
                 $stmt = $conn->prepare($sql);
                 $stmt->execute([':doc' => $proveedor_doc]);
            }
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(is_array($result) ? $result : []);
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
$conn = null;
?>
