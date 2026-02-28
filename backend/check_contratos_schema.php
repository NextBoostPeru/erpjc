<?php
include_once 'config/db.php';

$tables = ['contratos', 'plantillas_contratos', 'secciones_contratos'];

foreach ($tables as $table) {
    echo "<h2>Structure of $table:</h2>";
    try {
        $stmt = $conn->query("DESCRIBE $table");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            echo $row['Field'] . " - " . $row['Type'] . "<br>";
        }
    } catch (PDOException $e) {
        echo "Table $table not found or error: " . $e->getMessage() . "<br>";
    }
}
?>