<?php
require_once __DIR__ . '/../config/db.php';

try {
    $conn->beginTransaction();

    // 1. Register Module
    $stmt = $conn->prepare("INSERT INTO modulos (codigo, nombre, ruta, icono, descripcion) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), ruta=VALUES(ruta), icono=VALUES(icono), descripcion=VALUES(descripcion)");
    
    // Icon 'receipt' or similar (using 'file-text' or 'receipt' which maps to something in Layout.jsx)
    // In Layout.jsx, 'facturacion' maps to Receipt. I can use 'boletas_pago' and map it to Receipt or FileText in Layout.jsx.
    // Let's use 'boletas_pago' as code.
    
    $stmt->execute([
        'boletas_pago', 
        'Boletas de Pago', 
        '/boletas-pago', 
        'file-text', 
        'Generación de Boletas de Pago'
    ]);

    $moduloId = $conn->lastInsertId();
    if ($moduloId == 0) {
        $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ?");
        $stmt->execute(['boletas_pago']);
        $moduloId = $stmt->fetchColumn();
    }

    // 2. Assign permissions
    $roles = ['admin', 'gerencia', 'rrhh', 'contador'];
    
    foreach ($roles as $rolNombre) {
        $stmt = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
        $stmt->execute([$rolNombre]);
        $rolId = $stmt->fetchColumn();

        if ($rolId) {
            $stmt = $conn->prepare("INSERT IGNORE INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion) VALUES (?, ?, 1, 1, 1)");
            $stmt->execute([$rolId, $moduloId]);
        }
    }

    $conn->commit();
    echo json_encode(['success' => true, 'message' => 'Módulo Boletas de Pago instalado correctamente']);

} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
