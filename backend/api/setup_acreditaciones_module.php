<?php
require_once __DIR__ . '/../config/db.php';

try {
    echo "Configuring Acreditaciones Module...\n";

    // 1. Ensure Module 'acreditaciones' exists
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'acreditaciones'");
    $stmt->execute();
    $module = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$module) {
        $conn->exec("INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES ('Logos Acreditaciones', 'acreditaciones', '/acreditaciones', 'Award', 'Gestión de logos de acreditaciones')");
        echo "Module 'acreditaciones' created.\n";
        $module_id = $conn->lastInsertId();
    } else {
        echo "Module 'acreditaciones' already exists.\n";
        $module_id = $module['id'];
    }

    // 2. Roles to assign: admin (1), ventas (5), gerente (7)
    // We can also look them up by name to be safe
    $roles_to_assign = ['admin', 'ventas', 'gerente'];

    foreach ($roles_to_assign as $role_name) {
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
        $stmt->execute([$role_name]);
        $role = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($role) {
            $role_id = $role['id'];
            
            // Check if permission exists
            $stmt = $conn->prepare("SELECT * FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
            $stmt->execute([$role_id, $module_id]);
            
            if (!$stmt->fetch()) {
                $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (?, ?, 1, 1, 1)")
                     ->execute([$role_id, $module_id]);
                echo "Permissions assigned to '$role_name'.\n";
            } else {
                echo "Permissions already exist for '$role_name'.\n";
            }
        } else {
            echo "Warning: Role '$role_name' not found.\n";
        }
    }

    echo "Setup complete.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
