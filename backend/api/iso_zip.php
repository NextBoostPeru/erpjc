<?php
require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

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

$empresa_id = (int)($_REQUEST['empresa_id'] ?? 0);
$norma_id = (int)($_REQUEST['norma_id'] ?? 0);

if (!$empresa_id || !$norma_id) {
    die("Empresa ID and Norma ID are required");
}

try {
    // Get Company Name
    $stmtEmp = $conn->prepare("SELECT nombre FROM iso_empresas WHERE id = ?");
    $stmtEmp->execute([$empresa_id]);
    $empresaNombre = $stmtEmp->fetchColumn();

    // Get Norma Name
    $stmtNorma = $conn->prepare("SELECT codigo FROM iso_normas WHERE id = ?");
    $stmtNorma->execute([$norma_id]);
    $normaCodigo = $stmtNorma->fetchColumn();

    // Get Documents
    $stmt = $conn->prepare("
        SELECT d.*, i.numeral, i.requisito 
        FROM iso_documentos d
        JOIN iso_tracking t ON d.tracking_id = t.id
        JOIN iso_checklist_items i ON t.item_id = i.id
        WHERE t.empresa_id = ? AND t.norma_id = ?
    ");
    $stmt->execute([$empresa_id, $norma_id]);
    $docs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($docs)) {
        die("No documents found for this selection");
    }

    if (!class_exists('ZipArchive')) {
        header('Content-Type: text/html; charset=utf-8');
        die("<h3>Error del Servidor</h3><p>La extensión <b>ZipArchive</b> de PHP no está habilitada.</p><p>Por favor, habilite <code>extension=zip</code> en su archivo php.ini y reinicie el servidor web.</p>");
    }

    $zip = new ZipArchive();
    $zipName = "ISO_Docs_{$empresaNombre}_{$normaCodigo}_" . date('Ymd') . ".zip";
    $zipPath = sys_get_temp_dir() . '/' . $zipName;

    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        die("Error: No se puede crear el archivo temporal zip en " . $zipPath);
    }

    $missingFiles = [];
    $addedCount = 0;

    foreach ($docs as $doc) {
        $filePath = __DIR__ . '/' . $doc['ruta_archivo'];
        // Clean folder name
        $cleanRequisito = preg_replace('/[^a-zA-Z0-9\-_ ]/', '', $doc['requisito']);
        $folder = $doc['numeral'] . " - " . substr($cleanRequisito, 0, 50);
        
        if (file_exists($filePath)) {
            $zip->addFile($filePath, $folder . '/' . $doc['nombre_archivo']);
            $addedCount++;
        } else {
            $missingFiles[] = "Documento ID: {$doc['id']} - Archivo faltante: {$doc['nombre_archivo']} (Ruta esperada: {$doc['ruta_archivo']})";
        }
    }

    if (!empty($missingFiles)) {
        $zip->addFromString('archivos_faltantes.txt', implode("\r\n", $missingFiles));
    }

    if ($addedCount === 0 && empty($missingFiles)) {
         $zip->addFromString('info.txt', 'No se encontraron archivos físicos para los documentos seleccionados.');
    }

    $zip->close();

    // Stream the file
    header('Content-Type: application/zip');
    header('Content-disposition: attachment; filename=' . $zipName);
    header('Content-Length: ' . filesize($zipPath));
    readfile($zipPath);

    // Cleanup
    unlink($zipPath);

} catch (Exception $e) {
    die("Error: " . $e->getMessage());
}
?>
