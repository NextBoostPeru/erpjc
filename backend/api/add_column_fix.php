<?php
require_once __DIR__ . '/../config/db.php';

try {
    // Check if column exists first
    $stmt = $conn->prepare("SHOW COLUMNS FROM guias_remision LIKE 'conductor_nombre'");
    $stmt->execute();
    if ($stmt->fetch()) {
        echo "Column 'conductor_nombre' already exists.\n";
    } else {
        $conn->exec("ALTER TABLE guias_remision ADD COLUMN conductor_nombre VARCHAR(255) DEFAULT NULL AFTER conductor_licencia");
        echo "Column 'conductor_nombre' added successfully.\n";
    }
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
