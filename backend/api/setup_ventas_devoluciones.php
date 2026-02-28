<?php
require_once '../config/db.php';

try {
    // 1. Get Module ID
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'devoluciones'");
    $stmt->execute();
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($modulo) {
        $modulo_id = $modulo['id'];

        // 2. Get Role ID for 'ventas'
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'ventas'");
        $stmt->execute();
        $rol = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($rol) {
            $rol_id = $rol['id'];

            // 3. Assign Permissions
            $sql = "INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                    VALUES (:rol_id, :modulo_id, 1, 1, 0)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
            echo "Permisos de 'devoluciones' asignados al rol 'ventas'.\n";
        } else {
            echo "Rol 'ventas' no encontrado.\n";
            // Create role if not exists (optional, but good for robustness)
            $conn->exec("INSERT INTO roles (nombre, descripcion) VALUES ('ventas', 'Rol de Ventas')");
            $rol_id = $conn->lastInsertId();
            
            $sql = "INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                    VALUES (:rol_id, :modulo_id, 1, 1, 0)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
            echo "Rol 'ventas' creado y permisos asignados.\n";
        }
        
        // Also assign to admin
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'admin'");
        $stmt->execute();
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        if($admin) {
             $sql = "INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                    VALUES (:rol_id, :modulo_id, 1, 1, 1)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':rol_id' => $admin['id'], ':modulo_id' => $modulo_id]);
        }
        
    } else {
        echo "Módulo 'devoluciones' no encontrado.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
