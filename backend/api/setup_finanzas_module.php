<?php
require_once __DIR__ . '/../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Update/Verify 'centros_costo'
    echo "Updating 'centros_costo'...\n";
    
    // Check if columns exist
    $stmt = $conn->query("DESCRIBE centros_costo");
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    if (!in_array('tipo', $columns)) {
        $conn->exec("ALTER TABLE centros_costo ADD COLUMN tipo VARCHAR(50) DEFAULT 'Administrativo' AFTER nombre");
    }
    if (!in_array('presupuesto', $columns)) {
        $conn->exec("ALTER TABLE centros_costo ADD COLUMN presupuesto DECIMAL(10,2) DEFAULT 0.00 AFTER tipo");
    }
    if (!in_array('responsable', $columns)) {
        $conn->exec("ALTER TABLE centros_costo ADD COLUMN responsable VARCHAR(100) AFTER presupuesto");
    }
    if (!in_array('estado', $columns)) {
        $conn->exec("ALTER TABLE centros_costo ADD COLUMN estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo' AFTER responsable");
    }

    // 2. Create 'centros_costo_servicios'
    echo "Creating 'centros_costo_servicios'...\n";
    $sqlServicios = "CREATE TABLE IF NOT EXISTS centros_costo_servicios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        centro_costo_id INT NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id) ON DELETE CASCADE
    )";
    $conn->exec($sqlServicios);

    // 3. Create/Update 'movimientos_financieros'
    echo "Updating 'movimientos_financieros'...\n";
    $sqlMovimientos = "CREATE TABLE IF NOT EXISTS movimientos_financieros (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha DATE NOT NULL,
        tipo ENUM('Ingreso', 'Egreso') NOT NULL,
        centro_costo_id INT NOT NULL,
        servicio_id INT,
        monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
        responsable VARCHAR(100),
        periodo VARCHAR(20),
        descripcion TEXT,
        cliente_id INT NULL,
        cliente_nombre VARCHAR(255) NULL,
        comprobante_id INT NULL,
        comprobante_referencia VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id),
        FOREIGN KEY (servicio_id) REFERENCES centros_costo_servicios(id)
    )";
    $conn->exec($sqlMovimientos);

    // Check columns for movimientos_financieros
    $stmt = $conn->query("DESCRIBE movimientos_financieros");
    $columnsMov = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (!in_array('cliente_nombre', $columnsMov)) {
        $conn->exec("ALTER TABLE movimientos_financieros ADD COLUMN cliente_nombre VARCHAR(255) NULL AFTER cliente_id");
    }
    if (!in_array('comprobante_referencia', $columnsMov)) {
        $conn->exec("ALTER TABLE movimientos_financieros ADD COLUMN comprobante_referencia VARCHAR(100) NULL AFTER comprobante_id");
    }

    echo "Database setup completed successfully.\n";

} catch (Exception $e) {
    // $conn->rollBack();
    echo "Error: " . $e->getMessage() . "\n";
}
