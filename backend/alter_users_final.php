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

    // Agregar telefono
    try {
        $sql = "ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(50) DEFAULT NULL";
        $conn->exec($sql);
        echo "Columna 'telefono' agregada.\n";
    } catch (PDOException $e) {
        echo "Info: " . $e->getMessage() . "\n";
    }

    // Agregar nombre_real
    try {
        $sql = "ALTER TABLE usuarios ADD COLUMN nombre_real VARCHAR(100) DEFAULT NULL";
        $conn->exec($sql);
        echo "Columna 'nombre_real' agregada.\n";
    } catch (PDOException $e) {
        echo "Info: " . $e->getMessage() . "\n";
    }

} catch(PDOException $e) {
    echo "Error Fatal: " . $e->getMessage();
}
?>