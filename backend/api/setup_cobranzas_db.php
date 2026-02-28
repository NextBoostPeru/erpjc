<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
require_once '../config/db.php';

function addColumnIfNotExists($conn, $table, $column, $definition) {
    try {
        $stmt = $conn->prepare("SHOW COLUMNS FROM `$table` LIKE :column");
        $stmt->execute([':column' => $column]);
        if ($stmt->rowCount() == 0) {
            $sql = "ALTER TABLE `$table` ADD COLUMN `$column` $definition";
            $conn->exec($sql);
            echo "Columna '$column' agregada a tabla '$table'.\n";
        } else {
            echo "Columna '$column' ya existe en tabla '$table'.\n";
        }
    } catch (PDOException $e) {
        echo "Error al agregar columna '$column' a '$table': " . $e->getMessage() . "\n";
    }
}

// Agregar columna archivo_constancia a cobranzas_pagos
addColumnIfNotExists($conn, 'cobranzas_pagos', 'archivo_constancia', "VARCHAR(255) NULL");

echo "Configuración de base de datos para cobranzas completada.\n";
?>