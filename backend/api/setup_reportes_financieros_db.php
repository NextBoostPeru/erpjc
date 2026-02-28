<?php
include_once '../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Registrar módulo y permisos
    $modulo_codigo = 'reportes_financieros';
    
    // Check if module exists
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = :codigo");
    $stmt->execute([':codigo' => $modulo_codigo]);
    $modulo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$modulo) {
        $sql = "INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES (:nombre, :codigo, :ruta, :icono, :desc)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':nombre' => 'Reportes Financieros',
            ':codigo' => $modulo_codigo,
            ':ruta' => '/reportes-financieros',
            ':icono' => 'PieChart', 
            ':desc' => 'Balance, EERR, Flujo de Caja y Análisis'
        ]);
        $modulo_id = $conn->lastInsertId();
        echo "Módulo registrado.\n";
    } else {
        $modulo_id = $modulo['id'];
        echo "Módulo ya existía.\n";
    }

    // 2. Asignar permisos al rol contador (id 2) y admin (id 1)
    $roles = ['admin', 'contador'];
    foreach ($roles as $rolName) {
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = :nombre");
        $stmt->execute([':nombre' => $rolName]);
        $rolId = $stmt->fetchColumn();

        if ($rolId) {
            $stmt = $conn->prepare("SELECT rol_id FROM roles_modulos WHERE rol_id = :rid AND modulo_id = :mid");
            $stmt->execute([':rid' => $rolId, ':mid' => $modulo_id]);
            if (!$stmt->fetch()) {
                $conn->prepare("INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (:rid, :mid, 1, 1, 1)")
                     ->execute([':rid' => $rolId, ':mid' => $modulo_id]);
                echo "Permisos asignados a $rolName.\n";
            }
        }
    }
    
    $conn->commit();
    echo "Setup de Reportes Financieros completado.\n";

} catch (PDOException $e) {
    $conn->rollBack();
    die("Error en setup DB: " . $e->getMessage());
}
?>