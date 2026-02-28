<?php
include_once __DIR__ . '/../config/db.php';

try {
    $conn->beginTransaction();

    // Check if receptor column exists
    $stmt = $conn->prepare("SHOW COLUMNS FROM caja_movimientos LIKE 'receptor'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $sql = "ALTER TABLE caja_movimientos ADD COLUMN receptor VARCHAR(255) NULL AFTER usuario_id";
        $conn->exec($sql);
        echo "Columna 'receptor' agregada a caja_movimientos.\n";
    } else {
        echo "Columna 'receptor' ya existe.\n";
    }

    // Check if cuenta_contable column exists
    $stmt = $conn->prepare("SHOW COLUMNS FROM caja_movimientos LIKE 'cuenta_contable'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $sql = "ALTER TABLE caja_movimientos ADD COLUMN cuenta_contable VARCHAR(50) NULL AFTER receptor";
        $conn->exec($sql);
        echo "Columna 'cuenta_contable' agregada a caja_movimientos.\n";
    } else {
        echo "Columna 'cuenta_contable' ya existe.\n";
    }

    $conn->commit();
    echo "Actualización de esquema completada.";

} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    echo "Error: " . $e->getMessage();
}
?>
