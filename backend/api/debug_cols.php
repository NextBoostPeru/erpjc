<?php
include_once __DIR__ . '/../config/db.php';
$stmt = $conn->query("DESCRIBE comprobantes_electronicos");
$columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
print_r($columns);
?>