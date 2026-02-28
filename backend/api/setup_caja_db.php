<?php
include_once __DIR__ . '/../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Crear tabla caja_sesiones
    $sql = "CREATE TABLE IF NOT EXISTS caja_sesiones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        fecha_apertura DATETIME NOT NULL,
        fecha_cierre DATETIME,
        monto_inicial DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        monto_final DECIMAL(12,2), -- El monto contado al cierre
        monto_sistema DECIMAL(12,2), -- El monto calculado por el sistema
        diferencia DECIMAL(12,2),
        estado ENUM('Abierta', 'Cerrada') DEFAULT 'Abierta',
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'caja_sesiones' verificada/creada.\n";

    // 2. Crear tabla caja_movimientos
    $sql = "CREATE TABLE IF NOT EXISTS caja_movimientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sesion_id INT NOT NULL,
        tipo ENUM('Ingreso', 'Egreso') NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        concepto VARCHAR(255) NOT NULL,
        referencia VARCHAR(100), -- Comprobante, recibo, etc.
        usuario_id INT NOT NULL, -- Quien registró el movimiento
        receptor VARCHAR(255),
        cuenta_contable VARCHAR(50),
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sesion_id) REFERENCES caja_sesiones(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'caja_movimientos' verificada/creada.\n";

    // 3. Gestionar Modulo y Roles
    $modulo_codigo = 'caja';
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = :codigo");
    $stmt->execute([':codigo' => $modulo_codigo]);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$modulo) {
        $sql = "INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES (:nombre, :codigo, :ruta, :icono, :descripcion)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':nombre' => 'Caja y Bancos',
            ':codigo' => $modulo_codigo,
            ':ruta' => '/caja',
            ':icono' => 'DollarSign',
            ':descripcion' => 'Gestión de caja chica, ingresos y egresos'
        ]);
        $modulo_id = $conn->lastInsertId();
        echo "Módulo 'Caja' creado con ID: $modulo_id.\n";
    } else {
        $modulo_id = $modulo['id'];
        echo "Módulo 'Caja' ya existe con ID: $modulo_id.\n";
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
            echo "Módulo 'Caja' asignado al rol contador.\n";
        } else {
            echo "El rol contador ya tiene el módulo 'Caja' asignado.\n";
        }
    } else {
        echo "Rol 'contador' no encontrado.\n";
    }

    // Asignar tambien a admin para pruebas
     $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'admin'");
    $stmt->execute();
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($rol) {
        $rol_id = $rol['id'];
        $stmt = $conn->prepare("SELECT rol_id FROM roles_modulos WHERE rol_id = :rol_id AND modulo_id = :modulo_id");
        $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
        if (!$stmt->fetch()) {
            $sql = "INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (:rol_id, :modulo_id, 1, 1, 1)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
        }
    }

    $conn->commit();
    echo "Configuración de Caja completada con éxito.";

} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    echo "Error: " . $e->getMessage();
}
?>
