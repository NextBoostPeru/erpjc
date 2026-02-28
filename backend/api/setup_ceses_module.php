<?php
include_once __DIR__ . '/../config/db.php';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 1. Create 'ceses' table
    $sql = "CREATE TABLE IF NOT EXISTS ceses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        colaborador_id INT NOT NULL,
        fecha_cese DATE NOT NULL,
        motivo ENUM('Renuncia', 'Despido', 'Fin de Contrato', 'Otro') NOT NULL,
        observaciones TEXT,
        estado ENUM('Pendiente', 'Procesado', 'Anulado') DEFAULT 'Pendiente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    )";
    $conn->exec($sql);
    echo "Table 'ceses' created or exists.\n";

    // 2. Create 'liquidaciones_detalles' table
    $sql = "CREATE TABLE IF NOT EXISTS liquidaciones_detalles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cese_id INT NOT NULL,
        remuneracion_computable DECIMAL(10,2) NOT NULL,
        vacaciones_truncas DECIMAL(10,2) NOT NULL,
        cts_trunca DECIMAL(10,2) NOT NULL,
        gratificacion_trunca DECIMAL(10,2) NOT NULL,
        bonificacion_extraordinaria DECIMAL(10,2) NOT NULL,
        total_ingresos DECIMAL(10,2) NOT NULL,
        descuentos DECIMAL(10,2) DEFAULT 0.00,
        neto_pagar DECIMAL(10,2) NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cese_id) REFERENCES ceses(id) ON DELETE CASCADE
    )";
    $conn->exec($sql);
    echo "Table 'liquidaciones_detalles' created or exists.\n";

    // 3. Register module 'ceses'
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute(['ceses']);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $stmt = $conn->prepare("INSERT INTO modulos (codigo, nombre, ruta) VALUES (?, ?, ?)");
        $stmt->execute(['ceses', 'Ceses y Liquidaciones', '/ceses']);
        $moduloId = $conn->lastInsertId();
        echo "Module 'ceses' created.\n";
    } else {
        $moduloId = $modulo['id'];
        echo "Module 'ceses' already exists.\n";
    }

    // 4. Assign module to 'rrhh' role
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
    $stmt->execute(['rrhh']);
    $rol = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($rol) {
        $rolId = $rol['id'];
        
        $stmt = $conn->prepare("SELECT * FROM roles_modulos WHERE rol_id = ? AND modulo_id = ?");
        $stmt->execute([$rolId, $moduloId]);
        
        if ($stmt->rowCount() == 0) {
            $stmt = $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id) VALUES (?, ?)");
            $stmt->execute([$rolId, $moduloId]);
            echo "Module assigned to 'rrhh' role.\n";
        } else {
            echo "Module already assigned to 'rrhh' role.\n";
        }
    } else {
        echo "Role 'rrhh' not found.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
