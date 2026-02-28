<?php
include_once '../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Crear tabla comprobantes_compra
    $sql = "CREATE TABLE IF NOT EXISTS comprobantes_compra (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha_emision DATE NOT NULL,
        fecha_vencimiento DATE,
        tipo_comprobante CHAR(2) NOT NULL, -- 01: Factura, 03: Boleta, etc.
        serie VARCHAR(4) NOT NULL,
        numero VARCHAR(20) NOT NULL,
        
        -- Datos del Proveedor
        proveedor_tipo_doc CHAR(1) NOT NULL, -- 6: RUC
        proveedor_num_doc VARCHAR(15) NOT NULL,
        proveedor_razon_social VARCHAR(255) NOT NULL,
        
        -- Importes
        moneda CHAR(3) DEFAULT 'PEN',
        tipo_cambio DECIMAL(10,3) DEFAULT 1.000,
        
        base_imponible_gravada DECIMAL(12,2) DEFAULT 0.00,
        igv_gravado DECIMAL(12,2) DEFAULT 0.00,
        
        base_imponible_mixta DECIMAL(12,2) DEFAULT 0.00, -- Destinado a operaciones gravadas y no gravadas
        igv_mixto DECIMAL(12,2) DEFAULT 0.00,
        
        base_imponible_no_gravada DECIMAL(12,2) DEFAULT 0.00, -- Destinado a op. no gravadas
        igv_no_gravado DECIMAL(12,2) DEFAULT 0.00,
        
        valor_no_gravado DECIMAL(12,2) DEFAULT 0.00, -- Adquisiciones no gravadas
        isc DECIMAL(12,2) DEFAULT 0.00,
        icbper DECIMAL(12,2) DEFAULT 0.00,
        otros_tributos DECIMAL(12,2) DEFAULT 0.00,
        importe_total DECIMAL(12,2) NOT NULL,
        
        -- Detracciones
        tiene_detraccion TINYINT(1) DEFAULT 0,
        constancia_detraccion VARCHAR(30),
        fecha_detraccion DATE,
        monto_detraccion DECIMAL(12,2) DEFAULT 0.00,
        
        -- Retenciones / Percepciones
        monto_retencion DECIMAL(12,2) DEFAULT 0.00,
        
        -- Estado
        estado VARCHAR(20) DEFAULT 'Registrado', -- Registrado, Anulado
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $conn->exec($sql);
    echo "Tabla 'comprobantes_compra' verificada/creada.\n";

    // 2. Gestionar Modulo y Roles
    
    // a) Verificar/Crear Módulo en tabla 'modulos'
    $modulo_codigo = 'registro_compras';
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = :codigo");
    $stmt->execute([':codigo' => $modulo_codigo]);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$modulo) {
        $sql = "INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES (:nombre, :codigo, :ruta, :icono, :descripcion)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':nombre' => 'Registro de Compras',
            ':codigo' => $modulo_codigo,
            ':ruta' => '/registro-compras',
            ':icono' => 'ShoppingCart', // Usaremos ShoppingCart o similar
            ':descripcion' => 'Módulo para gestión de compras y gastos'
        ]);
        $modulo_id = $conn->lastInsertId();
        echo "Módulo 'Registro de Compras' creado con ID: $modulo_id.\n";
    } else {
        $modulo_id = $modulo['id'];
        echo "Módulo 'Registro de Compras' ya existe con ID: $modulo_id.\n";
    }

    // b) Asignar al rol 'contador'
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'contador'");
    $stmt->execute();
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($rol) {
        $rol_id = $rol['id'];
        
        // Verificar si ya tiene el modulo asignado en roles_modulos
        $stmt = $conn->prepare("SELECT rol_id FROM roles_modulos WHERE rol_id = :rol_id AND modulo_id = :modulo_id");
        $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
        
        if (!$stmt->fetch()) {
            $sql = "INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (:rol_id, :modulo_id, 1, 1, 1)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
            echo "Módulo 'Registro de Compras' asignado al rol contador.\n";
        } else {
            echo "El rol contador ya tiene el módulo 'Registro de Compras' asignado.\n";
        }
    } else {
        echo "Rol 'contador' no encontrado.\n";
    }

    $conn->commit();
    echo "Configuración de Base de Datos completada con éxito.";

} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    echo "Error: " . $e->getMessage();
}
?>