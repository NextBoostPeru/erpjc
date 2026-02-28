<?php
require_once 'config/db.php';

try {
    // Check if 'area' column exists in 'usuarios' table
    $stmt = $conn->query("SHOW COLUMNS FROM usuarios LIKE 'area'");
    $exists = $stmt->fetch();

    if (!$exists) {
        echo "Adding 'area' column to 'usuarios' table...\n";
        $conn->exec("ALTER TABLE usuarios ADD COLUMN area VARCHAR(100) DEFAULT NULL AFTER rol_id");
        echo "Column 'area' added successfully.\n";
    } else {
        echo "Column 'area' already exists.\n";
    }

    // Also check for 'nombre_real' and 'telefono' just in case they are missing and needed
    $stmt = $conn->query("SHOW COLUMNS FROM usuarios LIKE 'nombre_real'");
    if (!$stmt->fetch()) {
        echo "Adding 'nombre_real' column...\n";
        $conn->exec("ALTER TABLE usuarios ADD COLUMN nombre_real VARCHAR(255) DEFAULT NULL AFTER usuario");
    }

    $stmt = $conn->query("SHOW COLUMNS FROM usuarios LIKE 'telefono'");
    if (!$stmt->fetch()) {
        echo "Adding 'telefono' column...\n";
        $conn->exec("ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(50) DEFAULT NULL AFTER email");
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
