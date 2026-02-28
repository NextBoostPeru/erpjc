<?php
include_once __DIR__ . '/../config/db.php';

try {
    // 1. Update colaboradores table if needed
    $checkColab = $conn->query("SHOW COLUMNS FROM colaboradores LIKE 'asignacion_familiar'");
    if ($checkColab->rowCount() == 0) {
        $conn->exec("ALTER TABLE colaboradores ADD COLUMN asignacion_familiar TINYINT(1) DEFAULT 0");
        echo "Added 'asignacion_familiar' to colaboradores.\n";
    }

    // 2. Create tables

    // CTS Histórico
    $conn->exec("CREATE TABLE IF NOT EXISTS cts_historico (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        periodo VARCHAR(20) NOT NULL, -- '2025-05', '2025-11'
        fecha_pago DATE,
        sueldo_computable DECIMAL(10,2),
        monto_cts DECIMAL(10,2),
        detalle TEXT,
        estado ENUM('Pendiente', 'Pagado') DEFAULT 'Pendiente',
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    )");

    // Gratificaciones Histórico
    $conn->exec("CREATE TABLE IF NOT EXISTS gratificaciones_historico (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        periodo VARCHAR(20) NOT NULL, -- '2025-07', '2025-12'
        fecha_pago DATE,
        sueldo_computable DECIMAL(10,2),
        monto_gratificacion DECIMAL(10,2),
        bono_extraordinario DECIMAL(10,2), -- 9% Essalud
        monto_total DECIMAL(10,2),
        estado ENUM('Pendiente', 'Pagado') DEFAULT 'Pendiente',
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    )");

    // Préstamos
    $conn->exec("CREATE TABLE IF NOT EXISTS prestamos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        monto_total DECIMAL(10,2) NOT NULL,
        cuotas_totales INT NOT NULL,
        cuotas_pagadas INT DEFAULT 0,
        monto_pagado DECIMAL(10,2) DEFAULT 0.00,
        fecha_solicitud DATE NOT NULL,
        motivo TEXT,
        estado ENUM('Pendiente', 'Aprobado', 'Rechazado', 'Pagado', 'Anulado') DEFAULT 'Pendiente',
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    )");

    // Beneficios Internos
    $conn->exec("CREATE TABLE IF NOT EXISTS beneficios_internos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        monto_referencial DECIMAL(10,2) DEFAULT 0.00,
        activo TINYINT(1) DEFAULT 1
    )");

    // Colaboradores - Beneficios (Many-to-Many)
    $conn->exec("CREATE TABLE IF NOT EXISTS colaboradores_beneficios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        beneficio_id INT NOT NULL,
        fecha_asignacion DATE DEFAULT CURRENT_DATE,
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
        FOREIGN KEY (beneficio_id) REFERENCES beneficios_internos(id)
    )");

    // 3. Register Module and Assign to RRHH
    // Check if module exists
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute(['beneficios']);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, descripcion) VALUES (?, ?, ?)");
        $stmt->execute(['Beneficios y Compensaciones', 'beneficios', 'Gestión de CTS, Gratificaciones, Préstamos y Beneficios']);
        $modulo_id = $conn->lastInsertId();
        echo "Module 'Beneficios' created.\n";
    } else {
        $modulo_id = $modulo['id'];
    }

    // Assign to 'rrhh' role
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
    $stmt->execute(['rrhh']);
    $role = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($role) {
        $role_id = $role['id'];
        $stmt = $conn->prepare("SELECT * FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
        $stmt->execute([$role_id, $modulo_id]);
        if ($stmt->rowCount() == 0) {
            $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)");
            $stmt->execute([$role_id, $modulo_id]);
            echo "Module assigned to RRHH.\n";
        }
    }

    echo "Setup Beneficios completed successfully.";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>