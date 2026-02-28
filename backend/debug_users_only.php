<?php
include_once 'config/db.php';
$stmt = $conn->query("DESCRIBE usuarios");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo $row['Field'] . " - " . $row['Type'] . "\n";
}
?>