<?php
include_once '../config/db.php';

try {
    // 1. Add fecha_nacimiento to colaboradores
    $stmt = $conn->query("SHOW COLUMNS FROM colaboradores LIKE 'fecha_nacimiento'");
    if ($stmt->rowCount() == 0) {
        $conn->exec("ALTER TABLE colaboradores ADD COLUMN fecha_nacimiento DATE NULL AFTER apellidos");
        echo "Columna fecha_nacimiento agregada a colaboradores.\n";
    } else {
        echo "Columna fecha_nacimiento ya existe.\n";
    }

    // 2. Create emos table
    $sqlEmos = "CREATE TABLE IF NOT EXISTS emos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        fecha_examen DATE NOT NULL,
        fecha_vencimiento DATE NOT NULL,
        clinica VARCHAR(150) NULL,
        observaciones TEXT NULL,
        archivo VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    
    $conn->exec($sqlEmos);
    echo "Tabla emos creada o verificada.\n";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
