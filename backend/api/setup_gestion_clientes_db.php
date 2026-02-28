<?php
include_once __DIR__ . '/../config/db.php';

try {
    // 1. Update 'clientes' table with new columns if they don't exist
    $columns = [
        "ADD COLUMN tipo_persona ENUM('Natural', 'Juridica') DEFAULT 'Juridica' AFTER num_doc",
        "ADD COLUMN segmento VARCHAR(50) DEFAULT 'General' AFTER clasificacion",
        "ADD COLUMN tipo_cliente VARCHAR(50) DEFAULT 'Regular' AFTER segmento",
        "ADD COLUMN contacto_nombre VARCHAR(100) NULL AFTER email"
    ];

    foreach ($columns as $col_sql) {
        try {
            $conn->exec("ALTER TABLE clientes " . $col_sql);
            echo "Columna agregada: $col_sql <br>\n";
        } catch (PDOException $e) {
            // Ignore if exists (SQLSTATE 42S21)
            if ($e->getCode() != '42S21') {
                echo "Nota: " . $e->getMessage() . "<br>\n";
            } else {
                 echo "Columna ya existe (o error 42S21).<br>\n";
            }
        }
    }

    // 2. Register module 'gestion_clientes'
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute(['gestion_clientes']);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $stmt = $conn->prepare("INSERT INTO modulos (codigo, nombre, ruta) VALUES (?, ?, ?)");
        $stmt->execute(['gestion_clientes', 'Gestión de Clientes', '/gestion-clientes']);
        $moduloId = $conn->lastInsertId();
        echo "Module 'gestion_clientes' created.\n";
    } else {
        $moduloId = $modulo['id'];
        echo "Module 'gestion_clientes' already exists.\n";
    }

    // 3. Assign module to 'ventas' role
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
    $stmt->execute(['ventas']);
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($rol) {
        $rolId = $rol['id'];
        
        $stmt = $conn->prepare("SELECT * FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
        $stmt->execute([$rolId, $moduloId]);
        
        if ($stmt->rowCount() == 0) {
            $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)");
            $stmt->execute([$rolId, $moduloId]);
            echo "Module assigned to 'ventas' role.\n";
        } else {
            echo "Module already assigned to 'ventas' role.\n";
        }
    } else {
        echo "Role 'ventas' not found.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
