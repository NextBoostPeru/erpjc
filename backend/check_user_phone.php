<?php
include_once 'config/db.php';
try {
    $stmt = $conn->query("SHOW COLUMNS FROM usuarios LIKE 'telefono'");
    $col = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($col) {
        echo "Columna 'telefono' EXISTE en tabla usuarios.";
    } else {
        echo "Columna 'telefono' NO EXISTE en tabla usuarios.";
    }
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>