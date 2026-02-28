<?php
require_once '../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Tables for Price Lists
    $sql = "CREATE TABLE IF NOT EXISTS listas_precios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        tipo ENUM('base', 'cliente', 'temporada') DEFAULT 'base',
        moneda VARCHAR(3) DEFAULT 'PEN',
        estado ENUM('activa', 'inactiva') DEFAULT 'activa',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )";
    $conn->exec($sql);
    echo "Tabla listas_precios verificada.\n";

    $sql = "CREATE TABLE IF NOT EXISTS listas_precios_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lista_id INT NOT NULL,
        producto_id INT NOT NULL,
        precio DECIMAL(10,2) NOT NULL,
        min_cantidad INT DEFAULT 1,
        FOREIGN KEY (lista_id) REFERENCES listas_precios(id) ON DELETE CASCADE
    )";
    $conn->exec($sql);
    echo "Tabla listas_precios_items verificada.\n";

    // 2. Tables for Promotions
    $sql = "CREATE TABLE IF NOT EXISTS promociones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        tipo_descuento ENUM('porcentaje', 'monto_fijo') DEFAULT 'porcentaje',
        valor DECIMAL(10,2) NOT NULL,
        alcance ENUM('todos', 'categoria', 'seleccion') DEFAULT 'todos',
        estado ENUM('activa', 'inactiva', 'programada', 'finalizada') DEFAULT 'programada',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )";
    $conn->exec($sql);
    echo "Tabla promociones verificada.\n";

    $sql = "CREATE TABLE IF NOT EXISTS promociones_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        promocion_id INT NOT NULL,
        producto_id INT NULL, -- If null, might apply to category logic if extended
        FOREIGN KEY (promocion_id) REFERENCES promociones(id) ON DELETE CASCADE
    )";
    $conn->exec($sql);
    echo "Tabla promociones_items verificada.\n";

    // 3. Table for Policies (Margins, Max Discounts)
    $sql = "CREATE TABLE IF NOT EXISTS politicas_comerciales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rol_nombre VARCHAR(50) DEFAULT 'ventas',
        max_descuento_autorizado DECIMAL(5,2) DEFAULT 0.00, -- % Max discount allowed without override
        margen_minimo_alerta DECIMAL(5,2) DEFAULT 0.00, -- % Margin that triggers alert
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )";
    $conn->exec($sql);
    echo "Tabla politicas_comerciales verificada.\n";

    // Insert default policy for sales if not exists
    $stmt = $conn->query("SELECT id FROM politicas_comerciales WHERE rol_nombre = 'ventas'");
    if (!$stmt->fetch()) {
        $conn->exec("INSERT INTO politicas_comerciales (rol_nombre, max_descuento_autorizado, margen_minimo_alerta) VALUES ('ventas', 10.00, 15.00)");
        echo "Política comercial por defecto creada.\n";
    }

    // 4. Update Clientes table to link to a price list
    try {
        $conn->exec("ALTER TABLE clientes ADD COLUMN lista_precios_id INT NULL DEFAULT NULL");
        $conn->exec("ALTER TABLE clientes ADD CONSTRAINT fk_cliente_lista FOREIGN KEY (lista_precios_id) REFERENCES listas_precios(id) ON DELETE SET NULL");
        echo "Columna lista_precios_id agregada a clientes.\n";
    } catch (PDOException $e) {
        // Ignore if column exists
        if (strpos($e->getMessage(), "Duplicate column") === false) {
             echo "Nota sobre clientes: " . $e->getMessage() . "\n";
        }
    }

    // 5. Register Module
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'precios_promociones'");
    $stmt->execute();
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $sql = "INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) 
                VALUES ('Precios y Promociones', 'precios_promociones', '/precios-promociones', 'Tags', 'Gestión de listas de precios, descuentos y promociones')";
        $conn->exec($sql);
        $modulo_id = $conn->lastInsertId();
        echo "Módulo registrado.\n";
    } else {
        $modulo_id = $modulo['id'];
    }

    // 6. Permissions
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'ventas'");
    $stmt->execute();
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($rol) {
        $rol_id = $rol['id'];
        $sql = "INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                VALUES (:rol_id, :modulo_id, 1, 1, 0)"; // Sales can read/write but maybe not delete critical stuff? Giving write for now.
        $stmt = $conn->prepare($sql);
        $stmt->execute([':rol_id' => $rol_id, ':modulo_id' => $modulo_id]);
    }

    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'admin'");
    $stmt->execute();
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    if($admin) {
        $sql = "INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                VALUES (:rol_id, :modulo_id, 1, 1, 1)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':rol_id' => $admin['id'], ':modulo_id' => $modulo_id]);
    }

    $conn->commit();
    echo "Instalación de módulo Precios y Promociones completada.\n";

} catch (PDOException $e) {
    $conn->rollBack();
    echo "Error: " . $e->getMessage();
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
