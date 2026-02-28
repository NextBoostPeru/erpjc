<?php
include_once '../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Tabla: bancos_cuentas
    $sql = "CREATE TABLE IF NOT EXISTS bancos_cuentas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre_banco VARCHAR(100) NOT NULL,
        numero_cuenta VARCHAR(50) NOT NULL,
        tipo_cuenta ENUM('Corriente', 'Ahorros', 'Maestra', 'Detracciones') DEFAULT 'Corriente',
        moneda CHAR(3) DEFAULT 'PEN',
        saldo_actual DECIMAL(12,2) DEFAULT 0.00,
        cuenta_contable VARCHAR(20), -- Enlace al PCGE (ej. 1041)
        estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'bancos_cuentas' verificada.\n";

    // 2. Tabla: bancos_movimientos
    $sql = "CREATE TABLE IF NOT EXISTS bancos_movimientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cuenta_id INT NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        tipo ENUM('Ingreso', 'Egreso', 'Transferencia') NOT NULL,
        origen_destino VARCHAR(20) DEFAULT 'Ventanilla', -- Ventanilla, Web, Cajero, Cheque
        monto DECIMAL(12,2) NOT NULL,
        concepto VARCHAR(255) NOT NULL,
        referencia VARCHAR(100), -- Nro Operación
        entidad VARCHAR(150), -- Cliente o Proveedor
        estado ENUM('Pendiente', 'Conciliado', 'Anulado') DEFAULT 'Pendiente',
        usuario_id INT NOT NULL,
        FOREIGN KEY (cuenta_id) REFERENCES bancos_cuentas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'bancos_movimientos' verificada.\n";

    // 3. Tabla: bancos_cheques
    $sql = "CREATE TABLE IF NOT EXISTS bancos_cheques (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cuenta_id INT NOT NULL,
        numero_cheque VARCHAR(50) NOT NULL,
        beneficiario VARCHAR(150) NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        fecha_emision DATE NOT NULL,
        fecha_pago DATE, -- Cuando se cobra
        estado ENUM('Emitido', 'Cobrado', 'Anulado') DEFAULT 'Emitido',
        movimiento_id INT, -- Se vincula cuando se registra el egreso contable
        FOREIGN KEY (cuenta_id) REFERENCES bancos_cuentas(id) ON DELETE CASCADE,
        FOREIGN KEY (movimiento_id) REFERENCES bancos_movimientos(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'bancos_cheques' verificada.\n";

    // 4. Registro del Módulo
    $modulo_codigo = 'bancos';
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = :codigo");
    $stmt->execute([':codigo' => $modulo_codigo]);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $sql = "INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES (:nombre, :codigo, :ruta, :icono, :descripcion)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':nombre' => 'Bancos',
            ':codigo' => $modulo_codigo,
            ':ruta' => '/bancos',
            ':icono' => 'Landmark', // Icono Lucide 'Landmark' (Banco)
            ':descripcion' => 'Gestión de cuentas bancarias, transferencias y conciliación'
        ]);
        $modulo_id = $conn->lastInsertId();
        echo "Módulo 'Bancos' creado.\n";
    } else {
        $modulo_id = $modulo['id'];
        echo "Módulo 'Bancos' ya existe.\n";
    }

    // 5. Asignar permisos al rol 'contador'
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'contador'");
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
            echo "Permisos asignados al rol 'contador'.\n";
        }
    }
    
    // Asignar a admin también
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'admin'");
    $stmt->execute();
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($rol) {
        $rol_id = $rol['id'];
        $stmt = $conn->prepare("SELECT rol_id FROM roles_modulos WHERE rol_id = :rol_id AND modulo_id = :modulo_id");
        $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
        if (!$stmt->fetch()) {
            $conn->exec("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES ($rol_id, $modulo_id, 1, 1, 1)");
        }
    }

    $conn->commit();
    echo "Instalación de BD Bancos completada.\n";

} catch (Exception $e) {
    $conn->rollBack();
    echo "Error: " . $e->getMessage() . "\n";
}
