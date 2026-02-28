<?php
require_once __DIR__ . '/../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Registrar el módulo
    $stmt = $conn->prepare("INSERT INTO modulos (codigo, nombre, ruta, icono, descripcion) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), ruta=VALUES(ruta), icono=VALUES(icono), descripcion=VALUES(descripcion)");
    
    // Usaremos 'file-badge' como referencia para el icono en el frontend
    $stmt->execute([
        'certificados_constancias', 
        'Certificados y Constancias', 
        '/certificados-constancias', 
        'file-badge', 
        'Generación de Certificados de Trabajo y Constancias de Servicios'
    ]);

    $moduloId = $conn->lastInsertId();
    if ($moduloId == 0) {
        // Si ya existía, obtenemos su ID
        $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
        $stmt->execute(['certificados_constancias']);
        $moduloId = $stmt->fetchColumn();
    }

    // 2. Asignar permisos a roles
    // Obtenemos IDs de roles relevantes
    $roles = ['admin', 'gerencia', 'rrhh'];
    
    foreach ($roles as $rolNombre) {
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
        $stmt->execute([$rolNombre]);
        $rolId = $stmt->fetchColumn();

        if ($rolId) {
            $stmt = $conn->prepare("INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (?, ?, 1, 1, 1)");
            $stmt->execute([$rolId, $moduloId]);
        }
    }

    $conn->exec("
        CREATE TABLE IF NOT EXISTS certificados_historial (
            id INT AUTO_INCREMENT PRIMARY KEY,
            colaborador_id INT NOT NULL,
            tipo_documento ENUM('CT','CPS') NOT NULL,
            dirigido_a VARCHAR(255) NULL,
            cargo VARCHAR(150) NULL,
            fecha_inicio DATE NULL,
            fecha_fin DATE NULL,
            fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            pdf_url VARCHAR(255) NULL,
            contenido_html LONGTEXT NULL,
            emitido_por INT NULL,
            estado ENUM('Activo','Anulado') DEFAULT 'Activo',
            INDEX idx_colaborador (colaborador_id),
            FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    $uploadDir = __DIR__ . '/uploads/certificados';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    $conn->commit();
    echo json_encode(['success' => true, 'message' => 'Módulo Certificados y Constancias instalado correctamente']);

} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
