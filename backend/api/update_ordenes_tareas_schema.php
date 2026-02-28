<?php
require_once __DIR__ . '/../config/db.php';

try {
    // Check if column exists
    $stmt = $conn->prepare("SHOW COLUMNS FROM ordenes_trabajo_tareas LIKE 'detalles'");
    $stmt->execute();
    $col = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$col) {
        $conn->exec("ALTER TABLE ordenes_trabajo_tareas ADD COLUMN detalles TEXT NULL AFTER descripcion");
        echo "Columna 'detalles' agregada exitosamente a la tabla 'ordenes_trabajo_tareas'.";
    } else {
        echo "La columna 'detalles' ya existe.";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
