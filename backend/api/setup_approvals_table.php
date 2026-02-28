<?php
include_once '../config/db.php';

try {
    $sql = "CREATE TABLE IF NOT EXISTS aprobaciones_compras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo_solicitud VARCHAR(50) NOT NULL,
        referencia_id INT NOT NULL,
        descripcion TEXT,
        estado VARCHAR(20) DEFAULT 'pendiente',
        aprobado_por INT DEFAULT NULL,
        fecha_solicitud DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_respuesta DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )";
    
    $conn->exec($sql);
    echo "Table aprobaciones_compras created or already exists.";
    
} catch(PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>