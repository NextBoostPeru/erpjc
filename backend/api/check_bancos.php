<?php
require_once __DIR__ . '/../config/db.php';

echo "Checking bancos_cuentas table...\n";

try {
    $stmt = $conn->query("SELECT * FROM bancos_cuentas");
    $cuentas = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($cuentas) > 0) {
        foreach ($cuentas as $c) {
            echo "ID: {$c['id']} | Banco: {$c['nombre_banco']} | Tipo: {$c['tipo_cuenta']} | Num: {$c['numero_cuenta']}\n";
        }
    } else {
        echo "La tabla bancos_cuentas está vacía.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
