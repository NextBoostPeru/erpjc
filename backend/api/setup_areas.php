<?php
require_once __DIR__ . '/../config/db.php';

try {
    // 1. Create table (DDL - causes implicit commit)
    $conn->exec("
        CREATE TABLE IF NOT EXISTS areas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL UNIQUE,
            activo BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // 2. Insert data (DML)
    $conn->beginTransaction();

    $areas = [
        'Administración',
        'Recursos Humanos',
        'Contabilidad',
        'Ventas',
        'Marketing',
        'Producción',
        'Logística',
        'Mantenimiento',
        'TI / Sistemas',
        'Gerencia General'
    ];

    $stmt = $conn->prepare("INSERT IGNORE INTO areas (nombre) VALUES (?)");
    foreach ($areas as $area) {
        $stmt->execute([$area]);
    }

    $conn->commit();
    echo json_encode(['success' => true, 'message' => 'Tabla areas creada y poblada']);
} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
