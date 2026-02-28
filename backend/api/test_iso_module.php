<?php
// backend/api/test_iso_module.php

require_once '../config/db.php';

echo "--- STARTING ISO MODULE TEST ---\n";

try {
    $conn->beginTransaction();

    // 1. Create Test Empresa
    echo "1. Creating Test Empresa... ";
    $stmt = $conn->prepare("INSERT INTO iso_empresas (nombre, ruc) VALUES (?, ?)");
    $stmt->execute(['Empresa Test ISO', '20100100100']);
    $empresaId = $conn->lastInsertId();
    echo "OK (ID: $empresaId)\n";

    // 2. Verify Normas Seeded
    echo "2. Verifying Normas... ";
    $stmt = $conn->query("SELECT COUNT(*) FROM iso_normas");
    $count = $stmt->fetchColumn();
    if ($count == 0) throw new Exception("No normas found in iso_normas table.");
    echo "OK ($count normas found)\n";
    
    // Get ISO 9001 ID
    $stmt = $conn->prepare("SELECT id FROM iso_normas WHERE codigo = 'ISO 9001'");
    $stmt->execute();
    $normaId = $stmt->fetchColumn();
    if (!$normaId) throw new Exception("ISO 9001 not found.");

    // 3. Create Tracking (Simulate 'iniciar' implementation)
    echo "3. Creating Tracking... ";
    
    // Need a checklist item first.
    // Check if checklist items exist for this norma
    $stmt = $conn->prepare("SELECT id FROM iso_checklist_items WHERE norma_id = ? LIMIT 1");
    $stmt->execute([$normaId]);
    $itemId = $stmt->fetchColumn();
    
    if (!$itemId) {
        throw new Exception("No checklist items found for ISO 9001. Please run seeder.");
    }

    // Insert tracking record for this item
    $stmt = $conn->prepare("INSERT INTO iso_tracking (empresa_id, norma_id, item_id, estado, fecha_programada) VALUES (?, ?, ?, 'Programado', NOW())");
    $stmt->execute([$empresaId, $normaId, $itemId]);
    $trackingId = $conn->lastInsertId();
    echo "OK (ID: $trackingId)\n";

    // 4. Update Status (Simulate execution)
    echo "4. Updating Status... ";
    $newStatus = 'En proceso';
    $stmt = $conn->prepare("UPDATE iso_tracking SET estado = ? WHERE id = ?");
    $stmt->execute([$newStatus, $trackingId]);
    echo "OK\n";

    // 5. Simulate Document Upload
    echo "5. Simulating Document Upload... ";
    $stmt = $conn->prepare("INSERT INTO iso_documentos (tracking_id, nombre_archivo, ruta_archivo) VALUES (?, 'test.pdf', '/uploads/test.pdf')");
    $stmt->execute([$trackingId]);
    echo "OK\n";

    // 6. Test Cascade Delete (Cleanup)
    echo "6. Testing Cascade Delete (Delete Empresa)... ";
    $stmt = $conn->prepare("DELETE FROM iso_empresas WHERE id = ?");
    $stmt->execute([$empresaId]);
    
    // Verify tracking is gone
    $stmt = $conn->prepare("SELECT COUNT(*) FROM iso_tracking WHERE id = ?");
    $stmt->execute([$trackingId]);
    if ($stmt->fetchColumn() > 0) throw new Exception("Cascade delete failed: Tracking record still exists.");
    
    echo "OK\n";

    $conn->commit();
    echo "--- TEST COMPLETED SUCCESSFULLY ---\n";

} catch (Exception $e) {
    $conn->rollBack();
    echo "\nERROR: " . $e->getMessage() . "\n";
    exit(1);
}
?>