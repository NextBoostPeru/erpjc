<?php
include_once __DIR__ . '/../config/db.php';

try {
    // 1. Create Module if not exists
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'planillas'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $conn->exec("INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES ('Planillas', 'planillas', '/planillas', 'calculator')");
        echo "Modulo 'planillas' creado.<br>";
    }

    // 2. Assign to RRHH role
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'RRHH'");
    $stmt->execute();
    $role = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($role) {
        $roleId = $role['id'];
        $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = 'planillas'");
        $stmt->execute();
        $mod = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($mod) {
            $modId = $mod['id'];
            $check = $conn->prepare("SELECT id FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
            $check->execute([$roleId, $modId]);
            if (!$check->fetch()) {
                $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)")->execute([$roleId, $modId]);
                echo "Modulo asignado al rol RRHH.<br>";
            }
        }
    }

    // 3. Create 'planillas' table
    $sql = "CREATE TABLE IF NOT EXISTS planillas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mes INT NOT NULL,
        anio INT NOT NULL,
        tipo ENUM('Mensual', 'Gratificacion', 'CTS') NOT NULL DEFAULT 'Mensual',
        estado ENUM('Borrador', 'Cerrado', 'Enviado') DEFAULT 'Borrador',
        total_ingresos DECIMAL(12, 2) DEFAULT 0,
        total_descuentos DECIMAL(12, 2) DEFAULT 0,
        total_neto DECIMAL(12, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_planilla (mes, anio, tipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sql);
    echo "Tabla 'planillas' creada/verificada.<br>";

    // 4. Create 'planilla_detalles' table
    $sqlDetails = "CREATE TABLE IF NOT EXISTS planilla_detalles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        planilla_id INT NOT NULL,
        colaborador_id INT NOT NULL,
        sueldo_base DECIMAL(10, 2) DEFAULT 0,
        dias_trabajados INT DEFAULT 30,
        horas_extras DECIMAL(10, 2) DEFAULT 0,
        monto_horas_extras DECIMAL(10, 2) DEFAULT 0,
        bonos DECIMAL(10, 2) DEFAULT 0,
        comisiones DECIMAL(10, 2) DEFAULT 0,
        total_bruto DECIMAL(10, 2) DEFAULT 0,
        afp_onp_monto DECIMAL(10, 2) DEFAULT 0,
        tardanzas_monto DECIMAL(10, 2) DEFAULT 0,
        prestamos DECIMAL(10, 2) DEFAULT 0,
        total_descuentos DECIMAL(10, 2) DEFAULT 0,
        neto_pagar DECIMAL(10, 2) DEFAULT 0,
        FOREIGN KEY (planilla_id) REFERENCES planillas(id) ON DELETE CASCADE,
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->exec($sqlDetails);
    echo "Tabla 'planilla_detalles' creada/verificada.<br>";
    
    // Add columns to colaboradores if not exist (sueldo_base, regimen_pensionario)
    // We can't easily check column existence via PDO in a cross-db standard way without DESCRIBE
    // But we can try adding and catch exception if exists or use a stored procedure logic.
    // For simplicity, we assume they might be missing.
    // Let's rely on standard ALTER IGNORE logic or check via information_schema
    
    $checkCol = $conn->query("SHOW COLUMNS FROM colaboradores LIKE 'sueldo_base'");
    if ($checkCol->rowCount() == 0) {
        $conn->exec("ALTER TABLE colaboradores ADD COLUMN sueldo_base DECIMAL(10,2) DEFAULT 1025.00");
        echo "Columna sueldo_base agregada a colaboradores.<br>";
    }

    $checkCol2 = $conn->query("SHOW COLUMNS FROM colaboradores LIKE 'regimen_pensionario'");
    if ($checkCol2->rowCount() == 0) {
        $conn->exec("ALTER TABLE colaboradores ADD COLUMN regimen_pensionario ENUM('ONP', 'AFP Integra', 'AFP Prima', 'AFP Profuturo', 'AFP Habitat') DEFAULT 'ONP'");
        echo "Columna regimen_pensionario agregada a colaboradores.<br>";
    }
    
    $checkCol3 = $conn->query("SHOW COLUMNS FROM colaboradores LIKE 'comision_afp'"); // Flujo vs Mixta
    if ($checkCol3->rowCount() == 0) {
        $conn->exec("ALTER TABLE colaboradores ADD COLUMN comision_afp ENUM('Flujo', 'Mixta') DEFAULT 'Flujo'");
        echo "Columna comision_afp agregada a colaboradores.<br>";
    }


} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>