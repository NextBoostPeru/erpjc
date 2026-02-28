<?php
require_once '../config/db.php';

try {
    // Tabla impuestos_tributos
    $sql = "CREATE TABLE IF NOT EXISTS impuestos_tributos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        periodo VARCHAR(20) NOT NULL, -- e.g. '2024-01'
        fecha_vencimiento DATE NOT NULL,
        monto DECIMAL(10,2) DEFAULT 0.00,
        estado VARCHAR(20) DEFAULT 'Pendiente', -- Pendiente, Pagado, Vencido
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $conn->exec($sql);
    echo "Tabla 'impuestos_tributos' creada o verificada correctamente.\n";

    // Insertar datos de prueba si está vacía
    $stmt = $conn->query("SELECT COUNT(*) FROM impuestos_tributos");
    if ($stmt->fetchColumn() == 0) {
        $sqlInsert = "INSERT INTO impuestos_tributos (nombre, periodo, fecha_vencimiento, monto, estado) VALUES 
            ('IGV - Régimen General', '2024-01', DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY), 1500.00, 'Pendiente'),
            ('Impuesto a la Renta', '2024-01', DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY), 450.00, 'Pendiente'),
            ('ESSALUD', '2024-01', DATE_ADD(CURRENT_DATE, INTERVAL 10 DAY), 320.00, 'Pendiente')";
        $conn->exec($sqlInsert);
        echo "Datos de prueba insertados en 'impuestos_tributos'.\n";
    }

} catch (PDOException $e) {
    if (isset($conn)) $conn = null;
    die("Error en setup_impuestos_tributos_db.php: " . $e->getMessage());
}
if (isset($conn)) $conn = null;
?>