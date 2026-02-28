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

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Constants
define('RMV', 1025.00);
define('ASIG_FAMILIAR', RMV * 0.10);

function getMonthsDays($startDate, $endDate) {
    $start = new DateTime($startDate);
    $end = new DateTime($endDate);
    
    // If end is before start, return 0
    if ($end < $start) return ['m' => 0, 'd' => 0];

    $diff = $start->diff($end);
    
    // Calculate total months and remaining days
    // Note: This is calendar difference. For labor calc, sometimes 30-day months are used.
    // We will use standard DateInterval logic for now.
    $months = ($diff->y * 12) + $diff->m;
    $days = $diff->d;
    
    // In labor law, if days >= 30 (not possible with DateInterval), adjust.
    // Usually we count full months. 
    // If a person works < 1 month, usually 0 grati.
    
    return ['m' => $months, 'd' => $days];
}

try {
    switch ($method) {
        case 'GET':
            if ($action === 'list') {
                $query = "SELECT c.*, col.nombres, col.apellidos, col.documento_numero,
                                 l.neto_pagar
                          FROM ceses c
                          JOIN colaboradores col ON c.colaborador_id = col.id
                          LEFT JOIN liquidaciones_detalles l ON c.id = l.cese_id
                          ORDER BY c.fecha_cese DESC";
                $stmt = $conn->prepare($query);
                $stmt->execute();
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

            } elseif ($action === 'calculate') {
                $colabId = $_GET['colaborador_id'];
                $fechaCese = $_GET['fecha_cese'];
                
                // Get Colab Data
                $stmt = $conn->prepare("SELECT sueldo_base, asignacion_familiar, fecha_ingreso FROM colaboradores WHERE id = ?");
                $stmt->execute([$colabId]);
                $colab = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$colab) throw new Exception("Colaborador no encontrado");

                $sueldo = (float)$colab['sueldo_base'];
                $asigFam = $colab['asignacion_familiar'] ? ASIG_FAMILIAR : 0;
                $remuneracionComputable = $sueldo + $asigFam;
                $fechaIngreso = $colab['fecha_ingreso'];

                // 1. Vacaciones Truncas
                // Cycle starts at anniversary of fecha_ingreso
                $ingreso = new DateTime($fechaIngreso);
                $cese = new DateTime($fechaCese);
                
                // Find last anniversary before cese
                $anniversary = new DateTime($ingreso->format('Y-m-d'));
                $anniversary->setDate($cese->format('Y'), $ingreso->format('m'), $ingreso->format('d'));
                if ($anniversary > $cese) {
                    $anniversary->modify('-1 year');
                }
                
                // Diff from anniversary to cese
                $diffVac = getMonthsDays($anniversary->format('Y-m-d'), $fechaCese);
                // Vacaciones: (Sueldo / 12 * months) + (Sueldo / 360 * days)
                $vacTruncas = ($remuneracionComputable / 12 * $diffVac['m']) + ($remuneracionComputable / 360 * $diffVac['d']);

                // 2. CTS Trunca
                // Periods: Nov-Apr (Paid May), May-Oct (Paid Nov)
                // Determine start of current CTS period
                $ceseMonth = (int)$cese->format('m');
                $ceseYear = (int)$cese->format('Y');
                
                if ($ceseMonth >= 5 && $ceseMonth <= 10) {
                    // Period starts May 1st
                    $ctsStart = "$ceseYear-05-01";
                } else {
                    // Period starts Nov 1st (could be prev year)
                    if ($ceseMonth < 5) {
                        $prevYear = $ceseYear - 1;
                        $ctsStart = "$prevYear-11-01";
                    } else {
                        $ctsStart = "$ceseYear-11-01";
                    }
                }
                
                // If ingreso is after ctsStart, use ingreso
                if ($ingreso > new DateTime($ctsStart)) {
                    $ctsStart = $fechaIngreso;
                }

                $diffCts = getMonthsDays($ctsStart, $fechaCese);
                // CTS Base: Sueldo + Asig + 1/6 Grati
                $gratiSemestral = $remuneracionComputable; 
                $unSextoGrati = $gratiSemestral / 6;
                $baseCts = $remuneracionComputable + $unSextoGrati;
                
                $ctsTrunca = ($baseCts / 12 * $diffCts['m']) + ($baseCts / 360 * $diffCts['d']);

                // 3. Gratificación Trunca
                // Periods: Jan-Jun (Paid Jul), Jul-Dec (Paid Dec)
                if ($ceseMonth >= 1 && $ceseMonth <= 6) {
                    $gratiStart = "$ceseYear-01-01";
                } else {
                    $gratiStart = "$ceseYear-07-01";
                }
                
                 // If ingreso is after gratiStart, use ingreso
                if ($ingreso > new DateTime($gratiStart)) {
                    $gratiStart = $fechaIngreso;
                }

                $diffGrati = getMonthsDays($gratiStart, $fechaCese);
                // Grati is usually full months only
                $gratiTrunca = ($remuneracionComputable / 6 * $diffGrati['m']);
                // Add proportional days if applicable (some regimes do, stick to months for generic)
                // Let's add days logic for fairness if needed, but standard is full months.
                // However, user asked for 'trunca', usually implies pro-rating.
                // Let's stick to full months for Grati per law (Art. 6 Law 27735: "por todo mes calendario completo").
                // BUT, "trunca" often implies calculation at end of relation. 
                // We will stick to months.
                
                $bonoExtra = $gratiTrunca * 0.09;
                
                $totalIngresos = $vacTruncas + $ctsTrunca + $gratiTrunca + $bonoExtra;
                
                echo json_encode([
                    'remuneracion_computable' => round($remuneracionComputable, 2),
                    'vacaciones_truncas' => round($vacTruncas, 2),
                    'cts_trunca' => round($ctsTrunca, 2),
                    'gratificacion_trunca' => round($gratiTrunca, 2),
                    'bonificacion_extraordinaria' => round($bonoExtra, 2),
                    'total_ingresos' => round($totalIngresos, 2),
                    'neto_pagar' => round($totalIngresos, 2), // Assuming no discounts for now
                    'debug' => [
                        'vac_start' => $anniversary->format('Y-m-d'),
                        'cts_start' => $ctsStart,
                        'grati_start' => $gratiStart,
                        'vac_diff' => $diffVac,
                        'cts_diff' => $diffCts,
                        'grati_diff' => $diffGrati
                    ]
                ]);
            }
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"), true);
            
            if ($action === 'create') {
                $conn->beginTransaction();
                try {
                    // 1. Insert Cese
                    $stmt = $conn->prepare("INSERT INTO ceses (colaborador_id, fecha_cese, motivo, observaciones, estado) VALUES (?, ?, ?, ?, 'Procesado')");
                    $stmt->execute([
                        $data['colaborador_id'],
                        $data['fecha_cese'],
                        $data['motivo'],
                        $data['observaciones']
                    ]);
                    $ceseId = $conn->lastInsertId();
                    
                    // 2. Insert Details
                    if (isset($data['calculo'])) {
                        $calc = $data['calculo'];
                        $stmt = $conn->prepare("INSERT INTO liquidaciones_detalles 
                            (cese_id, remuneracion_computable, vacaciones_truncas, cts_trunca, gratificacion_trunca, bonificacion_extraordinaria, total_ingresos, neto_pagar) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([
                            $ceseId,
                            $calc['remuneracion_computable'],
                            $calc['vacaciones_truncas'],
                            $calc['cts_trunca'],
                            $calc['gratificacion_trunca'],
                            $calc['bonificacion_extraordinaria'],
                            $calc['total_ingresos'],
                            $calc['neto_pagar']
                        ]);
                    }

                    // 3. Update Colaborador Status to 'Cesado'
                    $stmt = $conn->prepare("UPDATE colaboradores SET estado = 'Cesado' WHERE id = ?");
                    $stmt->execute([$data['colaborador_id']]);

                    // 4. Update Linked User Status to 'inactivo' if exists
                    $stmt = $conn->prepare("SELECT usuario_id FROM colaboradores WHERE id = ?");
                    $stmt->execute([$data['colaborador_id']]);
                    $colab = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($colab && !empty($colab['usuario_id'])) {
                        $stmt = $conn->prepare("UPDATE usuarios SET status = 'inactivo' WHERE id = ?");
                        $stmt->execute([$colab['usuario_id']]);
                    }

                    $conn->commit();
                    echo json_encode(['message' => 'Cese registrado y procesado correctamente', 'id' => $ceseId]);

                } catch (Exception $e) {
                    $conn->rollBack();
                    throw $e;
                }
            }
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
