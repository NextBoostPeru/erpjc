<?php
require_once __DIR__ . '/../config/db.php';

try {
    // Add columns to planilla_detalles
    $stmt = $conn->query("DESCRIBE planilla_detalles");
    $cols = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    if (!in_array('asignacion_familiar_monto', $cols)) {
        $conn->exec("ALTER TABLE planilla_detalles ADD COLUMN asignacion_familiar_monto DECIMAL(10,2) DEFAULT 0 AFTER sueldo_base");
        echo "Added asignacion_familiar_monto\n";
    }
    
    if (!in_array('quinta_categoria_monto', $cols)) {
        $conn->exec("ALTER TABLE planilla_detalles ADD COLUMN quinta_categoria_monto DECIMAL(10,2) DEFAULT 0 AFTER afp_onp_monto");
        echo "Added quinta_categoria_monto\n";
    }
    
    echo "Migration completed.\n";
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>