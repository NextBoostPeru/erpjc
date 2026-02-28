<?php
include_once '../config/db.php';

try {
    // Add signature columns if they don't exist
    $sql = "SHOW COLUMNS FROM contratos LIKE 'firma_gerencia'";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    
    if ($stmt->rowCount() == 0) {
        $sql = "ALTER TABLE contratos 
                ADD COLUMN firma_gerencia DATETIME NULL,
                ADD COLUMN firma_colaborador DATETIME NULL,
                ADD COLUMN contenido_html LONGTEXT NULL";
        $conn->exec($sql);
        echo "Columnas de firma agregadas correctamente.\n";
    } else {
        echo "Las columnas de firma ya existen.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
