<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

$configPath = __DIR__ . '/../config/db.php';
if (!file_exists($configPath)) {
    die("Error: Config file not found at $configPath");
}

require_once $configPath;

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // 1. ISO Normas
    $conn->exec("CREATE TABLE IF NOT EXISTS iso_normas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Seed some norms if empty
    $stmt = $conn->query("SELECT COUNT(*) FROM iso_normas");
    if ($stmt->fetchColumn() == 0) {
        $conn->exec("INSERT INTO iso_normas (nombre, descripcion) VALUES 
            ('ISO 9001', 'Sistemas de Gestión de la Calidad'),
            ('ISO 14001', 'Sistemas de Gestión Ambiental'),
            ('ISO 45001', 'Sistemas de Gestión de Seguridad y Salud en el Trabajo'),
            ('ISO 37001', 'Sistemas de Gestión Antisoborno'),
            ('ISO 26000', 'Guía de Responsabilidad Social')
        ");
        echo "Normas seeded.\n";
    }

    // 2. ISO Empresas
    $conn->exec("CREATE TABLE IF NOT EXISTS iso_empresas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        ruc VARCHAR(20),
        logo VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // 3. ISO Empresas Normas
    $conn->exec("CREATE TABLE IF NOT EXISTS iso_empresas_normas (
        empresa_id INT NOT NULL,
        norma_id INT NOT NULL,
        PRIMARY KEY (empresa_id, norma_id),
        FOREIGN KEY (empresa_id) REFERENCES iso_empresas(id) ON DELETE CASCADE,
        FOREIGN KEY (norma_id) REFERENCES iso_normas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // 4. Update iso_checklist_items
    $cols = $conn->query("DESCRIBE iso_checklist_items")->fetchAll(PDO::FETCH_COLUMN);
    
    if (!in_array('norma_id', $cols)) {
        $conn->exec("ALTER TABLE iso_checklist_items ADD COLUMN norma_id INT AFTER id");
        echo "Added norma_id to iso_checklist_items.\n";
        
        $stmt = $conn->prepare("SELECT id FROM iso_normas WHERE nombre = ?");
        $stmt->execute(['ISO 26000']);
        $iso26000Id = $stmt->fetchColumn();
        
        if ($iso26000Id) {
            $conn->exec("UPDATE iso_checklist_items SET norma_id = $iso26000Id WHERE norma_id IS NULL");
            echo "Linked existing items to ISO 26000.\n";
        }
    }
    
    if (!in_array('numeral', $cols)) {
        $conn->exec("ALTER TABLE iso_checklist_items ADD COLUMN numeral VARCHAR(50) AFTER norma_id");
        echo "Added numeral to iso_checklist_items.\n";
    }

    // 5. ISO Tracking
    $conn->exec("CREATE TABLE IF NOT EXISTS iso_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id INT NOT NULL,
        norma_id INT NOT NULL,
        item_id INT NOT NULL,
        estado ENUM('Programado', 'En proceso', 'Ejecutado', 'Retrasado', 'No aplica') DEFAULT 'Programado',
        fecha_programada DATE,
        fecha_limite DATE,
        fecha_ejecucion DATE,
        observaciones_internas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tracking (empresa_id, norma_id, item_id),
        FOREIGN KEY (empresa_id) REFERENCES iso_empresas(id) ON DELETE CASCADE,
        FOREIGN KEY (norma_id) REFERENCES iso_normas(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES iso_checklist_items(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // 6. ISO Documentos
    $conn->exec("CREATE TABLE IF NOT EXISTS iso_documentos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tracking_id INT NOT NULL,
        nombre_archivo VARCHAR(255) NOT NULL,
        ruta_archivo VARCHAR(255) NOT NULL,
        tipo_archivo VARCHAR(50),
        usuario_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tracking_id) REFERENCES iso_tracking(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // 7. ISO Historial
    $conn->exec("CREATE TABLE IF NOT EXISTS iso_historial (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tracking_id INT NOT NULL,
        usuario_id INT,
        accion VARCHAR(50) NOT NULL, 
        detalle TEXT, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tracking_id) REFERENCES iso_tracking(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    echo "Migration completed successfully.\n";

} catch (PDOException $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
}
?>