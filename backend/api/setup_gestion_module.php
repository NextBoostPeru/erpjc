<?php
require_once __DIR__ . '/../config/db.php';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 1. Table: gestion_asignaciones (Assign clients to users)
    $sql_asignaciones = "CREATE TABLE IF NOT EXISTS gestion_asignaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        cliente_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_assignment (usuario_id, cliente_id),
        INDEX idx_usuario (usuario_id),
        INDEX idx_cliente (cliente_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $conn->exec($sql_asignaciones);
    echo "Table 'gestion_asignaciones' created or exists.<br>";

    // 2. Table: gestion_coordinaciones (Record interactions)
    $sql_coordinaciones = "CREATE TABLE IF NOT EXISTS gestion_coordinaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        cliente_id INT NOT NULL,
        fecha DATETIME NOT NULL,
        tipo VARCHAR(50) NOT NULL, -- Llamada, Visita, Correo, Reunión, WhatsApp, Otros
        detalle TEXT,
        estado VARCHAR(20) DEFAULT 'Completado', -- Pendiente, Completado, Reprogramado
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_usuario_coord (usuario_id),
        INDEX idx_cliente_coord (cliente_id),
        INDEX idx_fecha (fecha)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    $conn->exec($sql_coordinaciones);
    echo "Table 'gestion_coordinaciones' created or exists.<br>";

    echo "Gestion module setup completed successfully.";

} catch(PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
