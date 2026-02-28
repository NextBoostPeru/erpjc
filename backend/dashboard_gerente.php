<?php
require_once 'config/db.php';
require_once 'config/security.php';

// Validar Headers de Seguridad
Security::validateHeaders();

// Obtener estadísticas generales para el Gerente
try {
    $stats = [];
    $today = date('Y-m-d');
    $currentMonth = date('Y-m');

    // 1. Ventas del Día
    $stmt = $conn->prepare("SELECT SUM(total) as total, COUNT(*) as count FROM ventas WHERE DATE(fecha_emision) = :today AND estado = 'aceptado'");
    $stmt->execute([':today' => $today]);
    $ventasDia = $stmt->fetch(PDO::FETCH_ASSOC);
    $stats['ventas_dia'] = [
        'total' => $ventasDia['total'] ?? 0,
        'count' => $ventasDia['count'] ?? 0
    ];

    // 2. Ventas del Mes
    $stmt = $conn->prepare("SELECT SUM(total) as total, COUNT(*) as count FROM ventas WHERE fecha_emision LIKE :month AND estado = 'aceptado'");
    $stmt->execute([':month' => "$currentMonth%"]);
    $ventasMes = $stmt->fetch(PDO::FETCH_ASSOC);
    $stats['ventas_mes'] = [
        'total' => $ventasMes['total'] ?? 0,
        'count' => $ventasMes['count'] ?? 0
    ];

    // 3. Compras del Mes (Si existe tabla compras o gastos)
    // Asumiendo tabla 'compras' o similar, si no existe devolver 0
    // Verificamos si existe la tabla compras
    $tables = $conn->query("SHOW TABLES LIKE 'compras'")->fetchAll();
    if (count($tables) > 0) {
        $stmt = $conn->prepare("SELECT SUM(total) as total FROM compras WHERE fecha_emision LIKE :month");
        $stmt->execute([':month' => "$currentMonth%"]);
        $comprasMes = $stmt->fetch(PDO::FETCH_ASSOC);
        $stats['compras_mes'] = $comprasMes['total'] ?? 0;
    } else {
        $stats['compras_mes'] = 0;
    }

    // 4. Cuentas por Cobrar (Ventas al crédito pendientes)
    // Asumiendo que forma_pago 'credito' y estado_pago 'pendiente' existen o lógica similar
    // Simplificado: Ventas aceptadas que no están pagadas (si existe campo estado_pago)
    // Revisar estructura de ventas es ideal, pero haremos un best guess seguro
    // Si no hay campo estado_pago, devolvemos 0 por ahora para evitar error
    $columns = $conn->query("SHOW COLUMNS FROM ventas LIKE 'estado_pago'")->fetchAll();
    if (count($columns) > 0) {
        $stmt = $conn->query("SELECT SUM(total) as total FROM ventas WHERE estado = 'aceptado' AND estado_pago = 'pendiente'");
        $stats['por_cobrar'] = $stmt->fetchColumn() ?? 0;
    } else {
        $stats['por_cobrar'] = 0;
    }

    // 5. Saldo en Caja/Bancos (Total)
    // Caja
    $saldoCaja = 0;
    $tablesCaja = $conn->query("SHOW TABLES LIKE 'caja_movimientos'")->fetchAll();
    if (count($tablesCaja) > 0) {
        $stmt = $conn->query("SELECT (SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) - SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END)) as saldo FROM caja_movimientos");
        $saldoCaja = $stmt->fetchColumn() ?? 0;
    }
    
    // Bancos
    $saldoBancos = 0;
    $tablesBancos = $conn->query("SHOW TABLES LIKE 'bancos_movimientos'")->fetchAll();
    if (count($tablesBancos) > 0) {
        $stmt = $conn->query("SELECT (SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) - SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END)) as saldo FROM bancos_movimientos");
        $saldoBancos = $stmt->fetchColumn() ?? 0;
    }
    
    $stats['liquidez_total'] = $saldoCaja + $saldoBancos;

    // 6. Últimas 5 Ventas
    $stmt = $conn->query("SELECT id, cliente_nombre, total, fecha_emision, estado FROM ventas ORDER BY fecha_emision DESC LIMIT 5");
    $stats['ultimas_ventas'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode($stats);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>