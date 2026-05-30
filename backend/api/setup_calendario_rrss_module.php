<?php
include_once __DIR__ . '/../config/db.php';

function ensure_column_exists(PDO $conn, string $table, string $column): bool {
    try {
        $stmt = $conn->prepare("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1");
        $stmt->execute([$table, $column]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

try {
    $sql = "CREATE TABLE IF NOT EXISTS calendario_rrss (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tarea VARCHAR(500) NOT NULL,
        estado ENUM('pendiente','en_progreso','completada','cancelada') NOT NULL DEFAULT 'pendiente',
        prioridad ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media',
        encargado_id INT NULL,
        encargado_nombre VARCHAR(255) NULL,
        fecha DATE NOT NULL,
        tipo_proyecto VARCHAR(255) NULL,
        archivos TEXT NULL COMMENT 'JSON array of {nombre,ruta}',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    $conn->exec($sql);
    echo "Table 'calendario_rrss' created or exists.\n";

    // Register in 'modulos' table (used by menu system + RBAC)
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ? LIMIT 1");
    $stmt->execute(['calendario_rrss']);
    $moduloId = (int)($stmt->fetchColumn() ?: 0);

    if ($moduloId <= 0) {
        $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES (?, ?, ?, ?, ?)")
            ->execute(['Calendario RRSS', 'calendario_rrss', '/calendario-rrss', 'Calendar', 'Planificación de redes sociales']);
        $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ? LIMIT 1");
        $stmt->execute(['calendario_rrss']);
        $moduloId = (int)($stmt->fetchColumn() ?: 0);
        echo "Module 'calendario_rrss' created in 'modulos' table.\n";
    } else {
        echo "Module 'calendario_rrss' already exists in 'modulos' table.\n";
    }

    // Assign to admin roles (rol_id 1 = SuperAdmin, 7 = Admin)
    $adminRoles = [1, 7];
    foreach ($adminRoles as $rolId) {
        if ($moduloId > 0) {
            try {
                $stmt = $conn->prepare("SELECT 1 FROM roles_modulos WHERE rol_id = ? AND modulo_id = ? LIMIT 1");
                $stmt->execute([$rolId, $moduloId]);
                if (!$stmt->fetchColumn()) {
                    if (ensure_column_exists($conn, 'roles_modulos', 'permiso_crear')) {
                        $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_crear, permiso_editar, permiso_escritura, permiso_eliminacion) VALUES (?, ?, 1, 1, 1, 1, 1)")
                            ->execute([$rolId, $moduloId]);
                    } else {
                        $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (?, ?, 1, 1, 1)")
                            ->execute([$rolId, $moduloId]);
                    }
                    echo "Assigned module to role $rolId.\n";
                }
            } catch (Throwable $e) {
                echo "Warning assigning to role $rolId: " . $e->getMessage() . "\n";
            }
        }
    }

    echo "Setup complete.\n";
} catch (Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
$conn = null;
