<?php
include_once 'config/db.php';

try {
    echo "<h2>Estructura de Usuarios</h2>";
    $stmt = $conn->query("DESCRIBE usuarios");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "<pre>";
    print_r($columns);
    echo "</pre>";
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>