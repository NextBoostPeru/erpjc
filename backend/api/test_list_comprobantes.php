<?php
// Mock $_SERVER
$_SERVER['REQUEST_METHOD'] = 'GET';
// Mock $_GET
$_GET['action'] = 'listar';
$_GET['limit'] = 5;
$_GET['page'] = 1;

// Include the file
ob_start();
include 'facturacion.php';
$output = ob_get_clean();

echo "--- OUTPUT START ---\n";
echo $output;
echo "\n--- OUTPUT END ---\n";
?>