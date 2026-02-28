<?php
// backend/api/test_iso_reports.php

require_once '../config/db.php';

echo "--- STARTING ISO REPORTS TEST ---\n";

// We can't easily test PDF binary output in CLI without capturing buffer and checking headers,
// but we can check if the underlying logic works.
// However, `iso_pdf.php` expects GET parameters.
// We can simulate a request using local curl or just validating the classes.

// 1. Check Dompdf presence (usually via composer autoload or manual include)
// Since this project might not use Composer for Dompdf, let's check how it's included.
// We assume `iso_pdf.php` handles it.

// 2. Check ZipArchive for Bulk Download
echo "1. Checking ZipArchive extension... ";
if (class_exists('ZipArchive')) {
    echo "OK\n";
} else {
    echo "SKIPPED (ZipArchive not installed)\n";
}

// 3. Simulate Data Retrieval for Report
try {
    echo "2. Testing Report Data Query... ";
    // We need a valid tracking ID.
    $stmt = $conn->query("SELECT id FROM iso_tracking LIMIT 1");
    $trackingId = $stmt->fetchColumn();

    if ($trackingId) {
        // Run the query used in iso_pdf.php logic (simplified)
        $sql = "SELECT t.*, e.nombre as empresa, n.nombre as norma, n.codigo as norma_codigo
                FROM iso_tracking t
                JOIN iso_empresas e ON t.empresa_id = e.id
                JOIN iso_normas n ON t.norma_id = n.id
                WHERE t.id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$trackingId]);
        $data = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($data) {
            echo "OK (Found data for Tracking #$trackingId: {$data['empresa']} - {$data['norma_codigo']})\n";
        } else {
            echo "FAILED (Query returned empty)\n";
        }
    } else {
        echo "SKIPPED (No tracking data found)\n";
    }

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}

echo "--- TEST COMPLETED ---\n";
?>