<?php
require_once __DIR__ . '/../config/db.php';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // 1. ISO Checklist Subitems
    $sql = "CREATE TABLE IF NOT EXISTS iso_checklist_subitems (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_id INT NOT NULL,
        descripcion TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES iso_checklist_items(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'iso_checklist_subitems' creada o verificada.\n";

    // 2. ISO Evaluaciones Subitems (Mensual)
    // mes format: 'YYYY-MM'
    $sql = "CREATE TABLE IF NOT EXISTS iso_evaluaciones_subitems (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subitem_id INT NOT NULL,
        empresa_id INT NOT NULL,
        mes VARCHAR(7) NOT NULL, 
        estado ENUM('Cumple', 'No Cumple', 'En Proceso', 'No Aplica') DEFAULT 'En Proceso',
        observacion TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_eval (subitem_id, empresa_id, mes),
        FOREIGN KEY (subitem_id) REFERENCES iso_checklist_subitems(id) ON DELETE CASCADE,
        FOREIGN KEY (empresa_id) REFERENCES iso_empresas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'iso_evaluaciones_subitems' creada o verificada.\n";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
