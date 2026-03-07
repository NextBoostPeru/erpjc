<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

error_reporting(E_ERROR | E_PARSE);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;

// Auth Check
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

function getEmpresaConfig($conn) {
    $stmt = $conn->query("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && !empty($row['configuracion_sunat'])) {
        $cfg = json_decode($row['configuracion_sunat'], true);
        if (json_last_error() === JSON_ERROR_NONE) return $cfg;
    }
    return [];
}

function getEmployerRates($conn) {
    $cfg = getEmpresaConfig($conn);
    $essalud = isset($cfg['essalud_tasa']) && is_numeric($cfg['essalud_tasa']) ? (float)$cfg['essalud_tasa'] : 0.09;
    $vidaLey = isset($cfg['vida_ley_tasa']) && is_numeric($cfg['vida_ley_tasa']) ? (float)$cfg['vida_ley_tasa'] : 0.00;
    $sctr = isset($cfg['sctr_tasa']) && is_numeric($cfg['sctr_tasa']) ? (float)$cfg['sctr_tasa'] : 0.00;
    return ['essalud_tasa' => $essalud, 'vida_ley_tasa' => $vidaLey, 'sctr_tasa' => $sctr];
}

function getContratoPeriodo($conn, $colabId, $mes, $anio) {
    $periodStart = sprintf("%04d-%02d-01", (int)$anio, (int)$mes);
    $periodEnd = date('Y-m-t', strtotime($periodStart));
    $sql = "SELECT * FROM contratos
            WHERE colaborador_id = ?
            AND fecha_inicio <= ?
            AND (fecha_fin IS NULL OR fecha_fin >= ?)
            ORDER BY fecha_inicio DESC
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->execute([(int)$colabId, $periodEnd, $periodStart]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * Helper function to generate Boleta PDF
 * Returns array with keys: pdf_output (binary), filename, email, colaborador_nombre, mes_nombre, anio
 */
function generateBoletaData($detalleId, $withSignature, $conn) {
    // Fetch Data
    $sql = "SELECT d.*, 
                   c.nombres, c.apellidos, c.documento_numero, c.cargo, c.fecha_ingreso, c.regimen_pensionario, c.cuspp, c.tipo_contrato, c.regimen_laboral, c.email,
                   p.mes, p.anio, p.tipo
            FROM planilla_detalles d
            JOIN colaboradores c ON d.colaborador_id = c.id
            JOIN planillas p ON d.planilla_id = p.id
            WHERE d.id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$detalleId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        throw new Exception("Detalle no encontrado");
    }

    $contrato = getContratoPeriodo($conn, (int)$row['colaborador_id'], (int)$row['mes'], (int)$row['anio']);
    $regimenPensionario = $contrato && !empty($contrato['regimen_pensionario']) ? $contrato['regimen_pensionario'] : ($row['regimen_pensionario'] ?? '');
    $cuspp = $contrato && !empty($contrato['afp_cuspp']) ? $contrato['afp_cuspp'] : ($row['cuspp'] ?? '');

    $rates = getEmployerRates($conn);
    $essalud = (float)$row['total_bruto'] * (float)$rates['essalud_tasa'];
    $vidaLey = (float)$row['total_bruto'] * (float)$rates['vida_ley_tasa'];
    $sctr = (float)$row['total_bruto'] * (float)$rates['sctr_tasa'];
    $total_aportes = $essalud + $vidaLey + $sctr;

    // Fetch Company Data
    $stmtEmp = $conn->query("SELECT ruc, razon_social, nombre_comercial, domicilio_fiscal FROM empresa_datos LIMIT 1");
    $empresaRow = $stmtEmp->fetch(PDO::FETCH_ASSOC) ?: [];
    // Prefer Razon Social for Boletas as it is a legal document
    $empresaNombre = !empty($empresaRow['razon_social']) ? $empresaRow['razon_social'] : ($empresaRow['nombre_comercial'] ?? 'EMPRESA');
    $empresaRuc = $empresaRow['ruc'] ?? '';
    $empresaDireccion = $empresaRow['domicilio_fiscal'] ?? '';
    $stmtSig = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'firma_gerente_boleta' LIMIT 1");
    $stmtSig->execute();
    $sigRel = $stmtSig->fetchColumn();
    $firmaImgHtml = '';
    if (!empty($sigRel)) {
        $fsPath = __DIR__ . '/' . ltrim($sigRel, '/');
        if (file_exists($fsPath)) {
            $mime = function_exists('mime_content_type') ? mime_content_type($fsPath) : 'image/png';
            $base64 = base64_encode(file_get_contents($fsPath));
            $firmaImgHtml = '<img src="data:' . $mime . ';base64,' . $base64 . '" style="height:60px; margin-bottom:5px;" />';
        }
    }

    // Generate PDF
    $meses = [
        1 => 'Enero', 2 => 'Febrero', 3 => 'Marzo', 4 => 'Abril', 5 => 'Mayo', 6 => 'Junio',
        7 => 'Julio', 8 => 'Agosto', 9 => 'Septiembre', 10 => 'Octubre', 11 => 'Noviembre', 12 => 'Diciembre'
    ];
    $nombreMes = $meses[$row['mes']];

    // Setup Dompdf
    $options = new Options();
    $options->set('isRemoteEnabled', true);
    $dompdf = new Dompdf($options);

    // Prepare Values
    $numOrden = str_pad($row['id'] ?? 0, 8, '0', STR_PAD_LEFT);
    $fechaIngreso = $row['fecha_ingreso'] ? date('d/m/Y', strtotime($row['fecha_ingreso'])) : '-';
    $diasLaborados = isset($row['dias_trabajados']) && (int)$row['dias_trabajados'] > 0 ? (int)$row['dias_trabajados'] : 30;
    // Assuming 30 days month for commercial calculation
    $diasNoLaborados = max(0, 30 - $diasLaborados); 
    $horasOrdinarias = ($diasLaborados * 8); // Estimado
    $horasExtras = $row['horas_extras'];
    // Split Document Type/Number (Assuming DNI default if not stored separate)
    $docTipo = 'DNI'; // Or fetch from DB if available
    $docNum = $row['documento_numero'];
    
    $remuneracionBasica = (float)$row['sueldo_base'];
    if (($row['tipo'] ?? '') === 'Mensual') {
        $remuneracionBasica = ((float)$row['sueldo_base'] / 30.0) * (int)$diasLaborados;
    }
    
    // HTML Content
    $vacationDays = getVacationDays($conn, (int)$row['colaborador_id'], (int)$row['mes'], (int)$row['anio']);
    $diasLaboradosReal = max(0, $diasLaborados - $vacationDays);
    
    // Calculate split amounts
    // $remuneracionBasica comes from DB row 'sueldo_base' adjusted by days worked.
    // If days worked includes vacation (as per our planillas fix), then remuneracionBasica is the total for both.
    // We split it for display.
    $montoVacaciones = 0;
    $montoLaborado = $remuneracionBasica;
    
    if ($vacationDays > 0) {
        $ratePerDay = $remuneracionBasica / ($diasLaborados > 0 ? $diasLaborados : 30);
        $montoVacaciones = $ratePerDay * $vacationDays;
        $montoLaborado = $remuneracionBasica - $montoVacaciones;
    }

    // AFP Rates
    $afpDetails = [];
    if ($regimenPensionario !== 'ONP') {
        $afpRates = getAfpRates($regimenPensionario, 'Flujo'); // Default to Flujo if unknown
        $baseAfp = (float)$row['total_bruto'];
        $afpDetails['aporte'] = $baseAfp * $afpRates['aporte'];
        $afpDetails['seguro'] = $baseAfp * $afpRates['seguro'];
        $afpDetails['comision'] = $baseAfp * $afpRates['comision'];
    }

    $html = '
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 20px; }
            .header-table { width: 100%; margin-bottom: 10px; }
            .company-name { font-size: 14px; font-weight: bold; }
            .doc-title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 5px; }
            .box { border: 1px solid #000; margin-bottom: 5px; }
            .section-title { background-color: #eee; font-weight: bold; padding: 2px 5px; border-bottom: 1px solid #000; font-size: 9px; }
            .data-table { width: 100%; border-collapse: collapse; }
            .data-table td { padding: 2px 5px; vertical-align: top; }
            .label { font-weight: bold; width: 15%; }
            .value { width: 35%; }
            .concepts-table { width: 100%; border-collapse: collapse; margin-top: 5px; border: 1px solid #000; }
            .concepts-table th { background-color: #eee; border: 1px solid #000; padding: 3px; font-size: 9px; }
            .concepts-table td { border-left: 1px solid #000; border-right: 1px solid #000; padding: 2px 5px; }
            .concepts-table .last { border-right: 1px solid #000; }
            .amount { text-align: right; }
            .totals-box { border: 1px solid #000; margin-top: 5px; }
            .totals-table { width: 100%; border-collapse: collapse; }
            .totals-table td { padding: 3px 5px; font-weight: bold; }
            .signatures { margin-top: 40px; }
            .sig-line { border-top: 1px solid #000; width: 80%; margin: 0 auto; margin-bottom: 5px; }
            .sig-text { font-size: 9px; text-align: center; }
        </style>
    </head>
    <body>
        <!-- Header -->
        <table class="header-table">
            <tr>
                <td width="60%">
                    <div class="company-name">' . $empresaNombre . '</div>
                    <div>RUC: ' . $empresaRuc . '</div>
                    <div>' . $empresaDireccion . '</div>
                </td>
                <td width="40%" align="right">
                    <div class="box" style="padding: 5px; text-align: center;">
                        <b>BOLETA DE PAGO</b><br>
                        D.S. N° 001-98-TR
                    </div>
                </td>
            </tr>
        </table>

        <!-- 1. Datos del Trabajador -->
        <div class="box">
            <div class="section-title">DATOS DEL TRABAJADOR</div>
            <table class="data-table">
                <tr>
                    <td class="label">Apellidos y Nombres:</td>
                    <td class="value">' . $row['apellidos'] . ', ' . $row['nombres'] . '</td>
                    <td class="label">Fecha Ingreso:</td>
                    <td class="value">' . $fechaIngreso . '</td>
                </tr>
                <tr>
                    <td class="label">' . $docTipo . ':</td>
                    <td class="value">' . $docNum . '</td>
                    <td class="label">Régimen Pensionario:</td>
                    <td class="value">' . $regimenPensionario . '</td>
                </tr>
                <tr>
                    <td class="label">Cargo:</td>
                    <td class="value">' . $row['cargo'] . '</td>
                    <td class="label">CUSPP:</td>
                    <td class="value">' . $cuspp . '</td>
                </tr>
            </table>
        </div>

        <!-- 2. Periodo -->
        <div class="box">
            <table width="100%">
                <tr>
                    <td width="15%" class="label" style="padding: 2px 5px;">Periodo:</td>
                    <td width="35%" style="padding: 2px 5px;">' . $nombreMes . ' ' . $row['anio'] . '</td>
                    <td width="15%" class="label" style="padding: 2px 5px;">Moneda:</td>
                    <td width="35%" style="padding: 2px 5px;">SOLES</td>
                </tr>
            </table>
        </div>

        <!-- 3. Asistencia -->
        <div class="box">
            <div class="section-title">CONTROL DE ASISTENCIA Y JORNADA LABORAL</div>
            <table class="data-table">
                <tr>
                    <td class="label">Días Laborados:</td>
                    <td class="value">' . $diasLaboradosReal . '</td>
                    <td class="label">Jornada Ordinaria:</td>
                    <td class="value">' . $horasOrdinarias . ' Hrs 0 Min</td>
                </tr>
                <tr>
                    <td class="label">Días Vacaciones:</td>
                    <td class="value">' . $vacationDays . '</td>
                    <td class="label">Sobretiempo:</td>
                    <td class="value">' . ($horasExtras > 0 ? $horasExtras . ' Hrs' : '0 Hrs 0 Min') . '</td>
                </tr>
                <tr>
                    <td class="label">Días No Laborados:</td>
                    <td class="value">' . $diasNoLaborados . '</td>
                    <td class="label">Condición:</td>
                    <td class="value">DOMICILIADO</td>
                </tr>
            </table>
        </div>
        
        <!-- 6. Otros Empleadores -->
        <div class="box">
            <div class="section-title">OTROS EMPLEADORES POR RENTAS DE 5TA CATEGORÍA</div>
            <div style="padding: 2px; font-size: 9px;">Valor: No tiene</div>
        </div>

        <!-- 7. Detalle Económico -->
        <table class="concepts-table" cellspacing="0">
            <thead>
                <tr>
                    <th width="10%">CÓDIGO</th>
                    <th width="40%" style="text-align: left;">CONCEPTOS</th>
                    <th width="16%">INGRESOS S/.</th>
                    <th width="16%">DESCUENTOS S/.</th>
                    <th width="18%" class="last">NETO S/.</th>
                </tr>
            </thead>
            <tbody>
                <!-- Ingresos -->
                ' . ($montoLaborado > 0 ? '
                <tr>
                    <td align="center">0121</td>
                    <td>Remuneración o Jornal Básico</td>
                    <td class="amount">' . number_format($montoLaborado, 2) . '</td>
                    <td class="amount"></td>
                    <td class="last"></td>
                </tr>' : '') . '
                ' . ($montoVacaciones > 0 ? '
                <tr>
                    <td align="center">0118</td>
                    <td>Remuneración Vacacional</td>
                    <td class="amount">' . number_format($montoVacaciones, 2) . '</td>
                    <td class="amount"></td>
                    <td class="last"></td>
                </tr>' : '') . '
                ' . (($row['asignacion_familiar_monto'] ?? 0) > 0 ? '
                <tr>
                    <td align="center">0201</td>
                    <td>Asignación Familiar</td>
                    <td class="amount">' . number_format($row['asignacion_familiar_monto'], 2) . '</td>
                    <td class="amount"></td>
                    <td class="last"></td>
                </tr>' : '') . '
                ' . ($row['monto_horas_extras'] > 0 ? '
                <tr>
                    <td align="center">0105</td>
                    <td>Trabajo en Sobretiempo (Horas Extras)</td>
                    <td class="amount">' . number_format($row['monto_horas_extras'], 2) . '</td>
                    <td class="amount"></td>
                    <td class="last"></td>
                </tr>' : '') . '
                ' . ($row['bonos'] > 0 ? '
                <tr>
                    <td align="center">0301</td>
                    <td>Bonificaciones</td>
                    <td class="amount">' . number_format($row['bonos'], 2) . '</td>
                    <td class="amount"></td>
                    <td class="last"></td>
                </tr>' : '') . '
                ' . ($row['comisiones'] > 0 ? '
                <tr>
                    <td align="center">0401</td>
                    <td>Comisiones</td>
                    <td class="amount">' . number_format($row['comisiones'], 2) . '</td>
                    <td class="amount"></td>
                    <td class="last"></td>
                </tr>' : '') . '
                ' . (($row['monto_dominicales'] ?? 0) > 0 ? '
                <tr>
                    <td align="center">0107</td>
                    <td>Trabajo en Días de Descanso</td>
                    <td class="amount">' . number_format($row['monto_dominicales'], 2) . '</td>
                    <td class="amount"></td>
                    <td class="last"></td>
                </tr>' : '') . '

                <!-- Descuentos -->
                ' . ($regimenPensionario === 'ONP' ? '
                <tr>
                    <td align="center">0608</td>
                    <td>Sistema Pensionario (ONP)</td>
                    <td class="amount"></td>
                    <td class="amount">' . number_format($row['afp_onp_monto'], 2) . '</td>
                    <td class="last"></td>
                </tr>' : '
                <tr>
                    <td align="center">0608</td>
                    <td>AFP - Aporte Obligatorio</td>
                    <td class="amount"></td>
                    <td class="amount">' . number_format($afpDetails['aporte'], 2) . '</td>
                    <td class="last"></td>
                </tr>
                <tr>
                    <td align="center">0608</td>
                    <td>AFP - Comisión</td>
                    <td class="amount"></td>
                    <td class="amount">' . number_format($afpDetails['comision'], 2) . '</td>
                    <td class="last"></td>
                </tr>
                <tr>
                    <td align="center">0608</td>
                    <td>AFP - Prima de Seguro</td>
                    <td class="amount"></td>
                    <td class="amount">' . number_format($afpDetails['seguro'], 2) . '</td>
                    <td class="last"></td>
                </tr>') . '
                
                ' . (($row['quinta_categoria_monto'] ?? 0) > 0 ? '
                <tr>
                    <td align="center">0605</td>
                    <td>Renta 5ta Categoría</td>
                    <td class="amount"></td>
                    <td class="amount">' . number_format($row['quinta_categoria_monto'], 2) . '</td>
                    <td class="last"></td>
                </tr>' : '') . '
                ' . ($row['tardanzas_monto'] > 0 ? '
                <tr>
                    <td align="center">0704</td>
                    <td>Tardanzas</td>
                    <td class="amount"></td>
                    <td class="amount">' . number_format($row['tardanzas_monto'], 2) . '</td>
                    <td class="last"></td>
                </tr>' : '') . '
                ' . ($row['prestamos'] > 0 ? '
                <tr>
                    <td align="center">0706</td>
                    <td>Préstamos</td>
                    <td class="amount"></td>
                    <td class="amount">' . number_format($row['prestamos'], 2) . '</td>
                    <td class="last"></td>
                </tr>' : '') . '
                
                <!-- Blank Rows Filler -->
                <tr>
                    <td>&nbsp;</td><td></td><td></td><td></td><td class="last"></td>
                </tr>
            </tbody>
        </table>

        <!-- 10. Resultado -->
        <div class="totals-box">
            <table class="totals-table">
                <tr>
                    <td width="50%" style="text-align: right;">TOTALES</td>
                    <td width="16%" class="amount">' . number_format($row['total_bruto'], 2) . '</td>
                    <td width="16%" class="amount">' . number_format($row['total_descuentos'], 2) . '</td>
                    <td width="18%" class="amount">' . number_format($row['neto_pagar'], 2) . '</td>
                </tr>
                <tr>
                    <td colspan="3" style="text-align: right;">NETO A PAGAR S/.</td>
                    <td class="amount" style="background-color: #eee;">' . number_format($row['neto_pagar'], 2) . '</td>
                </tr>
            </table>
        </div>

        <!-- 11. Aportes del Empleador -->
        <div class="box" style="margin-top: 5px;">
            <div class="section-title">APORTES DEL EMPLEADOR</div>
            <table class="data-table">
                <tr>
                    <td width="10%" align="center">0804</td>
                    <td width="40%">ESSALUD (' . number_format(((float)$rates['essalud_tasa'] * 100), 2) . '%)</td>
                    <td width="50%">' . number_format($essalud, 2) . '</td>
                </tr>
                ' . ((float)$rates['vida_ley_tasa'] > 0 ? '
                <tr>
                    <td width="10%" align="center">0808</td>
                    <td width="40%">VIDA LEY (' . number_format(((float)$rates['vida_ley_tasa'] * 100), 2) . '%)</td>
                    <td width="50%">' . number_format($vidaLey, 2) . '</td>
                </tr>' : '') . '
                ' . ((float)$rates['sctr_tasa'] > 0 ? '
                <tr>
                    <td width="10%" align="center">0809</td>
                    <td width="40%">SCTR (' . number_format(((float)$rates['sctr_tasa'] * 100), 2) . '%)</td>
                    <td width="50%">' . number_format($sctr, 2) . '</td>
                </tr>' : '') . '
            </table>
        </div>

        <!-- 12. Firmas -->
        <div class="signatures">
            <table width="100%">
                <tr>
                    <td width="40%" align="center">
                        ' . $firmaImgHtml . '
                        <div class="sig-line"></div>
                        <div class="sig-text">
                            <b>EMPLEADOR</b><br>
                            ' . $empresaNombre . '
                        </div>
                    </td>
                    <td width="20%"></td>
                    <td width="40%" align="center">
                        ' . ($withSignature ? '
                        <div class="sig-line"></div>
                        <div class="sig-text">
                            <b>TRABAJADOR</b><br>
                            ' . $row['apellidos'] . ', ' . $row['nombres'] . '<br>
                            ' . $docTipo . ': ' . $docNum . '
                        </div>
                        ' : '') . '
                    </td>
                </tr>
            </table>
        </div>
        
        <div style="margin-top: 20px; font-size: 8px; text-align: center;">
            Fecha de Impresión: ' . date('d/m/Y H:i:s') . '
        </div>

    </body>
    </html>
    ';

    $dompdf->loadHtml($html);
    $dompdf->setPaper('A4', 'portrait');
    $dompdf->render();

    $pdfOutput = $dompdf->output();
    $filename = "Boleta_" . $row['anio'] . "_" . $row['mes'] . "_" . $row['documento_numero'] . ".pdf";
    
    return [
        'pdf_output' => $pdfOutput,
        'filename' => $filename,
        'email' => $row['email'],
        'colaborador_nombre' => $row['nombres'] . ' ' . $row['apellidos'],
        'mes_nombre' => $nombreMes,
        'anio' => $row['anio']
    ];
}

try {
    if ($method === 'GET' && $action === 'list_planillas') {
        // List planillas that have details (generated)
        $sql = "SELECT p.id, p.mes, p.anio, p.estado, 
                       (SELECT COUNT(*) FROM planilla_detalles WHERE planilla_id = p.id) as num_colaboradores
                FROM planillas p
                ORDER BY p.anio DESC, p.mes DESC";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($result);

    } elseif ($method === 'GET' && $action === 'list_details') {
        $planillaId = $_GET['planilla_id'] ?? 0;
        
        $sql = "SELECT d.id, d.colaborador_id, c.nombres, c.apellidos, c.documento_numero, c.cargo, c.email,
                       d.total_bruto, d.total_descuentos, d.neto_pagar
                FROM planilla_detalles d
                JOIN colaboradores c ON d.colaborador_id = c.id
                WHERE d.planilla_id = ?
                ORDER BY c.apellidos, c.nombres";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$planillaId]);
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($result);

    } elseif ($method === 'POST' && $action === 'generate_pdf') {
        $data = json_decode(file_get_contents("php://input"));
        $detalleId = $data->detalle_id;
        $withSignature = $data->with_signature ?? true;

        $boletaData = generateBoletaData($detalleId, $withSignature, $conn);
        $pdfBase64 = base64_encode($boletaData['pdf_output']);

        echo json_encode([
            "success" => true,
            "pdf_base64" => $pdfBase64,
            "filename" => $boletaData['filename']
        ]);

    } elseif ($method === 'POST' && $action === 'send_email') {
        $data = json_decode(file_get_contents("php://input"));
        $detalleId = $data->detalle_id;

        // Generate PDF
        $boletaData = generateBoletaData($detalleId, true, $conn);
        
        $email = $boletaData['email'];
        if (empty($email)) {
            http_response_code(400);
            echo json_encode(["error" => "El colaborador no tiene un correo electrónico registrado."]);
            exit;
        }

        // Get SMTP Settings
        $smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_email', 'smtp_from_name'];
        $stmtSettings = $conn->prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('" . implode("','", $smtpKeys) . "')");
        $stmtSettings->execute();
        $settings = $stmtSettings->fetchAll(PDO::FETCH_KEY_PAIR);

        // Send Email
        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host       = $settings['smtp_host'];
            $mail->SMTPAuth   = true;
            $mail->Username   = $settings['smtp_user'];
            $mail->Password   = $settings['smtp_pass'];
            $mail->SMTPSecure = $settings['smtp_secure'];
            $mail->Port       = $settings['smtp_port'];

            $fromEmail = $settings['smtp_from_email'] ?: 'noreply@erp.com';
            $fromName = $settings['smtp_from_name'] ?: 'ERP System';
            
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress($email, $boletaData['colaborador_nombre']);

            $mail->isHTML(true);
            $mail->Subject = 'Boleta de Pago - ' . $boletaData['mes_nombre'] . ' ' . $boletaData['anio'];
            $mail->Body    = "
                <p>Estimado(a) <b>{$boletaData['colaborador_nombre']}</b>,</p>
                <p>Adjunto encontrará su boleta de pago correspondiente al periodo <b>{$boletaData['mes_nombre']} {$boletaData['anio']}</b>.</p>
                <p>Atentamente,<br>{$fromName}</p>
            ";

            // Attach PDF
            $mail->addStringAttachment($boletaData['pdf_output'], $boletaData['filename']);

            $mail->send();
            echo json_encode(["success" => true, "message" => "Boleta enviada correctamente a {$email}"]);

        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["error" => "Error al enviar correo: " . $mail->ErrorInfo]);
        }

    } elseif ($method === 'POST' && $action === 'upload_signature') {
        if (!$userData) {
            http_response_code(401);
            echo json_encode(["error" => "Acceso no autorizado"]);
            exit;
        }
        if (!isset($_FILES['firma']) || $_FILES['firma']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(["error" => "Archivo no válido"]);
            exit;
        }
        $dir = __DIR__ . '/uploads/boletas_firmas/';
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        $ext = strtolower(pathinfo($_FILES['firma']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['png','jpg','jpeg'])) {
            http_response_code(400);
            echo json_encode(["error" => "Formato no permitido"]);
            exit;
        }
        $filename = 'firma_gerencia.' . $ext;
        $target = $dir . $filename;
        if (!move_uploaded_file($_FILES['firma']['tmp_name'], $target)) {
            http_response_code(500);
            echo json_encode(["error" => "No se pudo guardar"]);
            exit;
        }
        $relPath = 'uploads/boletas_firmas/' . $filename;
        $stmtChk = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'firma_gerente_boleta'");
        $stmtChk->execute();
        if ($stmtChk->fetchColumn()) {
            $stmtUpd = $conn->prepare("UPDATE system_settings SET setting_value = :val WHERE setting_key = 'firma_gerente_boleta'");
            $stmtUpd->execute([':val' => $relPath]);
        } else {
            $stmtIns = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('firma_gerente_boleta', :val)");
            $stmtIns->execute([':val' => $relPath]);
        }
        echo json_encode(["success" => true, "path" => $relPath]);
    } elseif ($method === 'GET' && $action === 'get_signature') {
        if (!$userData) {
            http_response_code(401);
            echo json_encode(["error" => "Acceso no autorizado"]);
            exit;
        }
        $stmtSig = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'firma_gerente_boleta' LIMIT 1");
        $stmtSig->execute();
        $rel = $stmtSig->fetchColumn();
        if ($rel) {
            echo json_encode(["exists" => true, "path" => $rel]);
        } else {
            echo json_encode(["exists" => false]);
        }
    } elseif ($method === 'POST' && $action === 'delete_signature') {
        if (!$userData) {
            http_response_code(401);
            echo json_encode(["error" => "Acceso no autorizado"]);
            exit;
        }
        $stmtSig = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'firma_gerente_boleta' LIMIT 1");
        $stmtSig->execute();
        $rel = $stmtSig->fetchColumn();
        if ($rel) {
            $fs = __DIR__ . '/' . ltrim($rel, '/');
            if (file_exists($fs)) {
                @unlink($fs);
            }
            $conn->prepare("DELETE FROM system_settings WHERE setting_key = 'firma_gerente_boleta'")->execute();
        }
        echo json_encode(["success" => true]);
    } else {
        http_response_code(404);
        echo json_encode(["message" => "Acción no encontrada"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}
if (isset($conn)) $conn = null;

function getVacationDays($conn, $colabId, $month, $year) {
    $startDate = sprintf("%04d-%02d-01", $year, $month);
    $endDate = date("Y-m-t", strtotime($startDate));
    
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
    // Tasas Referenciales (Junio 2025)
    // Aporte Obligatorio: 10%
    // Prima Seguro: ~1.70% (Promedio)
    // Comision Flujo: Variable
    
    $rates = [
        'aporte' => 0.10,
        'seguro' => 0.0170, 
        'comision' => 0.0160
    ];
    
    $regimen = strtoupper($regimen);
    if (strpos($regimen, 'INTEGRA') !== false) {
        $rates['seguro'] = 0.0170;
        $rates['comision'] = ($comisionType === 'Flujo') ? 0.0079 : 0.00; 
    } elseif (strpos($regimen, 'PRIMA') !== false) {
        $rates['seguro'] = 0.0170;
        $rates['comision'] = ($comisionType === 'Flujo') ? 0.0160 : 0.00;
    } elseif (strpos($regimen, 'PROFUTURO') !== false) {
        $rates['seguro'] = 0.0170;
        $rates['comision'] = ($comisionType === 'Flujo') ? 0.0169 : 0.00;
    } elseif (strpos($regimen, 'HABITAT') !== false) {
        $rates['seguro'] = 0.0170;
        $rates['comision'] = ($comisionType === 'Flujo') ? 0.0147 : 0.00;
    } else {
        // Default / Fallback if name not matched but is AFP
        $rates['comision'] = 0.01; 
    }
    
    return $rates;
}
?>
