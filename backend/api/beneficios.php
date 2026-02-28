<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require '../vendor/autoload.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Auth Check
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user_data = $jwt->validateToken($token);

if (!$user_data) {
    http_response_code(401);
    echo json_encode(['message' => 'Acceso no autorizado']);
    if (isset($conn)) $conn = null;
    exit;
}

// RMV for 2025
define('RMV', 1025.00);
define('ASIG_FAMILIAR', RMV * 0.10);

try {
    switch ($method) {
        case 'GET':
            if ($action === 'calculate') {
                $colabId = $_GET['colaborador_id'];
                $type = $_GET['type']; // 'cts' or 'grati'

                $stmt = $conn->prepare("SELECT sueldo_base, asignacion_familiar, fecha_ingreso FROM colaboradores WHERE id = ?");
                $stmt->execute([$colabId]);
                $colab = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$colab) {
                    throw new Exception("Colaborador no encontrado");
                }

                $sueldo = (float)$colab['sueldo_base'];
                $asigFam = $colab['asignacion_familiar'] ? ASIG_FAMILIAR : 0;
                $remuneracionComputable = $sueldo + $asigFam;

                $result = [];

                if ($type === 'cts') {
                    // CTS: (Remuneracion + 1/6 Grati) / 2 per semester (approx)
                    // Real calc involves days worked in semester.
                    // Simplified projection:
                    $gratiSemestral = $remuneracionComputable; // Grati is 1 full salary per semester
                    $unSextoGrati = $gratiSemestral / 6;
                    $totalComputable = $remuneracionComputable + $unSextoGrati;
                    
                    // Deposited in May (Nov-Apr) and Nov (May-Oct)
                    // Assume full semester for projection
                    $montoSemestral = $totalComputable / 2;
                    
                    $result = [
                        'sueldo_base' => $sueldo,
                        'asignacion_familiar' => $asigFam,
                        'grati_sexto' => round($unSextoGrati, 2),
                        'total_computable' => round($totalComputable, 2),
                        'monto_proyectado' => round($montoSemestral, 2)
                    ];
                } elseif ($type === 'grati') {
                    // Grati: Remuneracion Computable per semester
                    // Plus 9% Bono Extraordinario (Essalud)
                    $bono = $remuneracionComputable * 0.09;
                    $total = $remuneracionComputable + $bono;

                    $result = [
                        'sueldo_base' => $sueldo,
                        'asignacion_familiar' => $asigFam,
                        'remuneracion_computable' => round($remuneracionComputable, 2),
                        'bono_extraordinario' => round($bono, 2),
                        'monto_proyectado' => round($total, 2)
                    ];
                }

                echo json_encode($result);

            } elseif ($action === 'history') {
                $type = $_GET['type']; // 'cts' or 'grati'
                $table = $type === 'cts' ? 'cts_historico' : 'gratificaciones_historico';
                
                $query = "SELECT h.*, c.nombres, c.apellidos, c.documento_numero 
                          FROM $table h 
                          JOIN colaboradores c ON h.colaborador_id = c.id 
                          ORDER BY h.periodo DESC";
                $stmt = $conn->prepare($query);
                $stmt->execute();
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

            } elseif ($action === 'prestamos') {
                $query = "SELECT p.*, c.nombres, c.apellidos 
                          FROM prestamos p 
                          JOIN colaboradores c ON p.colaborador_id = c.id 
                          ORDER BY p.fecha_solicitud DESC";
                $stmt = $conn->prepare($query);
                $stmt->execute();
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

            } elseif ($action === 'beneficios_internos') {
                $query = "SELECT * FROM beneficios_internos WHERE activo = 1";
                $stmt = $conn->prepare($query);
                $stmt->execute();
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

            } elseif ($action === 'colaboradores_beneficios') {
                 $query = "SELECT cb.*, c.nombres, c.apellidos, b.nombre as beneficio, b.monto_referencial 
                           FROM colaboradores_beneficios cb
                           JOIN colaboradores c ON cb.colaborador_id = c.id
                           JOIN beneficios_internos b ON cb.beneficio_id = b.id
                           ORDER BY cb.fecha_asignacion DESC";
                 $stmt = $conn->prepare($query);
                 $stmt->execute();
                 echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            }
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"), true);
            
            if ($action === 'save_calc') {
                // Save calculated CTS or Grati to history
                $type = $_GET['type'];
                $table = $type === 'cts' ? 'cts_historico' : 'gratificaciones_historico';
                
                $fields = $type === 'cts' 
                    ? "colaborador_id, periodo, fecha_pago, sueldo_computable, monto_cts, estado"
                    : "colaborador_id, periodo, fecha_pago, sueldo_computable, monto_gratificacion, bono_extraordinario, monto_total, estado";
                
                $placeholders = $type === 'cts' ? "?, ?, ?, ?, ?, ?" : "?, ?, ?, ?, ?, ?, ?, ?";
                
                $stmt = $conn->prepare("INSERT INTO $table ($fields) VALUES ($placeholders)");
                
                if ($type === 'cts') {
                    $stmt->execute([
                        $data['colaborador_id'], $data['periodo'], $data['fecha_pago'],
                        $data['sueldo_computable'], $data['monto_cts'], 'Pendiente'
                    ]);
                } else {
                    $stmt->execute([
                        $data['colaborador_id'], $data['periodo'], $data['fecha_pago'],
                        $data['sueldo_computable'], $data['monto_gratificacion'], 
                        $data['bono_extraordinario'], $data['monto_total'], 'Pendiente'
                    ]);
                }
                echo json_encode(['message' => 'Guardado correctamente']);

            } elseif ($action === 'prestamo') {
                $stmt = $conn->prepare("INSERT INTO prestamos (colaborador_id, monto_total, cuotas_totales, fecha_solicitud, motivo, estado) VALUES (?, ?, ?, ?, ?, 'Pendiente')");
                $stmt->execute([
                    $data['colaborador_id'], $data['monto_total'], 
                    $data['cuotas_totales'], $data['fecha_solicitud'], 
                    $data['motivo']
                ]);
                echo json_encode(['message' => 'Préstamo registrado']);

            } elseif ($action === 'assign_beneficio') {
                $stmt = $conn->prepare("INSERT INTO colaboradores_beneficios (colaborador_id, beneficio_id) VALUES (?, ?)");
                $stmt->execute([$data['colaborador_id'], $data['beneficio_id']]);
                echo json_encode(['message' => 'Beneficio asignado']);
            
            } elseif ($action === 'create_beneficio') {
                $monto = isset($data['monto_referencial']) ? $data['monto_referencial'] : 0;
                $stmt = $conn->prepare("INSERT INTO beneficios_internos (nombre, descripcion, monto_referencial, activo) VALUES (?, ?, ?, 1)");
                $stmt->execute([$data['nombre'], $data['descripcion'], $monto]);
                echo json_encode(['message' => 'Beneficio creado']);
            }
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"), true);
            
            if ($action === 'prestamo_status') {
                $stmt = $conn->prepare("UPDATE prestamos SET estado = ? WHERE id = ?");
                $stmt->execute([$data['estado'], $data['id']]);
                echo json_encode(['message' => 'Estado actualizado']);

            } elseif ($action === 'update_beneficio') {
                $monto = isset($data['monto_referencial']) ? $data['monto_referencial'] : 0;
                $stmt = $conn->prepare("UPDATE beneficios_internos SET nombre = ?, descripcion = ?, monto_referencial = ? WHERE id = ?");
                $stmt->execute([$data['nombre'], $data['descripcion'], $monto, $data['id']]);
                echo json_encode(['message' => 'Beneficio actualizado']);

            } elseif ($action === 'pay_loan') {
                $id = $data['id'];
                
                $conn->beginTransaction();
                try {
                    $stmt = $conn->prepare("SELECT * FROM prestamos WHERE id = ?");
                    $stmt->execute([$id]);
                    $loan = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($loan && $loan['cuotas_pagadas'] < $loan['cuotas_totales']) {
                        $newCuotas = $loan['cuotas_pagadas'] + 1;
                        $newState = ($newCuotas >= $loan['cuotas_totales']) ? 'Pagado' : $loan['estado'];
                        
                        // Calculate amount paid
                        $montoCuota = $loan['monto_total'] / $loan['cuotas_totales'];
                        $newMontoPagado = $loan['monto_pagado'] + $montoCuota;
                        
                        // Ensure precision doesn't exceed total
                        if ($newCuotas == $loan['cuotas_totales']) {
                             $newMontoPagado = $loan['monto_total'];
                        }

                        $stmt = $conn->prepare("UPDATE prestamos SET cuotas_pagadas = ?, monto_pagado = ?, estado = ? WHERE id = ?");
                        $stmt->execute([$newCuotas, $newMontoPagado, $newState, $id]);
                        $conn->commit();
                        echo json_encode(['message' => 'Cuota registrada']);
                    } else {
                        throw new Exception("El préstamo ya está pagado o no existe");
                    }
                } catch (Exception $e) {
                    $conn->rollBack();
                    throw $e;
                }
            }
            break;

        case 'DELETE':
            if ($action === 'delete_beneficio') {
                $id = $_GET['id'];
                $stmt = $conn->prepare("UPDATE beneficios_internos SET activo = 0 WHERE id = ?");
                $stmt->execute([$id]);
                echo json_encode(['message' => 'Beneficio eliminado']);
            }
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['message' => $e->getMessage()]);
}
$conn = null;
?>