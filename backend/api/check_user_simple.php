<?php
$email = 'marketing@consultoriagrupojc.com';
include_once __DIR__ . '/../config/db.php';

$stmt = $conn->prepare("SELECT u.id, u.usuario, u.email, u.nombre_real, u.status, u.rol_id, r.nombre as rol_nombre 
                         FROM usuarios u 
                         LEFT JOIN roles r ON u.rol_id = r.id 
                         WHERE u.email = :email OR u.usuario = :usuario");
$stmt->execute([':email' => $email, ':usuario' => $email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user) {
    echo "ENCONTRADO:\n";
    echo "ID: {$user['id']}\n";
    echo "Usuario: {$user['usuario']}\n";
    echo "Email: {$user['email']}\n";
    echo "Nombre real: {$user['nombre_real']}\n";
    echo "Status: {$user['status']}\n";
    echo "Rol ID: {$user['rol_id']}\n";
    echo "Rol nombre: {$user['rol_nombre']}\n";
} else {
    echo "NO ENCONTRADO por email exacto. Buscando parcial...\n";
    $stmt2 = $conn->prepare("SELECT u.id, u.usuario, u.email, u.nombre_real, u.status, u.rol_id, r.nombre as rol_nombre 
                              FROM usuarios u 
                              LEFT JOIN roles r ON u.rol_id = r.id 
                              WHERE u.email LIKE :email OR u.usuario LIKE :usuario");
    $stmt2->execute([':email' => "%$email%", ':usuario' => "%$email%"]);
    $users = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    if (count($users) > 0) {
        foreach ($users as $u) {
            echo " - ID: {$u['id']} | Usuario: {$u['usuario']} | Email: {$u['email']} | Status: {$u['status']} | Rol ID: {$u['rol_id']} | Rol: {$u['rol_nombre']}\n";
        }
    } else {
        echo "No se encontró ningún usuario con 'marketing'\n";
        
        // Show all users
        echo "\nTodos los usuarios:\n";
        $stmt3 = $conn->query("SELECT u.id, u.usuario, u.email, u.status, u.rol_id, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id ORDER BY u.id");
        while ($row = $stmt3->fetch(PDO::FETCH_ASSOC)) {
            echo " - ID: {$row['id']} | Usuario: {$row['usuario']} | Email: {$row['email']} | Status: {$row['status']} | Rol: {$row['rol_nombre']}\n";
        }
    }
}
$conn = null;
