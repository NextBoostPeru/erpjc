<?php
include_once __DIR__ . '/../config/db.php';

if (!isset($conn)) {
    die("Error: No se pudo conectar a la base de datos.");
}

function addColumnIfNotExists($conn, $table, $column, $definition) {
    try {
        // Check if column exists
        $stmt = $conn->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
        $stmt->execute([$table, $column]);
        if ($stmt->fetchColumn() == 0) {
            $sql = "ALTER TABLE $table ADD $column $definition";
            $conn->exec($sql);
            echo "Columna '$column' agregada a '$table'.\n";
        } else {
            echo "Columna '$column' ya existe en '$table'.\n";
        }
    } catch (PDOException $e) {
        echo "Error agregando columna '$column': " . $e->getMessage() . "\n";
    }
}

try {
    // 1. Modificar tabla comprobantes_compra
    echo "Verificando tabla 'comprobantes_compra'...\n";
    addColumnIfNotExists($conn, 'comprobantes_compra', 'saldo_pendiente', "DECIMAL(12,2) DEFAULT 0.00 AFTER importe_total");
    addColumnIfNotExists($conn, 'comprobantes_compra', 'estado_pago', "VARCHAR(20) DEFAULT 'Pendiente' AFTER estado");
    addColumnIfNotExists($conn, 'comprobantes_compra', 'condicion_pago', "VARCHAR(20) DEFAULT 'Contado' AFTER fecha_vencimiento"); // En caso no exista

    // Actualizar saldo_pendiente inicial si es 0 y el estado no es Pagado
    $conn->exec("UPDATE comprobantes_compra SET saldo_pendiente = importe_total WHERE saldo_pendiente = 0 AND estado != 'Anulado'");

    // 2. Crear tabla pagos_proveedores
    $sql = "CREATE TABLE IF NOT EXISTS pagos_proveedores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        compra_id INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        monto DECIMAL(12,2) NOT NULL,
        medio_pago VARCHAR(50) NOT NULL, -- Efectivo, Transferencia, Cheque
        referencia VARCHAR(100), -- Nro Operacion, Cheque, etc
        origen_id INT NULL, -- ID de Cuenta Bancaria o Caja (según corresponda, o manejar en lógica)
        observaciones TEXT,
        usuario_id INT,
        FOREIGN KEY (compra_id) REFERENCES comprobantes_compra(id) ON DELETE CASCADE
    )";
    $conn->exec($sql);
    echo "Tabla 'pagos_proveedores' verificada.\n";

    // 2.1 Agregar columnas para enlazar movimientos financieros
    addColumnIfNotExists($conn, 'pagos_proveedores', 'caja_movimiento_id', "INT NULL");
    addColumnIfNotExists($conn, 'pagos_proveedores', 'banco_movimiento_id', "INT NULL");
    
    // 2.2 Agregar columna para constancia de pago
    addColumnIfNotExists($conn, 'pagos_proveedores', 'archivo_constancia', "VARCHAR(255) NULL");

    echo "Setup Cuentas por Pagar finalizado.\n";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
