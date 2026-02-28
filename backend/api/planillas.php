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
            if (isset($_GET['id'])) {
                handleGetDetails($conn);
            } else {
                handleList($conn);
            }
            break;

        case 'POST':
            if (isset($_GET['action']) && $_GET['action'] === 'generate') {
                handleGenerate($conn);
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

    // Get Details
    $sql = "SELECT d.*, c.nombres, c.apellidos, c.documento_numero, c.regimen_pensionario
            FROM planilla_detalles d
            JOIN colaboradores c ON d.colaborador_id = c.id
            WHERE d.planilla_id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$id]);
    $details = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(["header" => $header, "details" => $details]);
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

        // 2. Get Active Collaborators
        $colabs = $conn->query("SELECT * FROM colaboradores WHERE estado = 'Activo'")->fetchAll(PDO::FETCH_ASSOC);

        $totalIngresos = 0;
        $totalDescuentos = 0;
        $totalNeto = 0;

        foreach ($colabs as $c) {
            $sueldo = $c['sueldo_base'] ?: 1025.00;
            
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
                $stmtAsist = $conn->prepare("SELECT SUM(horas_extras) as extras FROM asistencias WHERE colaborador_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ? AND estado = 'Validado'");
                $stmtAsist->execute([$c['id'], $mes, $anio]);
                $resAsist = $stmtAsist->fetch(PDO::FETCH_ASSOC);
                $horasExtras = $resAsist['extras'] ?: 0;
                
                $hourlyRate = ($sueldo / 30) / 8;
                $montoExtras = $horasExtras * $hourlyRate * 1.25;

                // --- Asignación Familiar ---
                if (!empty($c['asignacion_familiar']) && $c['asignacion_familiar'] == 1) {
                    $asignacionFamiliar = 1025.00 * 0.10; // 10% RMV
                }

                // Taxes
                $afpOnpRate = getPensionRate($c['regimen_pensionario']); // Use helper function

                $bruto = $sueldo + $asignacionFamiliar + $montoExtras; 
                $afpOnpMonto = $bruto * $afpOnpRate;
                $neto = $bruto - $afpOnpMonto;

            } elseif ($tipo === 'Gratificacion') {
                // --- CALCULO GRATIFICACION (Julio / Diciembre) ---
                // Asignacion Familiar Logic
                if (!empty($c['asignacion_familiar']) && $c['asignacion_familiar'] == 1) {
                    $asignacionFamiliar = 1025.00 * 0.10; 
                }

                $mesesComputables = 6;
                $fechaIngreso = new DateTime($c['fecha_ingreso']);
                
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
                
                // Bono Extraordinario 9% (Essalud)
                $bonos = $bruto * 0.09; 
                
                $bruto += $bonos;
                $neto = $bruto; // Grati no tiene descuento AFP/ONP
                $dias = 0; // Irrelevant

            } elseif ($tipo === 'CTS') {
                // --- CALCULO CTS (Mayo / Noviembre) ---
                // Asignacion Familiar Logic
                if (!empty($c['asignacion_familiar']) && $c['asignacion_familiar'] == 1) {
                    $asignacionFamiliar = 1025.00 * 0.10; 
                }

                // Periodo: Nov-Abr (para Mayo) o May-Oct (para Nov)
                $mesesComputables = 6;
                $fechaIngreso = new DateTime($c['fecha_ingreso']);
                
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
                $remuneracionComputable = $sueldo + $asignacionFamiliar + ($gratiTeorica / 6);
                
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
    
    $bruto = $sueldo + $montoExtras + $bonos + $comisiones + $asigFam;
    
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
    $stmtP = $conn->prepare("SELECT tipo FROM planillas WHERE id = ?");
    $stmtP->execute([$data->planilla_id]);
    $planilla = $stmtP->fetch(PDO::FETCH_ASSOC);
    
    if ($planilla && $planilla['tipo'] === 'Gratificacion') {
        $afpOnpMonto = 0;
    } else {
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
