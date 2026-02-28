<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

$host ="76.13.160.64";
$db_name ="erpjc";
$username ="adminremote";
$password ="Nextboost@2026";

try {
    $conn = new PDO("mysql:host=" . $host . ";dbname=" . $db_name, $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "Conectado.\n";
    $stmt = $conn->query("DESCRIBE usuarios");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo $row['Field'] . "\n";
    }
} catch(PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>