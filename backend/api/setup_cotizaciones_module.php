<?php
require_once '../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Crear tabla cotizaciones
    $sql = "CREATE TABLE IF NOT EXISTS cotizaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        serie VARCHAR(10) NOT NULL DEFAULT 'COT',
        correlativo INT NOT NULL,
        fecha_emision DATE NOT NULL,
        fecha_vencimiento DATE,
        cliente_tipo_doc VARCHAR(20),
        cliente_num_doc VARCHAR(20),
        cliente_razon_social VARCHAR(255),
        cliente_direccion TEXT,
        cliente_email VARCHAR(100),
        moneda VARCHAR(3) DEFAULT 'PEN',
        total_gravada DECIMAL(10,2) DEFAULT 0.00,
        total_exonerada DECIMAL(10,2) DEFAULT 0.00,
        total_inafecta DECIMAL(10,2) DEFAULT 0.00,
        total_igv DECIMAL(10,2) DEFAULT 0.00,
        total_importe DECIMAL(10,2) DEFAULT 0.00,
        estado ENUM('Borrador', 'Enviada', 'Aprobada', 'Rechazada', 'Convertida') DEFAULT 'Borrador',
        observaciones TEXT,
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES usuarios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'cotizaciones' creada o verificada.\n";

    // 2. Crear tabla cotizaciones_detalles
    $sqlDetalle = "CREATE TABLE IF NOT EXISTS cotizaciones_detalles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cotizacion_id INT NOT NULL,
        item_codigo VARCHAR(50),
        descripcion TEXT NOT NULL,
        unidad_medida VARCHAR(20) DEFAULT 'NIU',
        cantidad DECIMAL(10,2) NOT NULL,
        valor_unitario DECIMAL(10,2) NOT NULL,
        precio_unitario DECIMAL(10,2) NOT NULL,
        descuento DECIMAL(10,2) DEFAULT 0.00,
        valor_venta DECIMAL(10,2) NOT NULL,
        igv DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sqlDetalle);
    echo "Tabla 'cotizaciones_detalles' creada o verificada.\n";

    // 3. Registrar módulo 'cotizaciones'
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute(['cotizaciones']);
    $modulo = $stmt->fetch();

    if (!$modulo) {
        $stmt = $conn->prepare("INSERT INTO modulos (codigo, nombre, ruta) VALUES (?, ?, ?)");
        $stmt->execute(['cotizaciones', 'Cotizaciones', '/cotizaciones']);
        $moduloId = $conn->lastInsertId();
        echo "Módulo 'cotizaciones' registrado.\n";
    } else {
        $moduloId = $modulo['id'];
        echo "Módulo 'cotizaciones' ya existe.\n";
    }

    // 4. Asignar módulo al rol 'ventas'
    // Buscar rol 'ventas'
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
    $stmt->execute(['ventas']);
    $rolVentas = $stmt->fetch();

    if ($rolVentas) {
        // Verificar si ya tiene el permiso
        $stmt = $conn->prepare("SELECT id FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
        $stmt->execute([$rolVentas['id'], $moduloId]);
        if (!$stmt->fetch()) {
            $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)");
            $stmt->execute([$rolVentas['id'], $moduloId]);
            echo "Módulo asignado al rol 'ventas'.\n";
        } else {
            echo "El rol 'ventas' ya tiene acceso al módulo.\n";
        }
    } else {
        echo "Rol 'ventas' no encontrado. Asegúrate de crearlo primero.\n";
    }

    $conn->commit();
    echo "Configuración de Cotizaciones completada con éxito.\n";

} catch (Exception $e) {
    $conn->rollBack();
    echo "Error: " . $e->getMessage() . "\n";
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
