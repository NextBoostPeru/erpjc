<?php
require_once __DIR__ . '/../config/db.php';

try {
    echo "Configuring Admin Role and Users Module...\n";

    // 1. Ensure Role 'admin' exists
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'admin'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $conn->exec("INSERT INTO roles (nombre, descripcion) VALUES ('admin', 'Administrador Total del Sistema')");
        echo "Role 'admin' created.\n";
    } else {
        echo "Role 'admin' already exists.\n";
    }
    
    // Get Admin Role ID
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'admin'");
    $stmt->execute();
    $admin_role = $stmt->fetch(PDO::FETCH_ASSOC);
    $admin_id = $admin_role['id'];

    // 2. Ensure Module 'usuarios' exists
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'usuarios'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $conn->exec("INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES ('Usuarios', 'usuarios', '/usuarios', 'Users', 'Gestión de usuarios y roles')");
        echo "Module 'usuarios' created.\n";
    } else {
        echo "Module 'usuarios' already exists.\n";
    }

    // Get Module ID
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'usuarios'");
    $stmt->execute();
    $module = $stmt->fetch(PDO::FETCH_ASSOC);
    $module_id = $module['id'];

    // 3. Assign Permissions
    $stmt = $conn->prepare("SELECT * FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
    $stmt->execute([$admin_id, $module_id]);
    if (!$stmt->fetch()) {
        $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (?, ?, 1, 1, 1)")
             ->execute([$admin_id, $module_id]);
        echo "Permissions assigned to admin for usuarios module.\n";
    } else {
        // Update to full permissions just in case
        $conn->prepare("UPDATE roles_modulos SET permiso_lectura=1, permiso_escritura=1, permiso_eliminacion=1 WHERE rol_id=? AND modulo_id=?")
             ->execute([$admin_id, $module_id]);
        echo "Permissions updated for admin.\n";
    }

    echo "Setup complete.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>