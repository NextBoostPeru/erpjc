<?php
require_once '../config/db.php';

try {
    // 1. Crear tabla Clientes
    $sql = "CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo_doc VARCHAR(20) NOT NULL, -- 1: DNI, 6: RUC
        num_doc VARCHAR(20) NOT NULL UNIQUE,
        razon_social VARCHAR(255) NOT NULL,
        direccion TEXT,
        telefono VARCHAR(50),
        email VARCHAR(100),
        clasificacion VARCHAR(50) DEFAULT 'Regular',
        condicion_pago VARCHAR(50) DEFAULT 'Contado',
        estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla clientes verificada.\n";

    // 2. Crear tabla Proveedores
    $sql = "CREATE TABLE IF NOT EXISTS proveedores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo_doc VARCHAR(20) NOT NULL, -- 1: DNI, 6: RUC
        num_doc VARCHAR(20) NOT NULL UNIQUE,
        razon_social VARCHAR(255) NOT NULL,
        direccion TEXT,
        telefono VARCHAR(50),
        email VARCHAR(100),
        clasificacion VARCHAR(50) DEFAULT 'Regular',
        condicion_pago VARCHAR(50) DEFAULT 'Contado',
        estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla proveedores verificada.\n";

    // 3. Crear tabla Proveedores Archivos
    $sql = "CREATE TABLE IF NOT EXISTS proveedores_archivos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        proveedor_id INT NOT NULL,
        nombre_archivo VARCHAR(255) NOT NULL,
        ruta_archivo VARCHAR(255) NOT NULL,
        tipo_archivo VARCHAR(50),
        fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla proveedores_archivos verificada.\n";

    // 4. Registrar módulo y permisos
    // Registrar módulo si no existe
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'clientes_proveedores'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES ('Clientes y Proveedores', 'clientes_proveedores', '/clientes-proveedores', 'users')");
        $stmt->execute();
        $modulo_id = $conn->lastInsertId();
        echo "Módulo registrado.\n";
    } else {
        $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'clientes_proveedores'");
        $stmt->execute();
        $modulo_id = $stmt->fetchColumn();
        echo "Módulo ya existía.\n";
    }

    // Asignar permisos al rol contador (id 2) y admin (id 1) y ventas (id 3 si existe)
    // Asumimos Admin=1, Contador=2. Verificamos roles.
    $roles = ['admin', 'contador', 'ventas'];
    foreach ($roles as $rolName) {
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = :nombre");
        $stmt->execute([':nombre' => $rolName]);
        $rolId = $stmt->fetchColumn();

        if ($rolId) {
            $stmt = $conn->prepare("SELECT rol_id FROM roles_modulos WHERE rol_id = :rid AND modulo_id = :mid");
            $stmt->execute([':rid' => $rolId, ':mid' => $modulo_id]);
            if (!$stmt->fetch()) {
                $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permite_lectura, permite_escritura, permite_eliminar) VALUES (:rid, :mid, 1, 1, 0)");
                $stmt->execute([':rid' => $rolId, ':mid' => $modulo_id]);
                echo "Permisos asignados a rol $rolName.\n";
            }
        }
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
