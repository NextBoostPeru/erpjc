<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
require_once __DIR__ . '/../config/db.php';

try {
    // Tabla para almacenar el detalle de las cuotas de facturas al crédito
    $sql = "CREATE TABLE IF NOT EXISTS comprobantes_cuotas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        comprobante_id INT NOT NULL,
        cuota_nro INT NOT NULL,
        fecha_pago DATE NOT NULL,
        monto DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (comprobante_id) REFERENCES comprobantes_electronicos(id) ON DELETE CASCADE
    )";
    $conn->exec($sql);
    echo "Tabla 'comprobantes_cuotas' creada o verificada correctamente.\n";
} catch (PDOException $e) {
    echo "Error creando tabla: " . $e->getMessage() . "\n";
}
?>