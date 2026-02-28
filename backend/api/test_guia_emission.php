<?php
// Test Script for Guia Remision Emission
// Run from command line: php test_guia_emission.php

require_once '../config/db.php';

echo "--- STARTING GUIA EMISSION TEST ---\n";

// 1. Setup Data
// We need a valid user ID (usually 1 for admin)
$user_id = 1;

// We need a valid client
$stmt = $conn->query("SELECT id, razon_social, num_doc FROM clientes LIMIT 1");
$client = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$client) die("No clients found. Create one first.\n");

// We need a valid warehouse (Almacen)
$stmt = $conn->query("SELECT id FROM almacenes LIMIT 1");
$almacen = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$almacen) {
    echo "No warehouses found. Creating one...\n";
    $conn->exec("INSERT INTO almacenes (nombre, direccion) VALUES ('Almacen Test', 'Calle Test 123')");
    $almacen_id = $conn->lastInsertId();
} else {
    $almacen_id = $almacen['id'];
}

// We need a valid product
$stmt = $conn->query("SELECT id, nombre, codigo_interno FROM productos LIMIT 1");
$producto = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$producto) die("No products found. Create one first.\n");

echo "Using Client: {$client['razon_social']} (ID: {$client['id']})\n";
echo "Using Almacen ID: $almacen_id\n";
echo "Using Product: {$producto['nombre']} (ID: {$producto['id']})\n";

// 2. Prepare JSON Payload (Mimicking Frontend)
$payload = [
    'serie' => 'T001',
    'numero' => '999' . time(), // Unique number
    'fecha_emision' => date('Y-m-d'),
    'fecha_traslado' => date('Y-m-d'),
    'punto_partida' => 'Origen Test',
    'almacen_id' => $almacen_id, // This triggers StockHelper logic
    'punto_llegada' => 'Destino Test',
    'cliente_id' => $client['id'],
    'destinatario_nombre' => $client['razon_social'],
    'destinatario_doc' => $client['num_doc'],
    'transportista_nombre' => 'Transportes Test',
    'transportista_doc' => '20100100100',
    'vehiculo_placa' => 'ABC-123',
    'conductor_licencia' => 'Q12345678',
    'motivo_traslado' => 'Venta',
    'peso_bruto_total' => 10,
    'numero_bultos' => 1,
    'observaciones' => 'Test automatico',
    'detalles' => [
        [
            'producto_id' => $producto['id'],
            'codigo_producto' => $producto['codigo_interno'],
            'descripcion' => $producto['nombre'],
            'unidad_medida' => 'NIU',
            'cantidad' => 5,
            'peso' => 2
        ]
    ]
];

// 3. Simulate POST Request Logic
// Instead of HTTP, we'll try to execute the logic block from guias_remision.php directly
// by "including" the relevant parts or just instantiating the classes if we can.
// But guias_remision.php is procedural. 
// We will COPY the critical logic block here to test it, 
// SPECIFICALLY the StockHelper instantiation part.

try {
    $conn->beginTransaction();

    // Insert Guide
    echo "Inserting Guide...\n";
    $stmt = $conn->prepare("
        INSERT INTO guias_remision (
            serie, numero, fecha_emision, fecha_traslado, 
            punto_partida, almacen_id, punto_llegada, 
            cliente_id, destinatario_nombre, destinatario_doc,
            transportista_nombre, transportista_doc, vehiculo_placa, conductor_licencia,
            motivo_traslado, peso_bruto_total, numero_bultos,
            observaciones, usuario_id, estado
        ) VALUES (
            ?, ?, ?, ?, 
            ?, ?, ?, 
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, 'Emitida'
        )
    ");

    $stmt->execute([
        $payload['serie'], $payload['numero'], $payload['fecha_emision'], $payload['fecha_traslado'],
        $payload['punto_partida'], $payload['almacen_id'], $payload['punto_llegada'],
        $payload['cliente_id'], $payload['destinatario_nombre'], $payload['destinatario_doc'],
        $payload['transportista_nombre'], $payload['transportista_doc'], $payload['vehiculo_placa'], $payload['conductor_licencia'],
        $payload['motivo_traslado'], $payload['peso_bruto_total'], $payload['numero_bultos'],
        $payload['observaciones'], $user_id
    ]);

    $guia_id = $conn->lastInsertId();
    echo "Guide Inserted. ID: $guia_id\n";

    // Insert Details
    $stmtDetalle = $conn->prepare("
        INSERT INTO guias_remision_detalles (
            guia_id, producto_id, codigo_producto, descripcion, unidad_medida, cantidad, peso
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    
    $kardexItems = [];
    foreach ($payload['detalles'] as $item) {
        $stmtDetalle->execute([
            $guia_id,
            $item['producto_id'],
            $item['codigo_producto'],
            $item['descripcion'],
            $item['unidad_medida'],
            $item['cantidad'],
            $item['peso']
        ]);
        
        if (!empty($item['producto_id'])) {
            $kardexItems[] = [
                'producto_id' => $item['producto_id'],
                'cantidad' => $item['cantidad'],
                'costo_unitario' => 0
            ];
        }
    }
    echo "Details Inserted.\n";

    // THE CRITICAL PART: StockHelper
    if (!empty($payload['almacen_id']) && !empty($kardexItems)) {
        echo "Attempting to use StockHelper...\n";
        
        // This is what guias_remision.php does:
        // $stockHelper = new StockHelper($conn);
        
        // Check if class exists
        if (!class_exists('StockHelper')) {
            // Check if file exists to verify path
            if (!file_exists('helpers/StockHelper.php')) {
                 throw new Exception("StockHelper.php file not found in helpers/");
            }
            require_once 'helpers/StockHelper.php';
        }
        
        $stockHelper = new StockHelper($conn);
        $stockHelper->registrarMovimiento([
            'almacen_id' => $payload['almacen_id'],
            'usuario_id' => $user_id,
            'tipo' => 'salida',
            'motivo' => 'Guía de Remisión Test',
            'documento_referencia' => $payload['serie'] . '-' . $payload['numero'],
            'items' => $kardexItems
        ]);
        echo "Stock Movement Registered.\n";
    }

    $conn->commit();
    echo "SUCCESS: Guide created successfully.\n";

    // Cleanup
    // $conn->exec("DELETE FROM guias_remision WHERE id = $guia_id");

} catch (Exception $e) {
    $conn->rollBack();
    echo "ERROR: " . $e->getMessage() . "\n";
}
?>
