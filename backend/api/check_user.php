<?php
include_once '../config/db.php';
header('Content-Type: application/json; charset=UTF-8');

$email = $_GET['email'] ?? '';

$stmt = $conn->prepare("SELECT u.id, u.usuario, u.email, u.nombre_real, u.status, u.rol_id, r.nombre as rol_nombre 
                         FROM usuarios u 
                         LEFT JOIN roles r ON u.rol_id = r.id 
                         WHERE u.email = :email OR u.usuario = :usuario");
$stmt->execute([':email' => $email, ':usuario' => $email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user) {
    echo json_encode(['found' => true, 'user' => $user], JSON_UNESCAPED_UNICODE);
} else {
    // Try searching partial
    $stmt2 = $conn->prepare("SELECT u.id, u.usuario, u.email, u.nombre_real, u.status, u.rol_id, r.nombre as rol_nombre 
                              FROM usuarios u 
                              LEFT JOIN roles r ON u.rol_id = r.id 
                              WHERE u.email LIKE :email OR u.usuario LIKE :usuario");
    $stmt2->execute([':email' => "%$email%", ':usuario' => "%$email%"]);
    $users = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['found' => count($users) > 0, 'users' => $users], JSON_UNESCAPED_UNICODE);
}
$conn = null;
