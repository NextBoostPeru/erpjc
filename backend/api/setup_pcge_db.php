<?php
include_once __DIR__ . '/../config/db.php';

try {
    $conn->beginTransaction();

    $sql = "CREATE TABLE IF NOT EXISTS pcge (
        codigo VARCHAR(10) PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        nivel INT NOT NULL,
        tipo VARCHAR(50), -- Activo, Pasivo, Patrimonio, Ingreso, Gasto
        padre_codigo VARCHAR(10),
        permite_movimiento TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $conn->exec($sql);
    echo "Tabla 'pcge' creada o verificada.\n";

    // Insertar algunas cuentas básicas si está vacía
    $stmt = $conn->query("SELECT COUNT(*) FROM pcge");
    if ($stmt->fetchColumn() == 0) {
        $cuentas = [
            ['10', 'EFECTIVO Y EQUIVALENTES DE EFECTIVO', 2, 'Activo', null, 0],
            ['101', 'Caja', 3, 'Activo', '10', 1],
            ['104', 'Cuentas Corrientes en Instituciones Financieras', 3, 'Activo', '10', 1],
            ['12', 'CUENTAS POR COBRAR COMERCIALES – TERCEROS', 2, 'Activo', null, 0],
            ['121', 'Facturas, Boletas y Otros Comprobantes por Cobrar', 3, 'Activo', '12', 1],
            ['42', 'CUENTAS POR PAGAR COMERCIALES – TERCEROS', 2, 'Pasivo', null, 0],
            ['421', 'Facturas, Boletas y Otros Comprobantes por Pagar', 3, 'Pasivo', '42', 1],
            ['60', 'COMPRAS', 2, 'Gasto', null, 0],
            ['70', 'VENTAS', 2, 'Ingreso', null, 0]
        ];

        $stmtInsert = $conn->prepare("INSERT INTO pcge (codigo, nombre, nivel, tipo, padre_codigo, permite_movimiento) VALUES (?, ?, ?, ?, ?, ?)");
        
        foreach ($cuentas as $cta) {
            $stmtInsert->execute($cta);
        }
        echo "Cuentas PCGE básicas insertadas.\n";
    } else {
        echo "La tabla pcge ya contiene datos.\n";
    }

    $conn->commit();
    echo "Setup de PCGE completado exitosamente.\n";

} catch (PDOException $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    echo "Error: " . $e->getMessage() . "\n";
}
?>
