<?php
require_once '../config/db.php';

try {
    // Add cargo and area columns to contratos table if they don't exist
    $columns = [
        'cargo' => "VARCHAR(255) NULL AFTER salario",
        'area' => "VARCHAR(255) NULL AFTER cargo"
    ];

    foreach ($columns as $column => $definition) {
        try {
            $check = $conn->query("SHOW COLUMNS FROM contratos LIKE '$column'");
            if ($check->rowCount() == 0) {
                $sql = "ALTER TABLE contratos ADD COLUMN $column $definition";
                $conn->exec($sql);
                echo "Columna '$column' agregada correctamente.\n";
            } else {
                echo "Columna '$column' ya existe.\n";
            }
        } catch (PDOException $e) {
            echo "Error al agregar columna '$column': " . $e->getMessage() . "\n";
        }
    }

} catch (Exception $e) {
    echo "Error general: " . $e->getMessage() . "\n";
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
