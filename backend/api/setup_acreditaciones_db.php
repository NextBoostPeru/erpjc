<?php
require_once __DIR__ . '/../config/db.php';

try {
    // $conn is already created in db.php
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $sql = "CREATE TABLE IF NOT EXISTS acreditaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        imagen_path VARCHAR(255) NOT NULL,
        estado ENUM('activo', 'inactivo') DEFAULT 'activo',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )";

    $conn->exec($sql);
    echo "Tabla 'acreditaciones' creada o verificada exitosamente.\n";

    // Create uploads directory if not exists
    $uploadDir = __DIR__ . '/uploads/acreditaciones';
    if (!file_exists($uploadDir)) {
        if (mkdir($uploadDir, 0777, true)) {
            echo "Directorio 'uploads/acreditaciones' creado exitosamente.\n";
        } else {
            echo "Error al crear el directorio 'uploads/acreditaciones'.\n";
        }
    } else {
        echo "Directorio 'uploads/acreditaciones' ya existe.\n";
    }

} catch (PDOException $e) {
    die("Error en la configuración de la base de datos: " . $e->getMessage());
}
?>
