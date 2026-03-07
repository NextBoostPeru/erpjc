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

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['action']) && $_GET['action'] === 'plame') {
                handlePlame($conn);
            } elseif (isset($_GET['action']) && $_GET['action'] === 'plame_export') {
                handlePlameExport($conn);
            } elseif (isset($_GET['id'])) {
                handleGetDetails($conn);
            } else {
                handleList($conn);
            }
            break;

        case 'POST':
            if (isset($_GET['action']) && $_GET['action'] === 'generate') {
                handleGenerate($conn);
            } elseif (isset($_GET['action']) && $_GET['action'] === 'recalculate') {
                handleRecalculate($conn);
            } else {
                handleUpdateDetail($conn);
            }
            break;

        case 'PUT':
            handleUpdateStatus($conn);
            break;
            
        case 'DELETE':
            handleDelete($conn);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}

$conn = null;

function handleList($conn) {
    $year = $_GET['year'] ?? date('Y');
    
    $sql = "SELECT * FROM planillas WHERE anio = :year ORDER BY mes DESC, created_at DESC";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':year' => $year]);
    
    echo json_encode(["data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function handleGetDetails($conn) {
    $id = $_GET['id'];
    
    // Get Header
    $stmt = $conn->prepare("SELECT * FROM planillas WHERE id = ?");
    $stmt->execute([$id]);
    $header = $stmt->fetch(PDO::FETCH_ASSOC);

    // Get Company RUC for PLAME
    $stmtEmp = $conn->query("SELECT ruc FROM empresa_datos LIMIT 1");
    $emp = $stmtEmp->fetch(PDO::FETCH_ASSOC);
    $header['empresa_ruc'] = $emp['ruc'] ?? '00000000000';

    // Period context
    $mes = (int)($header['mes'] ?? date('m'));
    $anio = (int)($header['anio'] ?? date('Y'));

    // Get Details
    $sql = "SELECT d.*, c.nombres, c.apellidos, c.documento_numero, c.regimen_pensionario
            FROM planilla_detalles d
            JOIN colaboradores c ON d.colaborador_id = c.id
            WHERE d.planilla_id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$id]);
    $details = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Add employer contributions per detail
    $rates = getEmployerRates($conn);
    foreach ($details as &$d) {
        $base = (float)$d['total_bruto'];
        $d['essalud_aporte'] = round($base * $rates['essalud_tasa'], 2);
        $d['vida_ley_aporte'] = round($base * $rates['vida_ley_tasa'], 2);
        $d['sctr_aporte'] = round($base * $rates['sctr_tasa'], 2);
        $colabId = (int)$d['colaborador_id'];
        $stmtHor = $conn->prepare("SELECT fecha, hora_entrada, hora_salida FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND estado IN ('Presente','Validado')");
        $stmtHor->execute([$colabId, $mes, $anio]);
        $totalOrdSecs = 0;
        while ($rowH = $stmtHor->fetch(PDO::FETCH_ASSOC)) {
            $he = $rowH['hora_entrada']; $hs = $rowH['hora_salida'];
            if (!$he || !$hs) continue;
            $start = strtotime($he); $end = strtotime($hs);
            if ($end <= $start) continue;
            $worked = $end - $start;
            $totalOrdSecs += min($worked, 8 * 3600); // cap ordinary to 8h/day
        }
        $d['horas_ordinarias'] = round($totalOrdSecs / 3600.0, 2);

        // If horas extras missing, compute from asistencias for display
        $horasExtras = isset($d['horas_extras']) ? (float)$d['horas_extras'] : 0.0;
        if ($horasExtras <= 0) {
            $stmtEx = $conn->prepare("SELECT SUM(horas_extras) as extras FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ?");
            $stmtEx->execute([$colabId, $mes, $anio]);
            $sumEx = $stmtEx->fetch(PDO::FETCH_ASSOC);
            $horasExtras = $sumEx && $sumEx['extras'] ? (float)$sumEx['extras'] : 0.0;
            if ($horasExtras <= 0) {
                $stmtRows = $conn->prepare("SELECT hora_entrada, hora_salida FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND estado IN ('Validado','Presente','Pendiente','Tardanza','Asistencia')");
                $stmtRows->execute([$colabId, $mes, $anio]);
                $extrasCalc = 0.0;
                while ($rowE = $stmtRows->fetch(PDO::FETCH_ASSOC)) {
                    $he = $rowE['hora_entrada']; $hs = $rowE['hora_salida'];
                    if (!$he || !$hs) continue;
                    $start = strtotime($he); $end = strtotime($hs);
                    if ($end <= $start) continue;
                    $hours = ($end - $start) / 3600.0;
                    if ($hours > 8) $extrasCalc += ($hours - 8);
                }
                $horasExtras = $extrasCalc;
            }
            $d['horas_extras'] = $horasExtras;
            $hourlyRate = ((float)$d['sueldo_base'] / 30) / 8;
            $he25 = min($horasExtras, 2);
            $he35 = max($horasExtras - 2, 0);
            $d['monto_horas_extras'] = round(($he25 * $hourlyRate * 1.25) + ($he35 * $hourlyRate * 1.35), 2);
        }
        $regimenCalc = getRegimenPensionario($conn, $colabId, $mes, $anio, $d['regimen_pensionario'] ?? 'ONP');
        if ($regimenCalc === 'ONP') {
            $d['afp_detalle'] = [
                'tipo' => 'ONP',
                'aporte_pct' => 13.0,
                'seguro_pct' => 0.0,
                'comision_pct' => 0.0,
                'aporte' => round($base * 0.13, 2),
                'seguro' => 0.0,
                'comision' => 0.0,
                'total' => round($base * 0.13, 2)
            ];
        } else {
            $r = getAfpRates($regimenCalc, 'Flujo');
            $ap = round($base * $r['aporte'], 2);
            $se = round($base * $r['seguro'], 2);
            $co = round($base * $r['comision'], 2);
            $d['afp_detalle'] = [
                'tipo' => $regimenCalc,
                'aporte_pct' => round($r['aporte'] * 100, 2),
                'seguro_pct' => round($r['seguro'] * 100, 2),
                'comision_pct' => round($r['comision'] * 100, 2),
                'aporte' => $ap,
                'seguro' => $se,
                'comision' => $co,
                'total' => round($ap + $se + $co, 2)
            ];
        }
    }
    unset($d);

    // Employer Contributions Summary (Essalud/Vida Ley/SCTR)
    $aportes = ['essalud' => 0, 'vida_ley' => 0, 'sctr' => 0, 'total' => 0];
    foreach ($details as $d) {
        $base = (float)$d['total_bruto'];
        $ess = $base * $rates['essalud_tasa'];
        $vida = $base * $rates['vida_ley_tasa'];
        $sctr = $base * $rates['sctr_tasa'];
        $aportes['essalud'] += $ess;
        $aportes['vida_ley'] += $vida;
        $aportes['sctr'] += $sctr;
    }
    $aportes['total'] = $aportes['essalud'] + $aportes['vida_ley'] + $aportes['sctr'];
    $header['aportes_empleador'] = $aportes;

    echo json_encode(["header" => $header, "details" => $details]);
}
function handlePlame($conn) {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(["message" => "Falta id de planilla"]);
        return;
    }
    $stmt = $conn->prepare("SELECT * FROM planillas WHERE id = ?");
    $stmt->execute([$id]);
    $pl = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$pl) {
        http_response_code(404);
        echo json_encode(["message" => "Planilla no encontrada"]);
        return;
    }
    $periodo = sprintf("%04d-%02d", (int)$pl['anio'], (int)$pl['mes']);
    $stmtEmp = $conn->query("SELECT ruc FROM empresa_datos LIMIT 1");
    $emp = $stmtEmp->fetch(PDO::FETCH_ASSOC);
    $ruc = $emp['ruc'] ?? '00000000000';
    $sql = "SELECT d.*, c.nombres, c.apellidos, c.documento_numero, c.regimen_pensionario
            FROM planilla_detalles d
            JOIN colaboradores c ON d.colaborador_id = c.id
            WHERE d.planilla_id = ?";
    $stmtD = $conn->prepare($sql);
    $stmtD->execute([$id]);
    $details = $stmtD->fetchAll(PDO::FETCH_ASSOC);
    $mes = (int)$pl['mes'];
    $anio = (int)$pl['anio'];
    foreach ($details as &$d) {
        $d['regimen_pensionario'] = getRegimenPensionario($conn, $d['colaborador_id'], $mes, $anio, $d['regimen_pensionario'] ?? 'ONP');
    }
    unset($d);
    $lines = [];
    foreach ($details as $d) {
        $doc = $d['documento_numero'];
        $base = (float)$d['sueldo_base'];
        $af = (float)$d['asignacion_familiar_monto'];
        $he = (float)$d['monto_horas_extras'];
        $bon = (float)$d['bonos'];
        $com = (float)$d['comisiones'];
        $afp_onp = (float)$d['afp_onp_monto'];
        $quinta = (float)$d['quinta_categoria_monto'];
        $ingresos = [
            ['concepto' => 'Sueldo', 'monto' => $base],
            ['concepto' => 'AsignacionFamiliar', 'monto' => $af],
            ['concepto' => 'HorasExtras', 'monto' => $he],
            ['concepto' => 'Bonos', 'monto' => $bon],
            ['concepto' => 'Comisiones', 'monto' => $com],
        ];
        $descuentos = [
            ['concepto' => 'AFP_ONP', 'monto' => $afp_onp],
            ['concepto' => 'QuintaCategoria', 'monto' => $quinta],
        ];
        $lines[] = [
            'periodo' => $periodo,
            'empresa_ruc' => $ruc,
            'documento' => $doc,
            'colaborador' => $d['apellidos'] . ' ' . $d['nombres'],
            'ingresos' => $ingresos,
            'descuentos' => $descuentos,
            'neto' => (float)$d['neto_pagar']
        ];
    }
    echo json_encode(['periodo' => $periodo, 'empresa_ruc' => $ruc, 'tipo' => $pl['tipo'], 'data' => $lines]);
}
function handlePlameExport($conn) {
    $id = $_GET['id'] ?? null;
    $file = strtolower($_GET['file'] ?? 'rem');
    if (!$id) {
        http_response_code(400);
        echo json_encode(["message" => "Falta id de planilla"]);
        return;
    }
    $stmt = $conn->prepare("SELECT * FROM planillas WHERE id = ?");
    $stmt->execute([$id]);
    $pl = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$pl) {
        http_response_code(404);
        echo json_encode(["message" => "Planilla no encontrada"]);
        return;
    }
    $periodo = sprintf("%04d%02d", (int)$pl['anio'], (int)$pl['mes']);
    $stmtEmp = $conn->query("SELECT ruc FROM empresa_datos LIMIT 1");
    $emp = $stmtEmp->fetch(PDO::FETCH_ASSOC);
    $ruc = $emp['ruc'] ?? '00000000000';
    $sql = "SELECT d.*, c.nombres, c.apellidos, c.documento_numero, c.regimen_pensionario
            FROM planilla_detalles d
            JOIN colaboradores c ON d.colaborador_id = c.id
            WHERE d.planilla_id = ?";
    $stmtD = $conn->prepare($sql);
    $stmtD->execute([$id]);
    $details = $stmtD->fetchAll(PDO::FETCH_ASSOC);
    $rows = [];
    if ($file === 'rem') {
        foreach ($details as $d) {
            $rows[] = implode('|', [
                $periodo,
                $ruc,
                $d['documento_numero'],
                trim($d['apellidos'] . ' ' . $d['nombres']),
                number_format((float)$d['sueldo_base'], 2, '.', ''),
                number_format((float)$d['asignacion_familiar_monto'], 2, '.', ''),
                number_format((float)$d['monto_horas_extras'], 2, '.', ''),
                number_format((float)$d['bonos'], 2, '.', ''),
                number_format((float)$d['comisiones'], 2, '.', ''),
                number_format((float)$d['total_bruto'], 2, '.', '')
            ]);
        }
        $fname = "PLAME_REM_{$periodo}.txt";
    } elseif ($file === 'jor') {
        $stmtHoras = $conn->prepare("SELECT SUM(horas_trabajadas) as ht, SUM(horas_extras) as he FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ?");
        foreach ($details as $d) {
            $stmtHoras->execute([$d['colaborador_id'], (int)$pl['mes'], (int)$pl['anio']]);
            $sum = $stmtHoras->fetch(PDO::FETCH_ASSOC);
            $ht = $sum && $sum['ht'] ? (float)$sum['ht'] : 0.0;
            $he = $sum && $sum['he'] ? (float)$sum['he'] : 0.0;
            $rows[] = implode('|', [
                $periodo,
                $ruc,
                $d['documento_numero'],
                trim($d['apellidos'] . ' ' . $d['nombres']),
                (int)$d['dias_trabajados'],
                number_format($ht, 2, '.', ''),
                number_format($he, 2, '.', '')
            ]);
        }
        $fname = "PLAME_JOR_{$periodo}.txt";
    } else {
        foreach ($details as $d) {
            $rows[] = implode('|', [
                $periodo,
                $ruc,
                $d['documento_numero'],
                trim($d['apellidos'] . ' ' . $d['nombres']),
                $d['regimen_pensionario'],
                number_format((float)$d['afp_onp_monto'], 2, '.', '')
            ]);
        }
        $fname = "PLAME_PEN_{$periodo}.txt";
    }
    $content = implode("\r\n", $rows) . "\r\n";
    header('Content-Type: text/plain');
    header('Content-Disposition: attachment; filename="'.$fname.'"');
    header('Content-Length: ' . strlen($content));
    echo $content;
}

function handleGenerate($conn) {
    $data = json_decode(file_get_contents("php://input"));
    $mes = $data->mes;
    $anio = $data->anio;
    $tipo = $data->tipo ?? 'Mensual'; // Mensual, Gratificacion, CTS

    // Check if exists
    $check = $conn->prepare("SELECT id FROM planillas WHERE mes = ? AND anio = ? AND tipo = ?");
    $check->execute([$mes, $anio, $tipo]);
    if ($check->fetch()) {
        http_response_code(400);
        echo json_encode(["message" => "La planilla de tipo $tipo para este periodo ya existe"]);
        return;
    }

    $conn->beginTransaction();

    try {
        // 1. Create Header
        $stmt = $conn->prepare("INSERT INTO planillas (mes, anio, tipo, estado) VALUES (?, ?, ?, 'Borrador')");
        $stmt->execute([$mes, $anio, $tipo]);
        $planillaId = $conn->lastInsertId();

        // 2. Get Collaborators for period
        $colabs = getColaboradoresParaPeriodo($conn, $mes, $anio);

        $totalIngresos = 0;
        $totalDescuentos = 0;
        $totalNeto = 0;

        foreach ($colabs as $c) {
            $sueldoFallback = $c['sueldo_base'] ?: getRMV($conn);
            $sueldo = getSueldoContrato($conn, $c['id'], $mes, $anio, $sueldoFallback);
            $rmv = getRMV($conn);
            if ($sueldo < $rmv) $sueldo = $rmv;
            
            // Initialize vars
            $dias = 30;
            $horasExtras = 0;
            $montoExtras = 0;
            $bonos = 0;
            $comisiones = 0;
            $afpOnpMonto = 0;
            $tardanzas = 0;
            $prestamos = 0;
            $bruto = 0;
                    $neto = 0;
                    
                    $asignacionFamiliar = 0;
                    $quintaCategoria = 0;

                    if ($tipo === 'Mensual') {
                // --- CALCULO MENSUAL ---
                
                // Overtime logic
                $stmtAsist = $conn->prepare("SELECT SUM(horas_extras) as extras FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ?");
                $stmtAsist->execute([$c['id'], $mes, $anio]);
                $resAsist = $stmtAsist->fetch(PDO::FETCH_ASSOC);
                $horasExtras = $resAsist['extras'] ?: 0;
                if ($horasExtras <= 0) {
                    $stmtRows = $conn->prepare("SELECT hora_entrada, hora_salida FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND estado IN ('Validado','Presente','Pendiente','Tardanza','Asistencia')");
                    $stmtRows->execute([$c['id'], $mes, $anio]);
                    $extrasCalc = 0.0;
                    while ($r = $stmtRows->fetch(PDO::FETCH_ASSOC)) {
                        $he = $r['hora_entrada']; $hs = $r['hora_salida'];
                        if (!$he || !$hs) continue;
                        $start = strtotime($he); $end = strtotime($hs);
                        if ($end <= $start) continue;
                        $hours = ($end - $start) / 3600.0;
                        if ($hours > 8) $extrasCalc += ($hours - 8);
                    }
                    $horasExtras = $extrasCalc;
                }
                // Días trabajados (entrada registrada y estado no Falta/Licencia/Vacaciones)
                $stmtDias = $conn->prepare("SELECT COUNT(*) FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND hora_entrada IS NOT NULL AND estado NOT IN ('Falta','Licencia','Vacaciones')");
                $stmtDias->execute([$c['id'], $mes, $anio]);
                $diasCalc = (int)$stmtDias->fetchColumn();
                $dias = $diasCalc > 0 ? $diasCalc : $dias;
                // Dominicales
                $stmtDom = $conn->prepare("SELECT COUNT(*) FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND hora_entrada IS NOT NULL AND estado NOT IN ('Falta','Licencia','Vacaciones') AND DAYOFWEEK(fecha) = 1");
                $stmtDom->execute([$c['id'], $mes, $anio]);
                $dominicales = (int)$stmtDom->fetchColumn();
                
                $hourlyRate = ($sueldo / 30) / 8;
                $he25 = min($horasExtras, 2);
                $he35 = max($horasExtras - 2, 0);
                $montoExtras = ($he25 * $hourlyRate * 1.25) + ($he35 * $hourlyRate * 1.35);
                // Prima dominical: remuneración diaria por cada domingo asistido
                if ($dominicales > 0) {
                    $bonos += $dominicales * ($sueldo / 30.0);
                }
                $hourlyRate = ($sueldo / 30) / 8;
                $he25 = min($horasExtras, 2);
                $he35 = max($horasExtras - 2, 0);
                $montoExtras = ($he25 * $hourlyRate * 1.25) + ($he35 * $hourlyRate * 1.35);

                // --- Asignación Familiar ---
                $afFlag = getAsignacionFamiliarContrato($conn, $c['id'], $mes, $anio);
                if ($afFlag === 1) $asignacionFamiliar = getRMV($conn) * 0.10;
                if ($asignacionFamiliar <= 0) {
                    $afAny = getAsignacionFamiliarContratoAny($conn, $c['id']);
                    if ($afAny === 1) $asignacionFamiliar = getRMV($conn) * 0.10;
                }

                // Taxes
                $regimen = getRegimenPensionario($conn, $c['id'], $mes, $anio, $c['regimen_pensionario'] ?? 'ONP');
                $afpOnpRate = getPensionRate($regimen); // Use helper function

                // Prorrateo de sueldo por días trabajados
                $sueldoDiario = ($sueldo / 30.0);
                $baseRemunerativa = $sueldoDiario * $dias;
                $bruto = $baseRemunerativa + $asignacionFamiliar + $montoExtras + $bonos + $comisiones; 
                $afpOnpMonto = $bruto * $afpOnpRate;
                $uit = getUIT($conn);
                $quintaCategoria = calcularQuintaCategoriaConAcumulado($conn, $c['id'], $sueldo, $asignacionFamiliar, $montoExtras, $uit, $mes, $anio);

                // Tardanzas automáticas (penalización desde 09:00)
                $tardanzas = calcularTardanzas($conn, $c['id'], $mes, $anio, $hourlyRate);
                // Trabajo nocturno (recargo 35% sobre horas nocturnas)
                $noctHoras = calcularNocturnidadHoras($conn, $c['id'], $mes, $anio);
                $noctMonto = $noctHoras * $hourlyRate * 0.35;
                $bonos += $noctMonto;
                
                $bruto = $baseRemunerativa + $asignacionFamiliar + $montoExtras + $bonos + $comisiones; 
                $afpOnpMonto = $bruto * $afpOnpRate;
                $neto = $bruto - $afpOnpMonto - $quintaCategoria;

            } elseif ($tipo === 'Gratificacion') {
                // --- CALCULO GRATIFICACION (Julio / Diciembre) ---
                // Asignacion Familiar Logic
                $afFlag = getAsignacionFamiliarContrato($conn, $c['id'], $mes, $anio);
                if ($afFlag === 1) $asignacionFamiliar = getRMV($conn) * 0.10; 
                if ($asignacionFamiliar <= 0) {
                    $afAny = getAsignacionFamiliarContratoAny($conn, $c['id']);
                    if ($afAny === 1) $asignacionFamiliar = getRMV($conn) * 0.10;
                }

                $mesesComputables = 6;
                $fechaIngreso = !empty($c['fecha_ingreso']) ? new DateTime($c['fecha_ingreso']) : new DateTime('1900-01-01');
                
                // Definir periodo computable
                if ($mes == 7) { // Julio -> Enero a Junio
                    $inicioPeriodo = new DateTime("$anio-01-01");
                    $finPeriodo = new DateTime("$anio-06-30");
                } else { // Diciembre -> Julio a Diciembre
                    $inicioPeriodo = new DateTime("$anio-07-01");
                    $finPeriodo = new DateTime("$anio-12-31");
                }

                if ($fechaIngreso > $finPeriodo) {
                    $mesesComputables = 0;
                } elseif ($fechaIngreso > $inicioPeriodo) {
                    // Calcular meses completos trabajados en el periodo
                    $diff = $fechaIngreso->diff($finPeriodo);
                    // Aproximación simple: meses + (dias/30)
                    $mesesComputables = $diff->m + ($diff->d >= 30 ? 1 : 0); 
                    // Nota: Ley laboral exacta requiere mes calendario completo, aqui simplificamos
                }

                $remuneracionComputable = $sueldo + $asignacionFamiliar;
                $bruto = ($remuneracionComputable / 6) * $mesesComputables; 
                
                $eps = getEPSFlag($conn);
                $bonos = $bruto * ($eps ? 0.0675 : 0.09); 
                
                $bruto += $bonos;
                $neto = $bruto; // Grati no tiene descuento AFP/ONP
                $dias = 0; // Irrelevant

            } elseif ($tipo === 'CTS') {
                // --- CALCULO CTS (Mayo / Noviembre) ---
                // Asignacion Familiar Logic
                $afFlag = getAsignacionFamiliarContrato($conn, $c['id'], $mes, $anio);
                if ($afFlag === 1) $asignacionFamiliar = getRMV($conn) * 0.10; 
                if ($asignacionFamiliar <= 0) {
                    $afAny = getAsignacionFamiliarContratoAny($conn, $c['id']);
                    if ($afAny === 1) $asignacionFamiliar = getRMV($conn) * 0.10;
                }

                // Periodo: Nov-Abr (para Mayo) o May-Oct (para Nov)
                $mesesComputables = 6;
                $fechaIngreso = !empty($c['fecha_ingreso']) ? new DateTime($c['fecha_ingreso']) : new DateTime('1900-01-01');
                
                if ($mes == 5) { // Mayo -> Noviembre prev a Abril curr
                    $prevYear = $anio - 1;
                    $inicioPeriodo = new DateTime("$prevYear-11-01");
                    $finPeriodo = new DateTime("$anio-04-30");
                } else { // Noviembre -> Mayo a Octubre
                    $inicioPeriodo = new DateTime("$anio-05-01");
                    $finPeriodo = new DateTime("$anio-10-31");
                }

                if ($fechaIngreso > $finPeriodo) {
                    $mesesComputables = 0;
                } elseif ($fechaIngreso > $inicioPeriodo) {
                    $diff = $fechaIngreso->diff($finPeriodo);
                    $mesesComputables = $diff->m + ($diff->d >= 30 ? 1 : 0);
                }
                
                $gratiTeorica = $sueldo + $asignacionFamiliar; 
                $inicioStr = $inicioPeriodo->format('Y-m-d');
                $finStr = $finPeriodo->format('Y-m-d');
                $hourlyRate = ($sueldo / 30) / 8;
                $stmtExtras = $conn->prepare("SELECT SUM(horas_extras) as extras FROM asistencias WHERE colaborador_id = ? AND fecha BETWEEN ? AND ? AND estado = 'Validado'");
                $stmtExtras->execute([$c['id'], $inicioStr, $finStr]);
                $sumExtras = $stmtExtras->fetch(PDO::FETCH_ASSOC);
                $promHorasExtras = ($sumExtras && $sumExtras['extras']) ? ((float)$sumExtras['extras'] / 6.0) : 0;
                $he25 = min($promHorasExtras, 2);
                $he35 = max($promHorasExtras - 2, 0);
                $promMontoExtras = ($he25 * $hourlyRate * 1.25) + ($he35 * $hourlyRate * 1.35);
                // Promedio de comisiones y bonos del semestre (tipo Mensual)
                $stmtProm = $conn->prepare("
                    SELECT AVG(d.comisiones) as prom_com, AVG(d.bonos) as prom_bonos
                    FROM planilla_detalles d
                    JOIN planillas p ON d.planilla_id = p.id
                    WHERE d.colaborador_id = ? AND p.tipo = 'Mensual' AND p.anio = ? AND p.mes BETWEEN ? AND ?
                ");
                $startMonth = ($mes == 5) ? 11 : 5;
                $startYear = ($mes == 5) ? ($anio - 1) : $anio;
                $endMonth = ($mes == 5) ? 4 : 10;
                $stmtProm->execute([$c['id'], $anio, $startMonth, $endMonth]);
                $promVars = $stmtProm->fetch(PDO::FETCH_ASSOC);
                $promComisiones = ($promVars && $promVars['prom_com']) ? (float)$promVars['prom_com'] : 0.0;
                $promBonos = ($promVars && $promVars['prom_bonos']) ? (float)$promVars['prom_bonos'] : 0.0;
                $remuneracionComputable = $sueldo + $asignacionFamiliar + $promMontoExtras + $promComisiones + $promBonos + ($gratiTeorica / 6);
                
                $bruto = ($remuneracionComputable / 12) * $mesesComputables;
                $neto = $bruto; 
                $dias = 0;
            }

            // Insert Detail
            $sqlDetail = "INSERT INTO planilla_detalles (planilla_id, colaborador_id, sueldo_base, dias_trabajados, horas_extras, monto_horas_extras, bonos, comisiones, asignacion_familiar_monto, total_bruto, afp_onp_monto, quinta_categoria_monto, tardanzas_monto, prestamos, total_descuentos, neto_pagar)
                          VALUES (:pid, :cid, :base, :dias, :he, :mhe, :bonos, :com, :asig, :bruto, :afp, :quinta, :tar, :pres, :desc, :neto)";
            
            $totalDescuentosRow = $afpOnpMonto + $tardanzas + $prestamos + $quintaCategoria;
            
            $stmtDetail = $conn->prepare($sqlDetail);
            $stmtDetail->execute([
                ':pid' => $planillaId,
                ':cid' => $c['id'],
                ':base' => $sueldo,
                ':dias' => $dias,
                ':he' => $horasExtras,
                ':mhe' => $montoExtras,
                ':bonos' => $bonos,
                ':com' => $comisiones,
                ':asig' => $asignacionFamiliar,
                ':bruto' => $bruto,
                ':afp' => $afpOnpMonto,
                ':quinta' => $quintaCategoria,
                ':tar' => $tardanzas,
                ':pres' => $prestamos,
                ':desc' => $totalDescuentosRow,
                ':neto' => $neto
            ]);

            $totalIngresos += $bruto;
            $totalDescuentos += $totalDescuentosRow;
            $totalNeto += $neto;
        }

        // Update Header Totals
        $updateH = $conn->prepare("UPDATE planillas SET total_ingresos = ?, total_descuentos = ?, total_neto = ? WHERE id = ?");
        $updateH->execute([$totalIngresos, $totalDescuentos, $totalNeto, $planillaId]);

        $conn->commit();
        echo json_encode(["message" => "Planilla generada exitosamente", "id" => $planillaId]);

    } catch (Exception $e) {
        $conn->rollBack();
        throw $e;
    }
}

function handleUpdateDetail($conn) {
    $data = json_decode(file_get_contents("php://input"));
    
    // Recalculate row
    $sueldo = $data->sueldo_base;
    $montoExtras = $data->monto_horas_extras;
    $bonos = $data->bonos;
    $comisiones = $data->comisiones;
    $asigFam = $data->asignacion_familiar_monto ?? 0;
    $dias = isset($data->dias_trabajados) ? (int)$data->dias_trabajados : 30;
    $baseRemunerativa = ((float)$sueldo / 30.0) * $dias;
    
    $bruto = $baseRemunerativa + $montoExtras + $bonos + $comisiones + $asigFam;
    
    // Get Colab Info for AFP/ONP Recalc
    $stmtC = $conn->prepare("SELECT c.regimen_pensionario, c.comision_afp FROM colaboradores c 
                             JOIN planilla_detalles d ON c.id = d.colaborador_id 
                             WHERE d.id = ?");
    $stmtC->execute([$data->id]);
    $colab = $stmtC->fetch(PDO::FETCH_ASSOC);
    
    $afpOnpRate = 0;
    if ($colab) {
        $afpOnpRate = getPensionRate($colab['regimen_pensionario'], $colab['comision_afp']);
    }
    
    // Recalculate AFP/ONP based on new Bruto
    // Note: If type is Gratificacion, AFP is 0. We should check planilla type but for simplicity 
    // assuming 'Mensual' logic mostly. If it's Grati, usually rate is 0 or logic differs.
    // Ideally we should check planilla type.
    
    // Check Planilla Type
    $stmtP = $conn->prepare("SELECT tipo, mes, anio FROM planillas WHERE id = ?");
    $stmtP->execute([$data->planilla_id]);
    $planilla = $stmtP->fetch(PDO::FETCH_ASSOC);
    
    if ($planilla && $planilla['tipo'] === 'Gratificacion') {
        $afpOnpMonto = 0;
    } else {
        $colabIdStmt = $conn->prepare("SELECT colaborador_id FROM planilla_detalles WHERE id = ?");
        $colabIdStmt->execute([$data->id]);
        $colabId = (int)($colabIdStmt->fetchColumn() ?: 0);
        
        $regimen = $colab ? getRegimenPensionario($conn, $colabId, (int)$planilla['mes'], (int)$planilla['anio'], $colab['regimen_pensionario'] ?? 'ONP') : 'ONP';
        $afpOnpRate = $colab ? getPensionRate($regimen, $colab['comision_afp'] ?? 'Flujo') : getPensionRate($regimen);
        $afpOnpMonto = $bruto * $afpOnpRate;
    }

    $tardanzas = $data->tardanzas_monto;
    $prestamos = $data->prestamos;
    $quinta = $data->quinta_categoria_monto ?? 0;
    
    $totalDescuentos = $afpOnpMonto + $tardanzas + $prestamos + $quinta;
    $neto = $bruto - $totalDescuentos;

    $sql = "UPDATE planilla_detalles SET 
            sueldo_base = :base,
            dias_trabajados = :dias,
            horas_extras = :he,
            monto_horas_extras = :mhe,
            bonos = :bonos, comisiones = :com, 
            asignacion_familiar_monto = :asig,
            total_bruto = :bruto, 
            afp_onp_monto = :afp, tardanzas_monto = :tar, prestamos = :pres,
            quinta_categoria_monto = :quinta,
            total_descuentos = :desc, neto_pagar = :neto
            WHERE id = :id";
            
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':base' => $sueldo,
        ':dias' => $data->dias_trabajados,
        ':he' => $data->horas_extras,
        ':mhe' => $montoExtras,
        ':bonos' => $bonos,
        ':com' => $comisiones,
        ':asig' => $asigFam,
        ':bruto' => $bruto,
        ':afp' => $afpOnpMonto,
        ':tar' => $tardanzas,
        ':pres' => $prestamos,
        ':quinta' => $quinta,
        ':desc' => $totalDescuentos,
        ':neto' => $neto,
        ':id' => $data->id
    ]);

    updateHeaderTotals($conn, $data->planilla_id);
    echo json_encode(["message" => "Detalle actualizado"]);
}
function handleRecalculate($conn) {
    $data = json_decode(file_get_contents("php://input"), true);
    $planillaId = $data['id'] ?? null;
    $mes = $data['mes'] ?? null;
    $anio = $data['anio'] ?? null;
    $tipo = $data['tipo'] ?? null;
    if (!$planillaId) {
        if ($mes && $anio) {
            $stmt = $conn->prepare("SELECT id FROM planillas WHERE mes = ? AND anio = ? " . ($tipo ? "AND tipo = ?" : "") . " LIMIT 1");
            $params = $tipo ? [$mes, $anio, $tipo] : [$mes, $anio];
            $stmt->execute($params);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) $planillaId = $row['id'];
        }
    }
    if (!$planillaId) {
        http_response_code(400);
        echo json_encode(["message" => "Falta id de planilla o periodo válido"]);
        return;
    }
    $stmtH = $conn->prepare("SELECT * FROM planillas WHERE id = ?");
    $stmtH->execute([$planillaId]);
    $pl = $stmtH->fetch(PDO::FETCH_ASSOC);
    if (!$pl) {
        http_response_code(404);
        echo json_encode(["message" => "Planilla no encontrada"]);
        return;
    }
    if ($pl['estado'] !== 'Borrador') {
        http_response_code(400);
        echo json_encode(["message" => "Solo se puede recalcular una planilla en estado Borrador"]);
        return;
    }
    
    // Ensure column exists
    try {
        $checkCol = $conn->query("SHOW COLUMNS FROM planilla_detalles LIKE 'monto_dominicales'");
        if ($checkCol->rowCount() == 0) {
            $conn->exec("ALTER TABLE planilla_detalles ADD COLUMN monto_dominicales DECIMAL(10, 2) DEFAULT 0");
        }
    } catch (Exception $e) {
        // Ignore if fails, likely concurrency or permission, but we proceed
    }

    $mes = (int)$pl['mes'];
    $anio = (int)$pl['anio'];
    $tipo = $pl['tipo'];
    $conn->beginTransaction();
    try {
        $conn->prepare("DELETE FROM planilla_detalles WHERE planilla_id = ?")->execute([$planillaId]);
        $colabs = getColaboradoresParaPeriodo($conn, $mes, $anio);
        $totalIngresos = 0; $totalDescuentos = 0; $totalNeto = 0;
        foreach ($colabs as $c) {
            $sueldoFallback = $c['sueldo_base'] ?: getRMV($conn);
            $sueldo = getSueldoContrato($conn, $c['id'], $mes, $anio, $sueldoFallback);
            $rmv = getRMV($conn);
            if ($sueldo < $rmv) $sueldo = $rmv;
            $dias = 30; $horasExtras = 0; $montoExtras = 0; $bonos = 0; $comisiones = 0;
            $afpOnpMonto = 0; $tardanzas = 0; $prestamos = 0; $bruto = 0; $neto = 0;
            $asignacionFamiliar = 0; $quintaCategoria = 0; $montoDominicales = 0;
            if ($tipo === 'Mensual') {
                $stmtAsist = $conn->prepare("SELECT SUM(horas_extras) as extras FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ?");
                $stmtAsist->execute([$c['id'], $mes, $anio]);
                $resAsist = $stmtAsist->fetch(PDO::FETCH_ASSOC);
                $horasExtras = $resAsist['extras'] ?: 0;
                if ($horasExtras <= 0) {
                    $stmtRows = $conn->prepare("SELECT hora_entrada, hora_salida FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND estado IN ('Validado','Presente','Pendiente','Tardanza','Asistencia')");
                    $stmtRows->execute([$c['id'], $mes, $anio]);
                    $extrasCalc = 0.0;
                    while ($r = $stmtRows->fetch(PDO::FETCH_ASSOC)) {
                        $he = $r['hora_entrada']; $hs = $r['hora_salida'];
                        if (!$he || !$hs) continue;
                        $start = strtotime($he); $end = strtotime($hs);
                        if ($end <= $start) continue;
                        $hours = ($end - $start) / 3600.0;
                        if ($hours > 8) $extrasCalc += ($hours - 8);
                    }
                    $horasExtras = $extrasCalc;
                }
                // Días trabajados y dominicales según reporte mensual
                $stmtDias = $conn->prepare("SELECT COUNT(*) FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND hora_entrada IS NOT NULL AND estado NOT IN ('Falta','Licencia','Vacaciones')");
                $stmtDias->execute([$c['id'], $mes, $anio]);
                $diasCalc = (int)$stmtDias->fetchColumn();
                
                $diasVacaciones = getVacationDays($conn, $c['id'], $mes, $anio);
                $diasTotal = $diasCalc + $diasVacaciones;
                if ($diasTotal > 30) $diasTotal = 30;

                // Si existen registros de asistencia (incluyendo Faltas), usamos el cálculo real
                $stmtCheck = $conn->prepare("SELECT COUNT(*) FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ?");
                $stmtCheck->execute([$c['id'], $mes, $anio]);
                $hasRecords = $stmtCheck->fetchColumn() > 0;
                
                if ($hasRecords || $diasVacaciones > 0) {
                    $dias = $diasTotal;
                }
                
                $stmtDom = $conn->prepare("SELECT COUNT(*) FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND hora_entrada IS NOT NULL AND estado NOT IN ('Falta','Licencia','Vacaciones') AND DAYOFWEEK(fecha) = 1");
                $stmtDom->execute([$c['id'], $mes, $anio]);
                $dominicales = (int)$stmtDom->fetchColumn();
                $hourlyRate = ($sueldo / 30) / 8;
                $he25 = min($horasExtras, 2);
                $he35 = max($horasExtras - 2, 0);
                $montoExtras = ($he25 * $hourlyRate * 1.25) + ($he35 * $hourlyRate * 1.35);
                $afFlag = getAsignacionFamiliarContrato($conn, $c['id'], $mes, $anio);
                if ($afFlag !== null) {
                    if ($afFlag == 1) $asignacionFamiliar = getRMV($conn) * 0.10;
                } else {
                    if (!empty($c['asignacion_familiar']) && $c['asignacion_familiar'] == 1) {
                        $asignacionFamiliar = getRMV($conn) * 0.10;
                    }
                }
                $regimen = getRegimenPensionario($conn, $c['id'], $mes, $anio, $c['regimen_pensionario'] ?? 'ONP');
                $afpOnpRate = getPensionRate($regimen);
                $montoDominicales = 0;
                if ($dominicales > 0) {
                    $montoDominicales = $dominicales * ($sueldo / 30.0);
                }
                $baseRemunerativa = ((float)$sueldo / 30.0) * (int)$dias;
                $bruto = $baseRemunerativa + $asignacionFamiliar + $montoExtras + $bonos + $comisiones + $montoDominicales;
                $afpOnpMonto = $bruto * $afpOnpRate;
                $uit = getUIT($conn);
                $quintaCategoria = calcularQuintaCategoriaConAcumulado($conn, $c['id'], $sueldo, $asignacionFamiliar, $montoExtras, $uit, $mes, $anio);
                $tardanzas = calcularTardanzas($conn, $c['id'], $mes, $anio, $hourlyRate);
                $noctHoras = calcularNocturnidadHoras($conn, $c['id'], $mes, $anio);
                $noctMonto = $noctHoras * $hourlyRate * 0.35;
                $bonos += $noctMonto;
                $bruto = $baseRemunerativa + $asignacionFamiliar + $montoExtras + $bonos + $comisiones + $montoDominicales;
                $afpOnpMonto = $bruto * $afpOnpRate;
                $totalDescuentosRow = $afpOnpMonto + $tardanzas + $prestamos + $quintaCategoria;
                $neto = $bruto - $totalDescuentosRow;
            } elseif ($tipo === 'Gratificacion') {
                $afFlag = getAsignacionFamiliarContrato($conn, $c['id'], $mes, $anio);
                if ($afFlag !== null) {
                    if ($afFlag == 1) $asignacionFamiliar = getRMV($conn) * 0.10; 
                } else {
                    if (!empty($c['asignacion_familiar']) && $c['asignacion_familiar'] == 1) {
                        $asignacionFamiliar = getRMV($conn) * 0.10; 
                    }
                }
                $mesesComputables = 6;
                $fechaIngreso = new DateTime($c['fecha_ingreso']);
                if ($mes == 7) {
                    $inicioPeriodo = new DateTime("$anio-01-01");
                    $finPeriodo = new DateTime("$anio-06-30");
                } else {
                    $inicioPeriodo = new DateTime("$anio-07-01");
                    $finPeriodo = new DateTime("$anio-12-31");
                }
                if ($fechaIngreso > $finPeriodo) {
                    $mesesComputables = 0;
                } elseif ($fechaIngreso > $inicioPeriodo) {
                    $diff = $fechaIngreso->diff($finPeriodo);
                    $mesesComputables = $diff->m + ($diff->d >= 30 ? 1 : 0); 
                }
                $remuneracionComputable = $sueldo + $asignacionFamiliar;
                $bruto = ($remuneracionComputable / 6) * $mesesComputables; 
                $eps = getEPSFlag($conn);
                $bonos = $bruto * ($eps ? 0.0675 : 0.09); 
                $bruto += $bonos;
                $neto = $bruto;
                $dias = 0;
            } elseif ($tipo === 'CTS') {
                $afFlag = getAsignacionFamiliarContrato($conn, $c['id'], $mes, $anio);
                if ($afFlag !== null) {
                    if ($afFlag == 1) $asignacionFamiliar = getRMV($conn) * 0.10; 
                } else {
                    if (!empty($c['asignacion_familiar']) && $c['asignacion_familiar'] == 1) {
                        $asignacionFamiliar = getRMV($conn) * 0.10; 
                    }
                }
                $mesesComputables = 6;
                $fechaIngreso = new DateTime($c['fecha_ingreso']);
                if ($mes == 5) {
                    $prevYear = $anio - 1;
                    $inicioPeriodo = new DateTime("$prevYear-11-01");
                    $finPeriodo = new DateTime("$anio-04-30");
                } else {
                    $inicioPeriodo = new DateTime("$anio-05-01");
                    $finPeriodo = new DateTime("$anio-10-31");
                }
                if ($fechaIngreso > $finPeriodo) {
                    $mesesComputables = 0;
                } elseif ($fechaIngreso > $inicioPeriodo) {
                    $diff = $fechaIngreso->diff($finPeriodo);
                    $mesesComputables = $diff->m + ($diff->d >= 30 ? 1 : 0);
                }
                $gratiTeorica = $sueldo + $asignacionFamiliar; 
                $inicioStr = $inicioPeriodo->format('Y-m-d');
                $finStr = $finPeriodo->format('Y-m-d');
                $hourlyRate = ($sueldo / 30) / 8;
                $stmtExtras = $conn->prepare("SELECT SUM(horas_extras) as extras FROM asistencias WHERE colaborador_id = ? AND fecha BETWEEN ? AND ? AND estado = 'Validado'");
                $stmtExtras->execute([$c['id'], $inicioStr, $finStr]);
                $sumExtras = $stmtExtras->fetch(PDO::FETCH_ASSOC);
                $promHorasExtras = ($sumExtras && $sumExtras['extras']) ? ((float)$sumExtras['extras'] / 6.0) : 0;
                $he25 = min($promHorasExtras, 2);
                $he35 = max($promHorasExtras - 2, 0);
                $promMontoExtras = ($he25 * $hourlyRate * 1.25) + ($he35 * $hourlyRate * 1.35);
                $stmtProm = $conn->prepare("
                    SELECT AVG(d.comisiones) as prom_com, AVG(d.bonos) as prom_bonos
                    FROM planilla_detalles d
                    JOIN planillas p ON d.planilla_id = p.id
                    WHERE d.colaborador_id = ? AND p.tipo = 'Mensual' AND p.anio = ? AND p.mes BETWEEN ? AND ?
                ");
                $startMonth = ($mes == 5) ? 11 : 5;
                $startYear = ($mes == 5) ? ($anio - 1) : $anio;
                $endMonth = ($mes == 5) ? 4 : 10;
                $stmtProm->execute([$c['id'], $anio, $startMonth, $endMonth]);
                $promVars = $stmtProm->fetch(PDO::FETCH_ASSOC);
                $promComisiones = ($promVars && $promVars['prom_com']) ? (float)$promVars['prom_com'] : 0.0;
                $promBonos = ($promVars && $promVars['prom_bonos']) ? (float)$promVars['prom_bonos'] : 0.0;
                $remuneracionComputable = $sueldo + $asignacionFamiliar + $promMontoExtras + $promComisiones + $promBonos + ($gratiTeorica / 6);
                $bruto = ($remuneracionComputable / 12) * $mesesComputables;
                $neto = $bruto; 
                $dias = 0;
            }
            $sqlDetail = "INSERT INTO planilla_detalles (planilla_id, colaborador_id, sueldo_base, dias_trabajados, horas_extras, monto_horas_extras, bonos, comisiones, monto_dominicales, asignacion_familiar_monto, total_bruto, afp_onp_monto, quinta_categoria_monto, tardanzas_monto, prestamos, total_descuentos, neto_pagar)
                          VALUES (:pid, :cid, :base, :dias, :he, :mhe, :bonos, :com, :dom, :asig, :bruto, :afp, :quinta, :tar, :pres, :desc, :neto)";
            $totalDescuentosRow = $afpOnpMonto + $tardanzas + $prestamos + $quintaCategoria;
            $stmtDetail = $conn->prepare($sqlDetail);
            $stmtDetail->execute([
                ':pid' => $planillaId,
                ':cid' => $c['id'],
                ':base' => $sueldo,
                ':dias' => $dias,
                ':he' => $horasExtras,
                ':mhe' => $montoExtras,
                ':bonos' => $bonos,
                ':com' => $comisiones,
                ':dom' => $montoDominicales ?? 0.00,
                ':asig' => $asignacionFamiliar,
                ':bruto' => $bruto,
                ':afp' => $afpOnpMonto,
                ':quinta' => $quintaCategoria,
                ':tar' => $tardanzas,
                ':pres' => $prestamos,
                ':desc' => $totalDescuentosRow,
                ':neto' => $neto
            ]);
            $totalIngresos += $bruto; $totalDescuentos += $totalDescuentosRow; $totalNeto += $neto;
        }
        $updateH = $conn->prepare("UPDATE planillas SET total_ingresos = ?, total_descuentos = ?, total_neto = ? WHERE id = ?");
        $updateH->execute([$totalIngresos, $totalDescuentos, $totalNeto, $planillaId]);
        $conn->commit();
        echo json_encode(["message" => "Planilla recalculada exitosamente", "id" => $planillaId]);
    } catch (Exception $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode(["message" => "Error al recalcular: " . $e->getMessage()]);
    }
}

function updateHeaderTotals($conn, $planillaId) {
    $sql = "SELECT SUM(total_bruto) as ing, SUM(total_descuentos) as desc_total, SUM(neto_pagar) as neto 
            FROM planilla_detalles WHERE planilla_id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$planillaId]);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $update = $conn->prepare("UPDATE planillas SET total_ingresos = ?, total_descuentos = ?, total_neto = ? WHERE id = ?");
    $update->execute([$res['ing'], $res['desc_total'], $res['neto'], $planillaId]);
}

function getPensionRate($regimen, $comisionType = 'Flujo') {
    if ($regimen === 'ONP') return 0.13;
    
    // Tasas Referenciales (Deberían ser dinámicas)
    // Aporte Obligatorio (10%) + Seguro (1.70% aprox) + Comision (varies)
    $aporte = 0.10;
    $seguro = 0.0170; // Promedio
    
    $comision = 0;
    switch ($regimen) {
        case 'AFP Integra':
            $comision = ($comisionType === 'Flujo') ? 0.0079 : 0.0000; 
            break;
        case 'AFP Prima':
            $comision = ($comisionType === 'Flujo') ? 0.0160 : 0.0018; 
            break;
        case 'AFP Profuturo':
            $comision = ($comisionType === 'Flujo') ? 0.0169 : 0.0067; 
            break;
        case 'AFP Habitat':
            $comision = ($comisionType === 'Flujo') ? 0.0147 : 0.0023; 
            break;
        default: 
            $comision = 0.01; // Default fallback
            break;
    }
    
    return $aporte + $seguro + $comision;
}

function getVacationDays($conn, $colabId, $month, $year) {
    $startDate = sprintf("%04d-%02d-01", $year, $month);
    $endDate = date("Y-m-t", strtotime($startDate));
    
    // Select days overlapping with approved vacations
    // Check tables: solicitudes_permisos
    // Ensure table exists or handle error? Assumed exists based on previous search.
    try {
        $sql = "SELECT fecha_inicio, fecha_fin FROM solicitudes_permisos 
                WHERE colaborador_id = ? AND tipo = 'Vacaciones' AND estado = 'Aprobado'
                AND (
                    (fecha_inicio <= ? AND fecha_fin >= ?) OR
                    (fecha_inicio >= ? AND fecha_inicio <= ?) OR
                    (fecha_fin >= ? AND fecha_fin <= ?)
                )";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$colabId, $endDate, $startDate, $startDate, $endDate, $startDate, $endDate]);
        
        $totalDays = 0;
        $periodStart = strtotime($startDate);
        $periodEnd = strtotime($endDate);

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $start = max(strtotime($row['fecha_inicio']), $periodStart);
            $end = min(strtotime($row['fecha_fin']), $periodEnd);
            if ($end >= $start) {
                $days = ($end - $start) / (60 * 60 * 24) + 1;
                $totalDays += $days;
            }
        }
        return (int)$totalDays;
    } catch (Exception $e) {
        return 0;
    }
}

function getAfpRates($regimen, $comisionType = 'Flujo') {
    if ($regimen === 'ONP') return ['aporte' => 0.13, 'seguro' => 0.0, 'comision' => 0.0];
    $aporte = 0.10;
    $seguro = 0.0170;
    $comision = 0;
    switch ($regimen) {
        case 'AFP Integra':
            $comision = ($comisionType === 'Flujo') ? 0.0079 : 0.0000; 
            break;
        case 'AFP Prima':
            $comision = ($comisionType === 'Flujo') ? 0.0160 : 0.0018; 
            break;
        case 'AFP Profuturo':
            $comision = ($comisionType === 'Flujo') ? 0.0169 : 0.0067; 
            break;
        case 'AFP Habitat':
            $comision = ($comisionType === 'Flujo') ? 0.0147 : 0.0023; 
            break;
        default: 
            $comision = 0.01;
            break;
    }
    return ['aporte' => $aporte, 'seguro' => $seguro, 'comision' => $comision];
}
function getEmpresaConfig($conn) {
    $stmt = $conn->query("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && !empty($row['configuracion_sunat'])) {
        $cfg = json_decode($row['configuracion_sunat'], true);
        if (json_last_error() === JSON_ERROR_NONE) return $cfg;
    }
    return [];
}
function getRMV($conn) {
    $cfg = getEmpresaConfig($conn);
    if (isset($cfg['rmv']) && is_numeric($cfg['rmv'])) return (float)$cfg['rmv'];
    return 1130.00; // RMV Actualizada
}
function getUIT($conn) {
    $cfg = getEmpresaConfig($conn);
    if (isset($cfg['uit']) && is_numeric($cfg['uit'])) return (float)$cfg['uit'];
    return 5350.00; // UIT 2025
}
function getEPSFlag($conn) {
    $cfg = getEmpresaConfig($conn);
    if (isset($cfg['eps'])) return (bool)$cfg['eps'];
    return false;
}
function getSueldoContrato($conn, $colabId, $mes, $anio, $fallback) {
    $periodStart = sprintf("%04d-%02d-01", (int)$anio, (int)$mes);
    $periodEnd = date('Y-m-t', strtotime($periodStart));
    $sql = "SELECT salario FROM contratos 
            WHERE colaborador_id = ? 
            AND fecha_inicio <= ?
            ORDER BY fecha_inicio DESC LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$colabId, $periodEnd]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && is_numeric($row['salario']) && (float)$row['salario'] > 0) return (float)$row['salario'];
    // Fallback: último contrato conocido aunque no cubra el periodo
    $stmt2 = $conn->prepare("SELECT salario FROM contratos WHERE colaborador_id = ? ORDER BY fecha_inicio DESC LIMIT 1");
    $stmt2->execute([$colabId]);
    $row2 = $stmt2->fetch(PDO::FETCH_ASSOC);
    if ($row2 && is_numeric($row2['salario']) && (float)$row2['salario'] > 0) return (float)$row2['salario'];
    return $fallback;
}
function getEmployerRates($conn) {
    $cfg = getEmpresaConfig($conn);
    $essalud = isset($cfg['essalud_tasa']) && is_numeric($cfg['essalud_tasa']) ? (float)$cfg['essalud_tasa'] : 0.09;
    $vidaLey = isset($cfg['vida_ley_tasa']) && is_numeric($cfg['vida_ley_tasa']) ? (float)$cfg['vida_ley_tasa'] : 0.0053;
    $sctr = isset($cfg['sctr_tasa']) && is_numeric($cfg['sctr_tasa']) ? (float)$cfg['sctr_tasa'] : 0.00;
    return ['essalud_tasa' => $essalud, 'vida_ley_tasa' => $vidaLey, 'sctr_tasa' => $sctr];
}
function getRegimenPensionario($conn, $colabId, $mes, $anio, $fallback) {
    $periodStart = sprintf("%04d-%02d-01", (int)$anio, (int)$mes);
    $periodEnd = date('Y-m-t', strtotime($periodStart));
    $sql = "SELECT regimen_pensionario FROM contratos 
            WHERE colaborador_id = ? 
            AND fecha_inicio <= ?
            ORDER BY fecha_inicio DESC LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$colabId, $periodEnd]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && !empty($row['regimen_pensionario'])) return $row['regimen_pensionario'];
    return $fallback ?: 'ONP';
}
function getAsignacionFamiliarContrato($conn, $colabId, $mes, $anio) {
    $periodStart = sprintf("%04d-%02d-01", (int)$anio, (int)$mes);
    $periodEnd = date('Y-m-t', strtotime($periodStart));
    $sql = "SELECT asignacion_familiar FROM contratos 
            WHERE colaborador_id = ? 
            AND fecha_inicio <= ?
            AND (fecha_fin IS NULL OR fecha_fin >= ?)
            ORDER BY fecha_inicio DESC LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$colabId, $periodEnd, $periodStart]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && isset($row['asignacion_familiar'])) return (int)$row['asignacion_familiar'];
    return null;
}
function getAsignacionFamiliarContratoAny($conn, $colabId) {
    $stmt = $conn->prepare("SELECT asignacion_familiar FROM contratos WHERE colaborador_id = ? ORDER BY fecha_inicio DESC LIMIT 1");
    $stmt->execute([$colabId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && isset($row['asignacion_familiar'])) return (int)$row['asignacion_familiar'];
    return null;
}
function getColaboradoresParaPeriodo($conn, $mes, $anio) {
    $stmt = $conn->query("SELECT * FROM colaboradores ORDER BY apellidos, nombres");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
function calcularQuintaCategoriaConAcumulado($conn, $colabId, $sueldo, $asigFam, $extrasMes, $uit, $mes, $anio) {
    $ingresoMensual = $sueldo + $asigFam + $extrasMes;
    $restantes = 12 - (int)$mes + 1;
    $proyeccion = $ingresoMensual * $restantes;
    $base = $proyeccion - (7 * $uit);
    if ($base <= 0) return 0;
    $t1 = min($base, 5 * $uit); $base -= $t1;
    $t2 = min(max($base, 0), 20 * $uit); $base -= $t2;
    $t3 = min(max($base, 0), 35 * $uit); $base -= $t3;
    $t4 = min(max($base, 0), 45 * $uit); $base -= $t4;
    $t5 = max($base, 0);
    $impuestoAnual = ($t1 * 0.08) + ($t2 * 0.14) + ($t3 * 0.17) + ($t4 * 0.20) + ($t5 * 0.30);
    // Retenciones acumuladas del año
    $stmt = $conn->prepare("
        SELECT SUM(d.quinta_categoria_monto) as retenido
        FROM planilla_detalles d
        JOIN planillas p ON d.planilla_id = p.id
        WHERE d.colaborador_id = ? AND p.tipo = 'Mensual' AND p.anio = ? AND p.mes < ?
    ");
    $stmt->execute([$colabId, $anio, $mes]);
    $acc = $stmt->fetch(PDO::FETCH_ASSOC);
    $retenido = ($acc && $acc['retenido']) ? (float)$acc['retenido'] : 0.0;
    $pendienteAnual = max($impuestoAnual - $retenido, 0);
    return $pendienteAnual / $restantes;
}
function calcularTardanzas($conn, $colabId, $mes, $anio, $hourlyRate) {
    $stmt = $conn->prepare("SELECT fecha, hora_entrada FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND estado IN ('Presente','Validado','Pendiente','Tardanza')");
    $stmt->execute([$colabId, $mes, $anio]);
    $totalPenalty = 0.0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $he = $row['hora_entrada'];
        $fecha = $row['fecha'];
        if (!$he || !$fecha) continue;
        $t = strtotime($he);
        $schedStr = getHorarioEntradaPorFecha($conn, $fecha);
        if (!$schedStr) continue;
        $sched = strtotime($schedStr);
        if ($t > $sched) {
            $diffSecs = $t - $sched;
            $hours = $diffSecs / 3600.0;
            $totalPenalty += ($hours * $hourlyRate);
        }
    }
    return round($totalPenalty, 2);
}
function getSystemSetting($conn, $key, $default) {
    $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
    $stmt->execute([$key]);
    $val = $stmt->fetchColumn();
    return $val !== false ? $val : $default;
}
function getHorarioEntradaPorFecha($conn, $fecha) {
    $dow = date('N', strtotime($fecha)); // 1..7 (Mon..Sun)
    if ($dow >= 1 && $dow <= 5) {
        return getSystemSetting($conn, 'asistencia_horario_lv_entrada', '08:00');
    } elseif ($dow === 6) {
        return getSystemSetting($conn, 'asistencia_horario_sab_entrada', '08:00');
    }
    return null;
}
function calcularNocturnidadHoras($conn, $colabId, $mes, $anio) {
    $stmt = $conn->prepare("SELECT hora_entrada, hora_salida FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND estado IN ('Presente','Validado')");
    $stmt->execute([$colabId, $mes, $anio]);
    $totalSecs = 0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $he = $row['hora_entrada']; $hs = $row['hora_salida'];
        if (!$he || !$hs) continue;
        $start = strtotime($he);
        $end = strtotime($hs);
        if ($end <= $start) continue;
        // Overlap with [00:00-06:00]
        $midStart = strtotime('00:00:00'); $midEnd = strtotime('06:00:00');
        $seg1 = max(0, min($end, $midEnd) - max($start, $midStart));
        // Overlap with [22:00-23:59:59]
        $nightStart = strtotime('22:00:00'); $nightEnd = strtotime('23:59:59');
        $seg2 = max(0, min($end, $nightEnd) - max($start, $nightStart));
        $totalSecs += $seg1 + $seg2;
    }
    return $totalSecs / 3600.0;
}
function handleUpdateStatus($conn) {
    $data = json_decode(file_get_contents("php://input"));
    
    if (!isset($data->id) || !isset($data->estado)) {
        http_response_code(400);
        echo json_encode(["message" => "Faltan datos"]);
        return;
    }

    $stmt = $conn->prepare("UPDATE planillas SET estado = ? WHERE id = ?");
    if ($stmt->execute([$data->estado, $data->id])) {
        echo json_encode(["message" => "Estado actualizado"]);
    } else {
        http_response_code(500);
        echo json_encode(["message" => "Error al actualizar estado"]);
    }
}

function handleDelete($conn) {
    $id = $_GET['id'];
    $conn->prepare("DELETE FROM planillas WHERE id = ?")->execute([$id]);
    echo json_encode(["message" => "Planilla eliminada"]);
}
?>
