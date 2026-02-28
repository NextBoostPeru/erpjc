<?php
include_once __DIR__ . '/../config/db.php';

echo "Checking 'cobranzas' module in 'modulos' table...\n";
$stmt = $conn->query("SELECT * FROM modulos WHERE codigo = 'cobranzas'");
$modulo = $stmt->fetch(PDO::FETCH_ASSOC);
if ($modulo) {
    echo "Module found: " . json_encode($modulo) . "\n";
} else {
    echo "Module NOT found.\n";
}

echo "Checking 'cobranzas_pagos' table...\n";
try {
    $stmt = $conn->query("DESCRIBE cobranzas_pagos");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Table found. Columns:\n";
    foreach ($columns as $col) {
        echo "- " . $col['Field'] . " (" . $col['Type'] . ")\n";
    }
} catch (Exception $e) {
    echo "Table NOT found or error: " . $e->getMessage() . "\n";
}
?>
