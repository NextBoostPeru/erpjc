<?php
date_default_timezone_set('America/Lima');

$allowed_origins = [
    'http://localhost:5173',
    'http://localhost:3000', 
    'https://jc.nextboostperu.com',
    'https://erp.despegaperudigital.com'
];

// Permitir acceso desde cualquier origen
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
    header("Access-Control-Allow-Credentials: true");
    header("Access-Control-Max-Age: 86400");
} else {
    header("Access-Control-Allow-Origin: *");
}

header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

require_once __DIR__ . '/security.php';

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$host ="76.13.160.64";
$db_name ="erpjc";
$username ="adminremote";
$password ="Nextboost@2026";

try {
    $conn = new PDO("mysql:host=" . $host . ";dbname=" . $db_name, $username, $password, [
        PDO::ATTR_PERSISTENT => false,
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8"
    ]);
    $conn->exec("SET time_zone = '-05:00'");
} catch(PDOException $exception) {
    if (isset($exception->errorInfo[1]) && $exception->errorInfo[1] == 1226) {
        http_response_code(503);
        echo json_encode(["message" => "Límite de conexiones excedido. Por favor espere 1 hora o contacte soporte."]);
        exit;
    }
    echo "Connection error: " . $exception->getMessage();
    exit;
}

