<?php
require_once __DIR__ . '/../config/db.php';

try {
    $conn->exec("
        CREATE TABLE IF NOT EXISTS ordenes_trabajo (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20) UNIQUE,
            titulo VARCHAR(200) NOT NULL,
            descripcion TEXT,
            fecha DATE NOT NULL,
            prioridad ENUM('Baja','Media','Alta','Urgente') DEFAULT 'Media',
            estado ENUM('Abierta','En proceso','Completada','Cancelada') DEFAULT 'Abierta',
            responsable_id INT NULL,
            area VARCHAR(100) NULL,
            inicio DATE NULL,
            fin DATE NULL,
            lugar_trabajo VARCHAR(200) NULL,
            solicitante_nombre VARCHAR(150) NULL,
            solicitante_dni VARCHAR(20) NULL,
            solicitante_cargo VARCHAR(100) NULL,
            costo_estimado DECIMAL(12,2) DEFAULT 0.00,
            costo_real DECIMAL(12,2) DEFAULT 0.00,
            usuario_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    $conn->exec("
        ALTER TABLE ordenes_trabajo
        ADD COLUMN IF NOT EXISTS lugar_trabajo VARCHAR(200) NULL,
        ADD COLUMN IF NOT EXISTS solicitante_nombre VARCHAR(150) NULL,
        ADD COLUMN IF NOT EXISTS solicitante_dni VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS solicitante_cargo VARCHAR(100) NULL;
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS ordenes_trabajo_tareas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            orden_id INT NOT NULL,
            descripcion TEXT NOT NULL,
            encargado_id INT NULL,
            fecha_limite DATE NULL,
            estado ENUM('Pendiente','En proceso','Hecha','Cancelada') DEFAULT 'Pendiente',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (orden_id) REFERENCES ordenes_trabajo(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute(['ordenes_trabajo']);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$modulo) {
        $stmt = $conn->prepare("INSERT INTO modulos (codigo, nombre, ruta) VALUES (?, ?, ?)");
        $stmt->execute(['ordenes_trabajo', 'Órdenes de Trabajo', '/ordenes-trabajo']);
        $moduloId = $conn->lastInsertId();
    } else {
        $moduloId = $modulo['id'];
    }

    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
    $stmt->execute(['gerencia']);
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($rol) {
        $stmt = $conn->prepare("SELECT id FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
        $stmt->execute([$rol['id'], $moduloId]);
        if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
            $stmt = $conn->prepare("
                INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                VALUES (?, ?, 1, 1, 1)
            ");
            $stmt->execute([$rol['id'], $moduloId]);
        }
    }

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
