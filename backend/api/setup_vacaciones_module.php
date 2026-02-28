<?php
include_once __DIR__ . '/../config/db.php';

try {
    // 1. Create Module if not exists
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'vacaciones_permisos'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $conn->exec("INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES ('Vacaciones y Permisos', 'vacaciones_permisos', '/vacaciones', 'palmtree')");
        echo "Modulo 'vacaciones_permisos' creado.<br>";
    }

    // 2. Assign to RRHH role (assuming RRHH role exists)
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'RRHH'");
    $stmt->execute();
    $role = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($role) {
        $roleId = $role['id'];
        $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'vacaciones_permisos'");
        $stmt->execute();
        $mod = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($mod) {
            $modId = $mod['id'];
            $check = $conn->prepare("SELECT id FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
            $check->execute([$roleId, $modId]);
            if (!$check->fetch()) {
                $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)")->execute([$roleId, $modId]);
                echo "Modulo asignado al rol RRHH.<br>";
            }
        }
    }

    // 3. Create table 'solicitudes_permisos'
    $sql = "CREATE TABLE IF NOT EXISTS solicitudes_permisos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        tipo ENUM('Vacaciones', 'Licencia con goce', 'Licencia sin goce', 'Descanso medico', 'Subsidio') NOT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        dias INT NOT NULL,
        motivo TEXT,
        estado ENUM('Pendiente', 'Aprobado', 'Rechazado') DEFAULT 'Pendiente',
        aprobado_por INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
        FOREIGN KEY (aprobado_por) REFERENCES usuarios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $conn->exec($sql);
    echo "Tabla 'solicitudes_permisos' creada/verificada.<br>";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>