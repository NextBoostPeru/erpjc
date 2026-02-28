<?php
require_once '../config/db.php';

try {
    $conn->exec("
        CREATE TABLE IF NOT EXISTS papeletas_servicio (
            id INT AUTO_INCREMENT PRIMARY KEY,
            colaborador_id INT NOT NULL,
            tipo ENUM('Atencion Medica', 'Permiso Con Goce', 'Permiso Sin Goce', 'Licencia Con Goce', 'Licencia Sin Goce') NOT NULL,
            motivo TEXT NULL,
            fecha_del DATE NOT NULL,
            fecha_al DATE NOT NULL,
            hora_salida TIME NULL,
            hora_retorno TIME NULL,
            lugar VARCHAR(255) NULL,
            observaciones TEXT NULL,
            estado ENUM('Pendiente', 'Aprobado', 'Rechazado') DEFAULT 'Pendiente',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by INT NULL,
            FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    echo "Tabla 'papeletas_servicio' creada o verificada correctamente.";

    // Register module if needed (optional, depending on how modulos are managed)
    // Check if modulo exists
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'papeletas'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $conn->exec("INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES ('Papeletas de Servicio', 'papeletas', '/papeletas', 'FileText')");
        echo "\nMódulo 'papeletas' registrado.";
    }

    // Grant permissions to Admin (rol_id = 1)
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'papeletas'");
    $stmt->execute();
    $moduloId = $stmt->fetchColumn();

    if ($moduloId) {
        // Grant to Admin (rol_id = 1)
        $stmt = $conn->prepare("SELECT id FROM roles_modulos WHERE rol_id = 1 AND modulo_id = ?");
        $stmt->execute([$moduloId]);
        if (!$stmt->fetch()) {
            $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (1, ?, 1, 1, 1)")->execute([$moduloId]);
            echo "\nPermisos asignados al rol Admin.";
        }

        // Grant to RRHH
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'rrhh' LIMIT 1");
        $stmt->execute();
        $rolRRHH = $stmt->fetchColumn();

        if ($rolRRHH) {
            $stmt = $conn->prepare("SELECT id FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
            $stmt->execute([$rolRRHH, $moduloId]);
            if (!$stmt->fetch()) {
                $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (?, ?, 1, 1, 1)")->execute([$rolRRHH, $moduloId]);
                echo "\nPermisos asignados al rol RRHH.";
            }
        }
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
