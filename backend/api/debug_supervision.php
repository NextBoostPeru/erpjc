<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Mock GET parameters
$_GET['action'] = 'reports';
$_GET['start_date'] = '2026-02-01';
$_GET['end_date'] = '2026-02-02';

// Define DB config path manually to avoid include errors if possible, or use the relative path carefully
define('DB_PATH', __DIR__ . '/../config/db.php');

if (!file_exists(DB_PATH)) {
    die("DB Config not found at " . DB_PATH);
}

require_once DB_PATH;

// Mock user token validation if necessary, or just bypass for this debug script
// We will bypass the JWT part for this CLI debug script by copying the logic inside the try-catch block

$startDate = $_GET['start_date'];
$endDate = $_GET['end_date'];

try {
    echo "Testing SQL Area...\n";
    // 1. Ventas por Área
    $sqlArea = "SELECT COALESCE(a.nombre, 'Sin Área') as area, SUM(c.total_importe) as total
                FROM comprobantes_electronicos c
                LEFT JOIN usuarios u ON c.usuario_id = u.id
                LEFT JOIN areas a ON u.area_id = a.id
                WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
                GROUP BY a.nombre
                ORDER BY total DESC";
    echo "Query: $sqlArea\n";
    $stmt = $conn->prepare($sqlArea);
    $stmt->execute([':start' => $startDate, ':end' => $endDate]);
    $salesByArea = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "SQL Area OK. Rows: " . count($salesByArea) . "\n";

    echo "Testing SQL Seller...\n";
    // 2. Ventas por Vendedor
    $sqlSeller = "SELECT u.usuario as vendedor, SUM(c.total_importe) as total, COUNT(*) as cantidad
                  FROM comprobantes_electronicos c
                  LEFT JOIN usuarios u ON c.usuario_id = u.id
                  WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
                  GROUP BY u.usuario 
                  ORDER BY total DESC";
    $stmt = $conn->prepare($sqlSeller);
    $stmt->execute([':start' => $startDate, ':end' => $endDate]);
    $salesBySeller = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "SQL Seller OK. Rows: " . count($salesBySeller) . "\n";

    echo "Testing SQL Product...\n";
    // 3. Ventas por Producto
    $sqlProduct = "SELECT d.descripcion, SUM(d.cantidad) as cantidad, SUM(d.valor_venta) as total
                   FROM comprobantes_electronicos_detalle d
                   JOIN comprobantes_electronicos c ON d.comprobante_id = c.id
                   WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
                   GROUP BY d.descripcion 
                   ORDER BY total DESC LIMIT 10";
    $stmt = $conn->prepare($sqlProduct);
    $stmt->execute([':start' => $startDate, ':end' => $endDate]);
    $salesByProduct = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "SQL Product OK. Rows: " . count($salesByProduct) . "\n";

    echo "Testing SQL Margins...\n";
    // 4. Márgenes
    $sqlMargins = "SELECT 
                    SUM(d.valor_venta) as ventas_netas,
                    SUM(d.cantidad * COALESCE(p.precio_compra, 0)) as costo_estimado
                   FROM comprobantes_electronicos_detalle d
                   JOIN comprobantes_electronicos c ON d.comprobante_id = c.id
                   LEFT JOIN productos p ON d.item_codigo = p.codigo_interno
                   WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'";
    $stmt = $conn->prepare($sqlMargins);
    $stmt->execute([':start' => $startDate, ':end' => $endDate]);
    $margins = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "SQL Margins OK.\n";
    print_r($margins);

} catch (Exception $e) {
    echo "\nERROR: " . $e->getMessage() . "\n";
    echo "Trace: " . $e->getTraceAsString() . "\n";
}
?>