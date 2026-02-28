<?php
include_once __DIR__ . '/../config/db.php';

try {
    // 1. Create Role 'ventas'
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
    $stmt->execute(['ventas']);
    $role = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$role) {
        $stmt = $conn->prepare("INSERT INTO roles (nombre) VALUES (?)");
        $stmt->execute(['ventas']);
        $roleId = $conn->lastInsertId();
        echo "Role 'ventas' created (ID: $roleId).\n";
    } else {
        $roleId = $role['id'];
        echo "Role 'ventas' already exists (ID: $roleId).\n";
    }

    // 2. Create User 'vendedor'
    $stmt = $conn->prepare("SELECT id FROM usuarios WHERE usuario = ?");
    $stmt->execute(['vendedor']);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        $password = password_hash('123456', PASSWORD_DEFAULT);
        // Assuming 'estado' column might not exist or defaults to Active, checking schema first is better but let's try standard fields
        // Checking if 'estado' exists in usuarios table would be safer, but previous errors suggest schema issues.
        // Let's try inserting without 'estado' if it's not there, or check column.
        
        // Simpler: Just insert without 'estado' first, usually defaults handle it or it's not there.
        // But wait, the error says "Unknown column 'estado'". So it definitely doesn't exist.
        $stmt = $conn->prepare("INSERT INTO usuarios (usuario, password, rol_id) VALUES (?, ?, ?)");
        $stmt->execute(['vendedor', $password, $roleId]);
        echo "User 'vendedor' created with password '123456'.\n";
    } else {
        echo "User 'vendedor' already exists.\n";
    }

    // 3. Assign Modules to 'ventas'
    // Common modules for a salesperson
    $modulesToAssign = [
        'dashboard', 
        'facturacion', 
        'facturacion_electronica',
        'registro_ventas', 
        'clientes_proveedores', 
        'caja', 
        'cobranzas'
    ];
    
    foreach ($modulesToAssign as $modCode) {
        $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
        $stmt->execute([$modCode]);
        $mod = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($mod) {
            $modId = $mod['id'];
            // Check assignment
            $stmtCheck = $conn->prepare("SELECT * FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
            $stmtCheck->execute([$roleId, $modId]);
            if ($stmtCheck->rowCount() == 0) {
                $stmtInsert = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)");
                $stmtInsert->execute([$roleId, $modId]);
                echo "Module '$modCode' assigned to 'ventas'.\n";
            } else {
                 echo "Module '$modCode' already assigned.\n";
            }
        } else {
            echo "Module '$modCode' not found in DB.\n";
        }
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
