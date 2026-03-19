<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header("Content-Type: application/json");

// Verificar autenticación
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user_data = $jwt->validateToken($token);

if (!$user_data) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        $conn = null;
        exit;
    }

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

try {
    rbac_require($conn, $user_data, 'contabilidad', $method);

    if ($method === 'GET') {
        switch ($action) {
            // --- PCGE ---
            case 'get_pcge':
                $where = [];
                $params = [];
                
                if (isset($_GET['search']) && !empty($_GET['search'])) {
                    $where[] = "(codigo LIKE :search OR nombre LIKE :search)";
                    $params[':search'] = "%" . $_GET['search'] . "%";
                }
                
                if (isset($_GET['movimiento'])) {
                    $where[] = "permite_movimiento = :mov";
                    $params[':mov'] = $_GET['movimiento'];
                }
                
                $sql = "SELECT * FROM pcge";
                if (!empty($where)) {
                    $sql .= " WHERE " . implode(" AND ", $where);
                }
                $sql .= " ORDER BY codigo ASC";
                
                $stmt = $conn->prepare($sql);
                $stmt->execute($params);
                
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                break;
                
            // --- ASIENTOS ---
            case 'get_asientos':
                $limit = 50;
                $sql = "SELECT a.*, (SELECT SUM(debe) FROM asientos_detalle WHERE asiento_id = a.id) as total 
                        FROM asientos a ORDER BY a.fecha DESC, a.id DESC LIMIT $limit";
                $stmt = $conn->query($sql);
                
                if ($stmt === false) {
                    echo json_encode([]);
                } else {
                    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                }
                break;

            case 'get_asiento_detalle':
                if (!isset($_GET['id'])) {
                    echo json_encode(['error' => 'ID requerido']);
                    if (isset($conn)) $conn = null;
                    exit;
                }
                $stmt = $conn->prepare("SELECT * FROM asientos_detalle WHERE asiento_id = :id");
                $stmt->execute([':id' => $_GET['id']]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                break;

            // --- REPORTES ---
            case 'get_libro_diario':
                $start = $_GET['start'] ?? date('Y-m-01');
                $end = $_GET['end'] ?? date('Y-m-t');
                
                $sql = "SELECT a.fecha, a.glosa, a.id as asiento_id, ad.cuenta_codigo, p.nombre as cuenta_nombre, ad.debe, ad.haber 
                        FROM asientos a
                        JOIN asientos_detalle ad ON a.id = ad.asiento_id
                        JOIN pcge p ON ad.cuenta_codigo = p.codigo
                        WHERE a.fecha BETWEEN :start AND :end AND a.estado = 'Finalizado'
                        ORDER BY a.fecha ASC, a.id ASC";
                $stmt = $conn->prepare($sql);
                $stmt->execute([':start' => $start, ':end' => $end]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                break;

            case 'get_libro_mayor':
                $cuenta = $_GET['cuenta'] ?? '';
                $year = $_GET['year'] ?? date('Y');
                
                $sql = "SELECT a.fecha, a.glosa, a.id as asiento_id, ad.debe, ad.haber
                        FROM asientos a
                        JOIN asientos_detalle ad ON a.id = ad.asiento_id
                        WHERE ad.cuenta_codigo = :cuenta AND YEAR(a.fecha) = :year AND a.estado = 'Finalizado'
                        ORDER BY a.fecha ASC";
                $stmt = $conn->prepare($sql);
                $stmt->execute([':cuenta' => $cuenta, ':year' => $year]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                break;
            
            case 'get_balance_comprobacion':
                $year = $_GET['year'] ?? date('Y');
                // Query compleja para sumar Debe y Haber por cuenta
                $sql = "SELECT p.codigo, p.nombre, 
                               SUM(ad.debe) as total_debe, 
                               SUM(ad.haber) as total_haber
                        FROM pcge p
                        LEFT JOIN asientos_detalle ad ON p.codigo = ad.cuenta_codigo
                        LEFT JOIN asientos a ON ad.asiento_id = a.id
                        WHERE (a.estado = 'Finalizado' AND YEAR(a.fecha) = :year) OR a.id IS NULL
                        GROUP BY p.codigo, p.nombre
                        HAVING total_debe > 0 OR total_haber > 0
                        ORDER BY p.codigo ASC";
                $stmt = $conn->prepare($sql);
                $stmt->execute([':year' => $year]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                break;

            case 'audit_asientos':
                $issues = [];

                // 1. Asientos Descuadrados
                $sql = "SELECT a.id, a.fecha, a.glosa, 
                               SUM(ad.debe) as total_debe, 
                               SUM(ad.haber) as total_haber,
                               (SUM(ad.debe) - SUM(ad.haber)) as diferencia
                        FROM asientos a
                        JOIN asientos_detalle ad ON a.id = ad.asiento_id
                        GROUP BY a.id, a.fecha, a.glosa
                        HAVING ABS(diferencia) > 0.01";
                $stmt = $conn->query($sql);
                if ($stmt) {
                    $res = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($res as $row) {
                        $issues[] = [
                            'type' => 'Descuadre',
                            'id' => $row['id'],
                            'fecha' => $row['fecha'],
                            'glosa' => $row['glosa'],
                            'issue' => "Diferencia: " . number_format($row['diferencia'], 2),
                            'severity' => 'high'
                        ];
                    }
                }

                // 2. Asientos Sin Detalles (Vacíos)
                $sqlEmpty = "SELECT a.id, a.fecha, a.glosa 
                             FROM asientos a 
                             LEFT JOIN asientos_detalle ad ON a.id = ad.asiento_id 
                             WHERE ad.id IS NULL";
                $stmtEmpty = $conn->query($sqlEmpty);
                if ($stmtEmpty) {
                    $resEmpty = $stmtEmpty->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($resEmpty as $row) {
                        $issues[] = [
                            'type' => 'Sin Detalles',
                            'id' => $row['id'],
                            'fecha' => $row['fecha'],
                            'glosa' => $row['glosa'],
                            'issue' => "Asiento sin líneas de detalle",
                            'severity' => 'medium'
                        ];
                    }
                }
                
                // 3. Asientos con Valores Negativos (Atípico)
                $sqlNeg = "SELECT a.id, a.fecha, a.glosa, ad.cuenta_codigo, ad.debe, ad.haber
                           FROM asientos a
                           JOIN asientos_detalle ad ON a.id = ad.asiento_id
                           WHERE ad.debe < 0 OR ad.haber < 0";
                $stmtNeg = $conn->query($sqlNeg);
                if ($stmtNeg) {
                    $resNeg = $stmtNeg->fetchAll(PDO::FETCH_ASSOC);
                     foreach ($resNeg as $row) {
                        $issues[] = [
                            'type' => 'Valores Negativos',
                            'id' => $row['id'],
                            'fecha' => $row['fecha'],
                            'glosa' => $row['glosa'],
                            'issue' => "Cuenta {$row['cuenta_codigo']} con valor negativo",
                            'severity' => 'low'
                        ];
                    }
                }

                echo json_encode($issues);
                break;

            default:
                echo json_encode(['error' => 'Acción GET no válida']);
                break;
        }
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        switch ($action) {
            case 'process_cierre':
                // Simplified Closing Process: Cancel Class 6 & 7 against Class 59 (Resultados)
                $year = $data['year'];
                $sql = "SELECT p.codigo, SUM(ad.debe) as debe, SUM(ad.haber) as haber 
                        FROM asientos_detalle ad
                        JOIN pcge p ON ad.cuenta_codigo = p.codigo
                        JOIN asientos a ON ad.asiento_id = a.id
                        WHERE YEAR(a.fecha) = :year AND a.estado = 'Finalizado'
                        AND (p.codigo LIKE '6%' OR p.codigo LIKE '7%')
                        GROUP BY p.codigo";
                $stmt = $conn->prepare($sql);
                $stmt->execute([':year' => $year]);
                $cuentas = $stmt->fetchAll(PDO::FETCH_ASSOC);

                if (empty($cuentas)) {
                    echo json_encode(['success' => false, 'message' => 'No hay movimientos de ingresos/gastos para cerrar.']);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                $conn->beginTransaction();
                try {
                    // Create Closing Entry
                    $stmtHead = $conn->prepare("INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, tipo_cambio, estado, usuario_id) VALUES (:fecha, 'Asiento de Cierre $year', 'Cierre', 'PEN', 1, 'Finalizado', :uid)");
                    $stmtHead->execute([':fecha' => "$year-12-31", ':uid' => $user_data['id']]);
                    $asientoId = $conn->lastInsertId();

                    $stmtDet = $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)");

                    $totalDebe = 0;
                    $totalHaber = 0;

                    foreach ($cuentas as $cta) {
                        $saldo = $cta['debe'] - $cta['haber'];
                        // If saldo > 0 (Deudor/Gasto), we credit it to close.
                        // If saldo < 0 (Acreedor/Ingreso), we debit it to close.
                        if ($saldo > 0.005) {
                            $stmtDet->execute([':aid' => $asientoId, ':cta' => $cta['codigo'], ':debe' => 0, ':haber' => $saldo]);
                            $totalHaber += $saldo;
                        } elseif ($saldo < -0.005) {
                            $monto = abs($saldo);
                            $stmtDet->execute([':aid' => $asientoId, ':cta' => $cta['codigo'], ':debe' => $monto, ':haber' => 0]);
                            $totalDebe += $monto;
                        }
                    }
                    
                    // Balancing
                    $diff = $totalDebe - $totalHaber;
                    
                    if (abs($diff) > 0.005) {
                         // Ensure 591 exists
                         $conn->query("INSERT IGNORE INTO pcge (codigo, nombre, nivel, tipo, permite_movimiento) VALUES ('591', 'Resultados Acumulados', 3, 'Patrimonio', 1)");

                         if ($diff > 0) {
                             // Debits > Credits (Profit: 7s > 6s). We need Credit to balance.
                             $stmtDet->execute([':aid' => $asientoId, ':cta' => '591', ':debe' => 0, ':haber' => $diff]);
                         } else {
                             // Credits > Debits (Loss: 6s > 7s). We need Debit to balance.
                             $stmtDet->execute([':aid' => $asientoId, ':cta' => '591', ':debe' => abs($diff), ':haber' => 0]);
                         }
                    }
                    
                    $conn->commit();
                    echo json_encode(['success' => true, 'message' => 'Cierre contable generado correctamente']);
                } catch (Exception $e) {
                    $conn->rollBack();
                    http_response_code(500);
                    echo json_encode(['error' => 'Error en cierre: ' . $e->getMessage()]);
                }
                break;

            case 'process_apertura':
                // Simplified Opening: Take Balances of Asset, Liability, Equity from previous year
                $prevYear = $data['year'] - 1;
                $currentYear = $data['year'];
                
                // Get balances
                 $sql = "SELECT p.codigo, 
                               SUM(ad.debe) - SUM(ad.haber) as saldo
                        FROM pcge p
                        JOIN asientos_detalle ad ON p.codigo = ad.cuenta_codigo
                        JOIN asientos a ON ad.asiento_id = a.id
                        WHERE YEAR(a.fecha) = :year AND a.estado = 'Finalizado'
                        AND (p.codigo LIKE '1%' OR p.codigo LIKE '2%' OR p.codigo LIKE '3%' OR p.codigo LIKE '4%' OR p.codigo LIKE '5%')
                        GROUP BY p.codigo
                        HAVING ABS(saldo) > 0";
                
                $stmt = $conn->prepare($sql);
                $stmt->execute([':year' => $prevYear]);
                $cuentas = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                if (empty($cuentas)) {
                    echo json_encode(['success' => false, 'message' => "No hay saldos del año $prevYear para aperturar."]);
                    $conn = null;
                    exit;
                }

                $conn->beginTransaction();
                try {
                    $stmtHead = $conn->prepare("INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, tipo_cambio, estado, usuario_id) VALUES (:fecha, 'Asiento de Apertura $currentYear', 'Apertura', 'PEN', 1, 'Finalizado', :uid)");
                    $stmtHead->execute([':fecha' => "$currentYear-01-01", ':uid' => $user_data['id']]);
                    $asientoId = $conn->lastInsertId();

                    $stmtDet = $conn->prepare("INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)");

                    foreach ($cuentas as $cta) {
                        $saldo = $cta['saldo'];
                        if ($saldo > 0) {
                            $stmtDet->execute([':aid' => $asientoId, ':cta' => $cta['codigo'], ':debe' => $saldo, ':haber' => 0]);
                        } else {
                            $stmtDet->execute([':aid' => $asientoId, ':cta' => $cta['codigo'], ':debe' => 0, ':haber' => abs($saldo)]);
                        }
                    }
                    $conn->commit();
                    echo json_encode(['success' => true, 'message' => 'Asiento de apertura generado.']);
                } catch (Exception $e) {
                    $conn->rollBack();
                    echo json_encode(['error' => 'Error en apertura: ' . $e->getMessage()]);
                }
                break;

            case 'save_cuenta':
                $codigo = $data['codigo'];
                $nombre = $data['nombre'];
                $nivel = strlen($codigo); // Nivel basado en longitud
                $tipo = $data['tipo'];
                $padre = $data['padre_codigo'] ?? null;
                $movimiento = $data['permite_movimiento'] ? 1 : 0;
                
                $sql = "INSERT INTO pcge (codigo, nombre, nivel, tipo, padre_codigo, permite_movimiento) 
                        VALUES (:codigo, :nombre, :nivel, :tipo, :padre, :movimiento)
                        ON DUPLICATE KEY UPDATE nombre=:nombre, tipo=:tipo, permite_movimiento=:movimiento, padre_codigo=:padre, nivel=:nivel";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':codigo' => $codigo, ':nombre' => $nombre, ':nivel' => $nivel, 
                    ':tipo' => $tipo, ':padre' => $padre, ':movimiento' => $movimiento
                ]);
                echo json_encode(['success' => true, 'message' => 'Cuenta guardada correctamente']);
                break;

            case 'save_asiento':
                $conn->beginTransaction();
                try {
                    // 0. Validaciones
                    $detalles = $data['detalles'];
                    $totalDebe = 0;
                    $totalHaber = 0;
                    
                    foreach ($detalles as $det) {
                        $totalDebe += $det['debe'];
                        $totalHaber += $det['haber'];
                        
                        // Validar que cuenta existe
                        $stmtCheck = $conn->prepare("SELECT COUNT(*) FROM pcge WHERE codigo = :codigo");
                        $stmtCheck->execute([':codigo' => $det['cuenta_codigo']]);
                        if ($stmtCheck->fetchColumn() == 0) {
                            throw new Exception("La cuenta contable {$det['cuenta_codigo']} no existe.");
                        }
                    }
                    
                    if (abs($totalDebe - $totalHaber) > 0.05) { // Tolerancia pequeña por redondeo
                        throw new Exception("El asiento no está cuadrado. Diferencia: " . ($totalDebe - $totalHaber));
                    }

                    // 1. Insertar Cabecera
                    $sql = "INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, tipo_cambio, estado, usuario_id) 
                            VALUES (:fecha, :glosa, :tipo, :moneda, :tc, 'Finalizado', :uid)";
                    $stmt = $conn->prepare($sql);
                    $stmt->execute([
                        ':fecha' => $data['fecha'],
                        ':glosa' => $data['glosa'],
                        ':tipo' => $data['tipo_asiento'],
                        ':moneda' => $data['moneda'] ?? 'PEN',
                        ':tc' => $data['tipo_cambio'] ?? 1.0,
                        ':uid' => $user_data['id']
                    ]);
                    $asiento_id = $conn->lastInsertId();

                    // 2. Insertar Detalles
                    $sql_det = "INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)";
                    $stmt_det = $conn->prepare($sql_det);
                    
                    foreach ($detalles as $det) {
                        $stmt_det->execute([
                            ':aid' => $asiento_id,
                            ':cta' => $det['cuenta_codigo'],
                            ':debe' => $det['debe'],
                            ':haber' => $det['haber']
                        ]);
                    }
                    
                    $conn->commit();
                    echo json_encode(['success' => true, 'message' => 'Asiento registrado correctamente', 'id' => $asiento_id]);
                } catch (Exception $e) {
                    $conn->rollBack();
                    http_response_code(400); // Bad Request
                    echo json_encode(['error' => $e->getMessage()]);
                }
                break;
                
            case 'delete_cuenta':
                // Solo si no tiene movimientos
                $stmtCheck = $conn->prepare("SELECT COUNT(*) FROM asientos_detalle WHERE cuenta_codigo = :codigo");
                $stmtCheck->execute([':codigo' => $data['codigo']]);
                if ($stmtCheck->fetchColumn() > 0) {
                    http_response_code(400);
                    echo json_encode(['error' => 'No se puede eliminar la cuenta porque tiene movimientos registrados.']);
                    if (isset($conn)) $conn = null;
                    exit;
                }
                
                $sql = "DELETE FROM pcge WHERE codigo = :codigo";
                $stmt = $conn->prepare($sql);
                $stmt->execute([':codigo' => $data['codigo']]);
                echo json_encode(['success' => true, 'message' => 'Cuenta eliminada correctamente']);
                break;

            default:
                echo json_encode(['error' => 'Acción POST no válida']);
                break;
        }
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Error de base de datos: " . $e->getMessage()]);
}

if (isset($conn)) $conn = null;
?>
