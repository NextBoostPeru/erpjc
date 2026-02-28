<?php
require_once __DIR__ . '/../config/db.php';

echo "--- Checking Zip Creation ---\n";
try {
    // Mimic iso_zip.php logic
    // We need valid empresa_id and norma_id that match the document.
    // Let's find them from the document we found.
    $stmt = $conn->query("
        SELECT d.*, t.empresa_id, t.norma_id, i.numeral, i.requisito 
        FROM iso_documentos d
        JOIN iso_tracking t ON d.tracking_id = t.id
        JOIN iso_checklist_items i ON t.item_id = i.id
        LIMIT 1
    ");
    $doc = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$doc) {
        die("No documents found in DB to test.\n");
    }

    echo "Testing with Doc ID: " . $doc['id'] . "\n";
    echo "Empresa ID: " . $doc['empresa_id'] . "\n";
    echo "Norma ID: " . $doc['norma_id'] . "\n";
    echo "File Path: " . $doc['ruta_archivo'] . "\n";

    $zip = new ZipArchive();
    $zipName = "TEST_ZIP_" . time() . ".zip";
    $zipPath = __DIR__ . '/' . $zipName; // Create in current dir to be sure

    echo "Creating zip at: $zipPath\n";

    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        die("Cannot create zip file\n");
    }

    $filePath = __DIR__ . '/' . $doc['ruta_archivo'];
    if (file_exists($filePath)) {
        echo "Adding file: $filePath\n";
        $folder = $doc['numeral'] . " - " . substr(preg_replace('/[^a-zA-Z0-9]/', '_', $doc['requisito']), 0, 50);
        $zip->addFile($filePath, $folder . '/' . $doc['nombre_archivo']);
        echo "File added to zip as: " . $folder . '/' . $doc['nombre_archivo'] . "\n";
    } else {
        echo "File NOT found: $filePath\n";
    }

    $zip->close();
    
    if (file_exists($zipPath)) {
        echo "Zip created successfully. Size: " . filesize($zipPath) . " bytes\n";
        // unlink($zipPath);
    } else {
        echo "Zip file was NOT created.\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>