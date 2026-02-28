<?php
include_once 'config/db.php';

try {
    // Agregar telefono
    $sql = "ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(50) DEFAULT NULL";
    $conn->exec($sql);
    echo "Columna 'telefono' agregada.\n";
} catch (PDOException $e) {
    echo "Error agregando telefono (puede que ya exista): " . $e->getMessage() . "\n";
}

try {
    // Agregar nombre_real (para mostrar nombre bonito en vez del username)
    $sql = "ALTER TABLE usuarios ADD COLUMN nombre_real VARCHAR(100) DEFAULT NULL";
    $conn->exec($sql);
    echo "Columna 'nombre_real' agregada.\n";
} catch (PDOException $e) {
    echo "Error agregando nombre_real (puede que ya exista): " . $e->getMessage() . "\n";
}
?>