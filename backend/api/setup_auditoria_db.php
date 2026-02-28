<?php
require_once __DIR__ . '/../config/db.php';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 1. Create bitacora_cambios table
    $sql = "CREATE TABLE IF NOT EXISTS bitacora_cambios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tabla_afectada VARCHAR(100) NOT NULL,
        registro_id INT,
        accion VARCHAR(50) NOT NULL,
        valor_anterior TEXT,
        valor_nuevo TEXT,
        usuario_id INT,
        detalles TEXT,
        fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )";
    $conn->exec($sql);
    echo "Tabla bitacora_cambios creada o ya existe.\n";

    // 2. Create historial_accesos table
    $sql = "CREATE TABLE IF NOT EXISTS historial_accesos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT,
        accion VARCHAR(50) NOT NULL, -- LOGIN, LOGOUT, LOGIN_FAILED
        ip_address VARCHAR(45),
        detalles VARCHAR(255),
        fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )";
    $conn->exec($sql);
    echo "Tabla historial_accesos creada o ya existe.\n";

    // 3. Register Module
    $nombre_modulo = "Auditoría y Control";
    $codigo_modulo = "AUDITORIA";
    $ruta_modulo = "/auditoria";
    $icono_modulo = "Shield"; // Lucide icon name

    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = :codigo");
    $stmt->execute([':codigo' => $codigo_modulo]);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES (:nombre, :codigo, :ruta, :icono)");
        $stmt->execute([
            ':nombre' => $nombre_modulo,
            ':codigo' => $codigo_modulo,
            ':ruta' => $ruta_modulo,
            ':icono' => $icono_modulo
        ]);
        $modulo_id = $conn->lastInsertId();
        echo "Módulo registrado: $nombre_modulo\n";
    } else {
        $modulo_id = $modulo['id'];
        echo "Módulo ya existe: $nombre_modulo\n";
    }

    // 4. Assign to Role 'contador'
    $rol_nombre = 'contador';
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = :nombre");
    $stmt->execute([':nombre' => $rol_nombre]);
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($rol) {
        $rol_id = $rol['id'];
        
        // Check if permission exists
        $stmt = $conn->prepare("SELECT rol_id FROM roles_modulos WHERE rol_id = :rol_id AND modulo_id = :modulo_id");
        $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
        
        if ($stmt->rowCount() == 0) {
            $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (:rol_id, :modulo_id, 1, 1, 1)");
            $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
            echo "Permisos asignados al rol '$rol_nombre'.\n";
        } else {
            echo "Permisos ya asignados al rol '$rol_nombre'.\n";
        }
    } else {
        echo "Rol '$rol_nombre' no encontrado.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
