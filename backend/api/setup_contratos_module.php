<?php
require_once __DIR__ . '/../config/db.php';

try {
    echo "Setting up Contratos module...\n";

    // 1. Create Module
    $moduleName = 'gestion_contratos';
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute([$moduleName]);
    
    if ($stmt->rowCount() == 0) {
        $conn->prepare("INSERT INTO modulos (nombre, codigo, descripcion, created_at) VALUES ('Gestión de Contratos', ?, 'Administración de contratos laborales', NOW())")->execute([$moduleName]);
        echo "Module '$moduleName' created.\n";
    } else {
        echo "Module '$moduleName' already exists.\n";
    }
    
    $moduleId = $conn->query("SELECT id FROM modulos WHERE codigo = '$moduleName'")->fetchColumn();

    // 2. Assign to RRHH role
    $roleName = 'rrhh';
    $roleId = $conn->query("SELECT id FROM roles WHERE nombre = '$roleName'")->fetchColumn();

    if ($roleId) {
        $check = $conn->prepare("SELECT id FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
        $check->execute([$roleId, $moduleId]);
        if ($check->rowCount() == 0) {
            $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (?, ?, 1, 1, 1)")->execute([$roleId, $moduleId]);
            echo "Module assigned to '$roleName'.\n";
        } else {
            echo "Module already assigned to '$roleName'.\n";
        }
    } else {
        echo "Role '$roleName' not found.\n";
    }

    // 3. Create 'contratos' table
    $sql = "CREATE TABLE IF NOT EXISTS contratos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        tipo_contrato ENUM('Plazo Fijo', 'Indefinido', 'Prácticas', 'Locación de Servicios', 'Medio Tiempo', 'Obra o Servicio') NOT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NULL,
        salario DECIMAL(10, 2) NULL,
        archivo_url VARCHAR(255) NULL,
        estado ENUM('Vigente', 'Por Vencer', 'Vencido', 'Finalizado') DEFAULT 'Vigente',
        observaciones TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    $conn->exec($sql);
    echo "Table 'contratos' created/verified.\n";

    // 4. Create uploads directory
    $uploadDir = __DIR__ . '/../uploads/contratos';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
        echo "Upload directory created at $uploadDir\n";
    } else {
        echo "Upload directory exists.\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
