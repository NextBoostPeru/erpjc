<?php
include_once __DIR__ . '/../config/db.php';

try {
    // 1. Create table documentos_laborales
    $conn->exec("CREATE TABLE IF NOT EXISTS documentos_laborales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        tipo_documento ENUM('Contrato', 'Boleta', 'DNI', 'Certificado', 'Otro') NOT NULL,
        nombre_archivo VARCHAR(255) NOT NULL,
        ruta_archivo VARCHAR(255) NOT NULL,
        fecha_carga DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_vencimiento DATE NULL,
        comentario TEXT,
        estado ENUM('Vigente', 'Vencido', 'Archivado') DEFAULT 'Vigente',
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    )");

    echo "Table 'documentos_laborales' created.\n";

    // 2. Register Module and Assign to RRHH
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute(['documentacion']);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, descripcion, ruta) VALUES (?, ?, ?, ?)");
        $stmt->execute(['Documentación Laboral', 'documentacion', 'Legajo digital del colaborador', '/documentacion']);
        $modulo_id = $conn->lastInsertId();
        echo "Module 'Documentación' created.\n";
    } else {
        $modulo_id = $modulo['id'];
        // Update ruta just in case
        $conn->exec("UPDATE modulos SET ruta = '/documentacion' WHERE id = $modulo_id");
    }

    // Assign to 'rrhh' role
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
    $stmt->execute(['rrhh']);
    $role = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($role) {
        $role_id = $role['id'];
        $stmt = $conn->prepare("SELECT * FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
        $stmt->execute([$role_id, $modulo_id]);
        if ($stmt->rowCount() == 0) {
            $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)");
            $stmt->execute([$role_id, $modulo_id]);
            echo "Module assigned to RRHH.\n";
        } else {
            echo "Module already assigned to RRHH.\n";
        }
    }

    // Create uploads directory if not exists
    $uploadDir = __DIR__ . '/../uploads/documentos/';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
        echo "Upload directory created.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>