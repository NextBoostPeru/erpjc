<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once __DIR__ . '/../config/db.php';

try {
    // $conn is created in db.php
    
    // Table: notificaciones
    $sql = "CREATE TABLE IF NOT EXISTS notificaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NULL,
        rol_id INT NULL,
        titulo VARCHAR(100) NOT NULL,
        mensaje TEXT NOT NULL,
        tipo VARCHAR(20) DEFAULT 'info',
        enlace VARCHAR(255) NULL,
        leido TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    $conn->exec($sql);

    echo json_encode(["message" => "Tabla notificaciones creada o verificada correctamente."]);

} catch(PDOException $e) {
    echo json_encode(["error" => $e->getMessage()]);
}
?>
