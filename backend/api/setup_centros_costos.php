<?php
require_once __DIR__ . '/../config/db.php';

try {
    // 1. Create centros_costos table
    $sql = "CREATE TABLE IF NOT EXISTS centros_costos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(20) NOT NULL UNIQUE,
        nombre VARCHAR(100) NOT NULL,
        tipo ENUM('Administrativo', 'Operativo', 'Ventas', 'Produccion', 'Financiero') NOT NULL DEFAULT 'Administrativo',
        presupuesto DECIMAL(15,2) DEFAULT 0.00,
        responsable VARCHAR(100),
        estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $conn->exec($sql);
    echo "Tabla 'centros_costos' creada o verificada correctamente.<br>";

    // 2. Register Module
    $moduleName = 'Centro de Costos';
    $moduleCode = 'centros_costos'; // Added code
    $moduleRoute = '/centros-costos';
    $moduleIcon = 'PieChart'; 

    // Check if module exists by code or name
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ? OR nombre = ?");
    $stmt->execute([$moduleCode, $moduleName]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES (?, ?, ?, ?)");
        $stmt->execute([$moduleName, $moduleCode, $moduleRoute, $moduleIcon]);
        $moduleId = $conn->lastInsertId();
        echo "Módulo 'Centro de Costos' registrado con ID: $moduleId<br>";
    } else {
        $moduleId = $existing['id'];
        // Update code if missing
        $stmt = $conn->prepare("UPDATE modulos SET codigo = ? WHERE id = ?");
        $stmt->execute([$moduleCode, $moduleId]);
        echo "Módulo 'Centro de Costos' actualizado (ID: $moduleId)<br>";
    }

    // 3. Assign to Roles (Admin and Contador)
    $rolesToAssign = ['admin', 'contador', 'contabilidad'];

    foreach ($rolesToAssign as $roleName) {
        // Get Role ID
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
        $stmt->execute([$roleName]);
        $roleId = $stmt->fetchColumn();

        if ($roleId) {
            // Check assignment
            $stmt = $conn->prepare("SELECT id FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
            $stmt->execute([$roleId, $moduleId]);
            
            if (!$stmt->fetchColumn()) {
                $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)");
                $stmt->execute([$roleId, $moduleId]);
                echo "Permiso asignado al rol '$roleName'<br>";
            } else {
                echo "El rol '$roleName' ya tiene permiso.<br>";
            }
        } else {
            echo "Rol '$roleName' no encontrado.<br>";
        }
    }

    echo "Configuración completada exitosamente.";

} catch (PDOException $e) {
    if (isset($conn)) $conn = null;
    die("Error en la configuración: " . $e->getMessage());
}
if (isset($conn)) $conn = null;
?>
