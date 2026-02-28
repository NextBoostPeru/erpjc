<?php
require_once '../config/db.php';

try {
    // 1. Get Module ID or Create
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'reportes_ventas'");
    $stmt->execute();
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $sql = "INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) 
                VALUES ('Reportes de Ventas', 'reportes_ventas', '/reportes-ventas', 'BarChart3', 'Reportes y estadísticas de ventas')";
        $conn->exec($sql);
        $modulo_id = $conn->lastInsertId();
        echo "Módulo 'reportes_ventas' creado.\n";
    } else {
        $modulo_id = $modulo['id'];
    }

    // 2. Get Role ID for 'ventas'
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'ventas'");
    $stmt->execute();
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($rol) {
        $rol_id = $rol['id'];
        // Assign Permissions
        $sql = "INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                VALUES (:rol_id, :modulo_id, 1, 0, 0)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
        echo "Permisos asignados al rol 'ventas'.\n";
    }

    // 3. Assign to 'admin' as well
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'admin'");
    $stmt->execute();
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    if($admin) {
            $sql = "INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                VALUES (:rol_id, :modulo_id, 1, 1, 1)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':rol_id' => $admin['id'], ':modulo_id' => $modulo_id]);
        echo "Permisos asignados al rol 'admin'.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
