<?php
require_once __DIR__ . '/../config/db.php';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // 1. Add 'literal' column to iso_checklist_subitems if not exists
    $columns = $conn->query("SHOW COLUMNS FROM iso_checklist_subitems LIKE 'literal'")->fetchAll();
    if (count($columns) == 0) {
        $sql = "ALTER TABLE iso_checklist_subitems ADD COLUMN literal VARCHAR(50) AFTER item_id";
        $conn->exec($sql);
        echo "Columna 'literal' agregada a iso_checklist_subitems.\n";
    } else {
        echo "Columna 'literal' ya existe en iso_checklist_subitems.\n";
    }

    // 2. Create iso_subitem_evaluaciones (Annual Grid)
    // Replaces the monthly one. We can drop the old one or just ignore it.
    // Let's drop the old one to be clean if it's empty or we don't care about previous test data.
    // $conn->exec("DROP TABLE IF EXISTS iso_evaluaciones_subitems"); 

    $sql = "CREATE TABLE IF NOT EXISTS iso_subitem_evaluaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subitem_id INT NOT NULL,
        empresa_id INT NOT NULL,
        anio INT NOT NULL,
        hallazgos TEXT,
        estado ENUM('Pendiente', 'En Proceso', 'Ejecutado', 'Retrasado') DEFAULT 'Pendiente',
        
        ene_p TINYINT(1) DEFAULT 0, ene_e TINYINT(1) DEFAULT 0,
        feb_p TINYINT(1) DEFAULT 0, feb_e TINYINT(1) DEFAULT 0,
        mar_p TINYINT(1) DEFAULT 0, mar_e TINYINT(1) DEFAULT 0,
        abr_p TINYINT(1) DEFAULT 0, abr_e TINYINT(1) DEFAULT 0,
        may_p TINYINT(1) DEFAULT 0, may_e TINYINT(1) DEFAULT 0,
        jun_p TINYINT(1) DEFAULT 0, jun_e TINYINT(1) DEFAULT 0,
        jul_p TINYINT(1) DEFAULT 0, jul_e TINYINT(1) DEFAULT 0,
        ago_p TINYINT(1) DEFAULT 0, ago_e TINYINT(1) DEFAULT 0,
        sep_p TINYINT(1) DEFAULT 0, sep_e TINYINT(1) DEFAULT 0,
        oct_p TINYINT(1) DEFAULT 0, oct_e TINYINT(1) DEFAULT 0,
        nov_p TINYINT(1) DEFAULT 0, nov_e TINYINT(1) DEFAULT 0,
        dic_p TINYINT(1) DEFAULT 0, dic_e TINYINT(1) DEFAULT 0,

        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_eval_anio (subitem_id, empresa_id, anio),
        FOREIGN KEY (subitem_id) REFERENCES iso_checklist_subitems(id) ON DELETE CASCADE,
        FOREIGN KEY (empresa_id) REFERENCES iso_empresas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $conn->exec($sql);
    echo "Tabla 'iso_subitem_evaluaciones' creada o verificada.\n";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
