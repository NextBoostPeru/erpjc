<?php
require_once 'config/db.php';
try {
    $stmt = $conn->query("SELECT id, codigo, nombre FROM modulos");
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>