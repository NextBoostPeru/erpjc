<?php
require_once '../config/db.php';
try {
    $stmt = $conn->query("SELECT * FROM iso_normas");
    $normas = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Normas count: " . count($normas) . "\n";
    print_r($normas);
    
    $stmt = $conn->query("DESCRIBE iso_tracking");
    echo "iso_tracking exists.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>