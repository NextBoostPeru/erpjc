<?php
include_once __DIR__ . '/../config/db.php';

try {
    // 1. Create 'crm_leads' table
    $sql = "CREATE TABLE IF NOT EXISTS crm_leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        email VARCHAR(100),
        telefono VARCHAR(20),
        empresa VARCHAR(150),
        mensaje TEXT,
        origen VARCHAR(50) DEFAULT 'Manual',
        estado ENUM('Nuevo', 'Contactado', 'Interesado', 'Cliente', 'Perdido') DEFAULT 'Nuevo',
        assigned_to INT,
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $conn->exec($sql);
    echo "Table 'crm_leads' created or already exists.\n";

    // 2. Register module 'crm'
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute(['crm']);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $stmt = $conn->prepare("INSERT INTO modulos (codigo, nombre, ruta) VALUES (?, ?, ?)");
        $stmt->execute(['crm', 'CRM Leads', '/crm']);
        $moduloId = $conn->lastInsertId();
        echo "Module 'crm' created.\n";
    } else {
        $moduloId = $modulo['id'];
        echo "Module 'crm' already exists.\n";
    }

    // 3. Assign module to 'ventas' role
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
    $stmt->execute(['ventas']);
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($rol) {
        $rolId = $rol['id'];
        
        $stmt = $conn->prepare("SELECT * FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
        $stmt->execute([$rolId, $moduloId]);
        
        if ($stmt->rowCount() == 0) {
            $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)");
            $stmt->execute([$rolId, $moduloId]);
            echo "Module assigned to 'ventas' role.\n";
        } else {
            echo "Module already assigned to 'ventas' role.\n";
        }
    } else {
        echo "Role 'ventas' not found.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
