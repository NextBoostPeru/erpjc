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

/**
 * Helper function to generate Boleta PDF
 * Returns array with keys: pdf_output (binary), filename, email, colaborador_nombre, mes_nombre, anio
 */
function generateBoletaData($detalleId, $withSignature, $conn) {
    // Fetch Data
    $sql = "SELECT d.*, 
                   c.nombres, c.apellidos, c.documento_numero, c.cargo, c.fecha_ingreso, c.regimen_pensionario, c.cuspp, c.tipo_contrato, c.regimen_laboral, c.email,
                   p.mes, p.anio
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

    // Calculate Employer Contributions (Aportes)
    // Essalud is typically 9% of the Total Bruto (Remuneration)
    $essalud = $row['total_bruto'] * 0.09;
    $total_aportes = $essalud;

    // Fetch Company Data
    $stmtEmp = $conn->query("SELECT ruc, razon_social, nombre_comercial, domicilio_fiscal FROM empresa_datos LIMIT 1");
    $empresaRow = $stmtEmp->fetch(PDO::FETCH_ASSOC) ?: [];
    // Prefer Razon Social for Boletas as it is a legal document
    $empresaNombre = !empty($empresaRow['razon_social']) ? $empresaRow['razon_social'] : ($empresaRow['nombre_comercial'] ?? 'EMPRESA');
    $empresaRuc = $empresaRow['ruc'] ?? '';
    $empresaDireccion = $empresaRow['domicilio_fiscal'] ?? '';

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
    $diasLaborados = $row['dias_trabajados'];
    // Assuming 30 days month for commercial calculation
    $diasNoLaborados = max(0, 30 - $diasLaborados); 
    $horasOrdinarias = ($diasLaborados * 8); // Estimado
    $horasExtras = $row['horas_extras'];
    // Split Document Type/Number (Assuming DNI default if not stored separate)
    $docTipo = 'DNI'; // Or fetch from DB if available
    $docNum = $row['documento_numero'];
    
    // HTML Content
    $html = '
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
            table { width: 100%; border-collapse: collapse; }
            
            .header-table td { vertical-align: top; padding: 2px; }
            .company-name { font-weight: bold; font-size: 12px; }
            
            .box { border: 1px solid #000; padding: 5px; margin-bottom: 5px; }
            .section-title { font-weight: bold; background-color: #eee; border-bottom: 1px solid #000; padding: 3px; font-size: 10px; }
            
            .data-table { width: 100%; font-size: 9px; }
            .data-table td { padding: 2px; }
            .label { font-weight: bold; width: 18%; }
            .value { width: 32%; }
            
            .concepts-table { width: 100%; margin-top: 10px; border: 1px solid #000; font-size: 9px; }
            .concepts-table th { background-color: #eee; border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 4px; text-align: center; }
            .concepts-table td { border-right: 1px solid #000; padding: 3px; }
            .concepts-table td.last { border-right: none; }
            
            .amount { text-align: right; }
            
            .totals-box { border: 1px solid #000; margin-top: 5px; padding: 0; }
            .totals-table td { padding: 4px; font-weight: bold; }
            
            .signatures { width: 100%; margin-top: 50px; }
            .sig-line { border-top: 1px solid #000; width: 80%; margin: 0 auto; margin-top: 30px; }
            .sig-text { text-align: center; font-size: 9px; margin-top: 5px; }
        </style>
    </head>
    <body>
        
        <!-- 1. Encabezado -->
        <table class="header-table" style="margin-bottom: 10px;">
            <tr>
                <td width="60%">
                    <div class="company-name">' . mb_strtoupper($empresaNombre) . '</div>
                    <div>RUC: ' . $empresaRuc . '</div>
                    <div>' . $empresaDireccion . '</div>
                </td>
                <td width="40%" align="right">
                    <div style="border: 1px solid #000; padding: 5px; text-align: center;">
                        <div style="font-weight: bold; font-size: 11px;">BOLETA DE PAGO</div>
                        <div style="font-size: 9px; margin-top: 2px;">DL. 728</div>
                        <div style="font-size: 9px; margin-top: 4px;">PERIODO: ' . mb_strtoupper($nombreMes) . ' ' . $row['anio'] . '</div>
                        <div style="font-size: 8px; margin-top: 4px;">NRO. ORDEN: ' . $numOrden . '</div>
                    </div>
                </td>
            </tr>
        </table>
        
        <div style="font-size: 9px; margin-bottom: 5px;">Sistema: PDT Planilla Electrónica – PLAME</div>

        <!-- 2. Identificación del Trabajador -->
        <div class="box">
            <div class="section-title">DATOS DEL TRABAJADOR</div>
            <table class="data-table">
                <tr>
                    <td class="label">Documento de Identidad:</td>
                    <td class="value">' . $docTipo . ' ' . $docNum . '</td>
                    <td class="label">Nombres y Apellidos:</td>
                    <td class="value">' . mb_strtoupper($row['apellidos'] . ', ' . $row['nombres']) . '</td>
                </tr>
                <tr>
                    <td class="label">Situación:</td>
                    <td class="value">ACTIVO</td>
                    <td class="label"></td>
                    <td class="value"></td>
                </tr>
            </table>
        </div>

        <!-- 3. Datos Laborales -->
        <div class="box">
            <div class="section-title">DATOS LABORALES</div>
            <table class="data-table">
                <tr>
                    <td class="label">Fecha de Ingreso:</td>
                    <td class="value">' . $fechaIngreso . '</td>
                    <td class="label">Régimen Pensionario:</td>
                    <td class="value">' . mb_strtoupper($row['regimen_pensionario']) . '</td>
                </tr>
                <tr>
                    <td class="label">Tipo de Trabajador:</td>
                    <td class="value">' . ($row['tipo_trabajador'] ?? 'EMPLEADO') . '</td>
                    <td class="label">CUSPP:</td>
                    <td class="value">' . ($row['cuspp'] ?: '') . '</td>
                </tr>
            </table>
        </div>

        <!-- 4. Control de Asistencia y Jornada -->
        <div class="box">
            <div class="section-title">CONTROL DE ASISTENCIA Y JORNADA LABORAL</div>
            <table class="data-table">
                <tr>
                    <td class="label">Días Laborados:</td>
                    <td class="value">' . $diasLaborados . '</td>
                    <td class="label">Jornada Ordinaria:</td>
                    <td class="value">' . $horasOrdinarias . ' Hrs 0 Min</td>
                </tr>
                <tr>
                    <td class="label">Días No Laborados:</td>
                    <td class="value">' . $diasNoLaborados . '</td>
                    <td class="label">Sobretiempo:</td>
                    <td class="value">' . ($horasExtras > 0 ? $horasExtras . ' Hrs' : '0 Hrs 0 Min') . '</td>
                </tr>
                <tr>
                    <td class="label">Días Subsidiados:</td>
                    <td class="value">0</td>
                    <td class="label">Condición:</td>
                    <td class="value">DOMICILIADO</td>
                </tr>
            </table>
        </div>
        
        <!-- 5. Suspensión de Labores (Placeholder) -->
        <div class="box">
            <div class="section-title">SUSPENSIÓN DE LABORES</div>
            <table class="data-table">
                <tr>
                    <td width="20%"><b>Motivo:</b> -</td>
                    <td width="20%"><b>Tipo:</b> -</td>
                    <td width="60%"><b>Nro. Días:</b> -</td>
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
                <tr>
                    <td align="center">0121</td>
                    <td>Remuneración o Jornal Básico</td>
                    <td class="amount">' . number_format($row['sueldo_base'], 2) . '</td>
                    <td class="amount"></td>
                    <td class="last"></td>
                </tr>
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

                <!-- Descuentos -->
                <tr>
                    <td align="center">0608</td>
                    <td>Sistema Pensionario (AFP/ONP)</td>
                    <td class="amount"></td>
                    <td class="amount">' . number_format($row['afp_onp_monto'], 2) . '</td>
                    <td class="last"></td>
                </tr>
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
                    <td width="40%">ESSALUD (9%)</td>
                    <td width="50%">' . number_format($essalud, 2) . '</td>
                </tr>
            </table>
        </div>

        <!-- 12. Firmas -->
        <div class="signatures">
            <table width="100%">
                <tr>
                    <td width="40%" align="center">
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

    } else {
        http_response_code(404);
        echo json_encode(["message" => "Acción no encontrada"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}
if (isset($conn)) $conn = null;
?>