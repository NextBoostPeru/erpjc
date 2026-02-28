<?php
require_once __DIR__ . '/../config/db.php';

try {
    echo "Setting up 'Gestión de Permisos' module...\n";

    // 1. Create Module
    $nombre = "Gestión de Permisos";
    $codigo = "permisos";
    $ruta = "/permisos";
    $icono = "Shield"; // Lucide icon name

    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
    $stmt->execute([$codigo]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        $moduloId = $existing['id'];
        echo "Module '$nombre' already exists (ID: $moduloId).\n";
    } else {
        $sql = "INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES (:n, :c, :r, :i)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':n' => $nombre, ':c' => $codigo, ':r' => $ruta, ':i' => $icono]);
        $moduloId = $conn->lastInsertId();
        echo "Module '$nombre' created (ID: $moduloId).\n";
    }

    // 2. Assign to Admin Role
    $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = 'admin'");
    $stmt->execute();
    $adminRole = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($adminRole) {
        $adminId = $adminRole['id'];
        
        // Check if already assigned
        $checkSql = "SELECT * FROM roles_modulos WHERE rol_id = :r AND modulo_id = :m";
        $checkStmt = $conn->prepare($checkSql);
        $checkStmt->execute([':r' => $adminId, ':m' => $moduloId]);
        
        if (!$checkStmt->fetch()) {
            $assignSql = "INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (:r, :m, 1, 1, 1)";
            $assignStmt = $conn->prepare($assignSql);
            $assignStmt->execute([':r' => $adminId, ':m' => $moduloId]);
            echo "Assigned '$nombre' to Admin role.\n";
        } else {
            echo "Module already assigned to Admin.\n";
        }
    } else {
        echo "Admin role not found!\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>