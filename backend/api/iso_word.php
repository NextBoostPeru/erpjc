<?php
require_once '../vendor/autoload.php';
require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

use PhpOffice\PhpWord\TemplateProcessor;

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$token = $token ?: ($_REQUEST['token'] ?? '');
$userData = $jwtHandler->validateToken($token);
if (!$userData) {
    http_response_code(401);
    header("Content-Type: application/json; charset=UTF-8");
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

rbac_require($conn, $userData, 'gestion_iso', 'GET', 'lectura');

$id = (int)($_REQUEST['id'] ?? 0);

if (!$id) {
    die("Audit ID is required");
}

try {
    // Fetch Audit Data
    $stmt = $conn->prepare("
        SELECT a.*, c.nombre as checklist_nombre, c.codigo 
        FROM iso_audits a 
        JOIN iso_checklists c ON a.checklist_id = c.id 
        WHERE a.id = ?
    ");
    $stmt->execute([$id]);
    $audit = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$audit) {
        die("Audit not found");
    }

    // Fetch Details
    $stmtDetails = $conn->prepare("
        SELECT d.*, i.requisito, i.categoria, i.orden 
        FROM iso_audit_details d 
        JOIN iso_checklist_items i ON d.item_id = i.id 
        WHERE d.audit_id = ? 
        ORDER BY i.orden
    ");
    $stmtDetails->execute([$id]);
    $details = $stmtDetails->fetchAll(PDO::FETCH_ASSOC);

    // Path to template
    $templatePath = '../templates/iso_template.docx';
    if (!file_exists($templatePath)) {
        die("Template not found");
    }

    $templateProcessor = new TemplateProcessor($templatePath);

    // Replace Simple Variables
    // Note: You need to add these placeholders ${variable} to your Word template
    $templateProcessor->setValue('cliente_nombre', $audit['cliente_nombre']);
    $templateProcessor->setValue('n_contrato', $audit['n_contrato']);
    $templateProcessor->setValue('direccion', $audit['direccion']);
    $templateProcessor->setValue('representante_direccion', $audit['representante_direccion']);
    $templateProcessor->setValue('fecha_auditoria', $audit['fecha_auditoria']);
    $templateProcessor->setValue('alcance', $audit['alcance'] ?? '');
    $templateProcessor->setValue('objetivo', $audit['objetivo'] ?? '');
    $templateProcessor->setValue('checklist_nombre', $audit['checklist_nombre']);
    $templateProcessor->setValue('observaciones_finales', $audit['observaciones_finales']);
    $templateProcessor->setValue('juicio_final', $audit['juicio_final'] ?? '');

    // Clone Table Rows for Details
    // We assume there is a table row with placeholders like ${requisito}, ${hallazgos}, etc.
    // We need to group items or just list them.
    // If the template has a single row to clone:
    
    $values = [];
    foreach ($details as $item) {
        $nc = $item['es_nc'] ? 'X' : '';
        $obs = $item['es_obs'] ? 'X' : '';
        $verif = $item['verificado'] ? 'Sí' : 'No';

        $values[] = [
            'categoria' => $item['categoria'], // Might be useful if grouping
            'requisito' => $item['requisito'],
            'hallazgos' => $item['hallazgos'],
            'nc' => $nc,
            'obs' => $obs,
            'verif' => $verif
        ];
    }

    // Cloning rows. Assuming the template has a row with these variables.
    // If the template uses a specific variable to identify the row to clone, e.g., ${requisito}
    try {
        $templateProcessor->cloneRowAndSetValues('requisito', $values);
    } catch (Exception $e) {
        // Fallback or ignore if variable not found (user might not have updated template yet)
    }

    // Save
    $tempFile = tempnam(sys_get_temp_dir(), 'ISO_') . '.docx';
    $templateProcessor->saveAs($tempFile);

    // Download
    header('Content-Description: File Transfer');
    header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    header('Content-Disposition: attachment; filename="Auditoria_' . $audit['n_contrato'] . '.docx"');
    header('Content-Transfer-Encoding: binary');
    header('Expires: 0');
    header('Cache-Control: must-revalidate');
    header('Pragma: public');
    header('Content-Length: ' . filesize($tempFile));
    readfile($tempFile);
    unlink($tempFile);

} catch (Exception $e) {
    die("Error generating Word document: " . $e->getMessage());
}
?>
