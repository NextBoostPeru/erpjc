<?php
include_once '../config/db.php';
require_once '../config/jwt.php';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

// RBAC básico: permitir lectura a usuarios autenticados; restringir aprobación a admin/gerente
$rol = is_object($userData) ? strtolower($userData->rol ?? '') : strtolower($userData['rol'] ?? '');

$action = $_GET['action'] ?? '';
$start = $_GET['start'] ?? date('Y-m-01');
$end = $_GET['end'] ?? date('Y-m-t');

try {
    switch ($action) {
        case 'relevant_purchases':
            // Top 10 purchases by amount in date range
            $sql = "SELECT * FROM comprobantes_compra 
                    WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'
                    ORDER BY importe_total DESC 
                    LIMIT 10";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':start' => $start, ':end' => $end]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'supplier_comparison':
            // Total spend per supplier
            $sql = "SELECT proveedor_razon_social as proveedor, SUM(importe_total) as total, COUNT(*) as cantidad
                    FROM comprobantes_compra 
                    WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'
                    GROUP BY proveedor_razon_social
                    ORDER BY total DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':start' => $start, ':end' => $end]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'overcosts':
            // Logic: Purchases where amount > 1.5 * Average Purchase Amount of the period
            // First get average
            $sqlAvg = "SELECT AVG(importe_total) as avg_amount FROM comprobantes_compra 
                       WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado'";
            $stmtAvg = $conn->prepare($sqlAvg);
            $stmtAvg->execute([':start' => $start, ':end' => $end]);
            $avg = $stmtAvg->fetch(PDO::FETCH_ASSOC)['avg_amount'] ?? 0;
            
            if ($avg > 0) {
                $threshold = $avg * 1.5;
                $sql = "SELECT * FROM comprobantes_compra 
                        WHERE fecha_emision BETWEEN :start AND :end AND estado != 'Anulado' AND importe_total > :threshold
                        ORDER BY importe_total DESC";
                $stmt = $conn->prepare($sql);
                $stmt->execute([':start' => $start, ':end' => $end, ':threshold' => $threshold]);
                $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['average' => $avg, 'threshold' => $threshold, 'data' => $results]);
            } else {
                echo json_encode(['average' => 0, 'data' => []]);
            }
            break;

        case 'get_approvals':
            // Check for new potential approvals first (auto-generation for demo)
            // 1. High value purchases (> 10000) not yet in approvals
            $umbral = 10000;
            $sqlNew = "SELECT id, importe_total, proveedor_razon_social FROM comprobantes_compra 
                       WHERE importe_total > :umbral 
                       AND id NOT IN (SELECT referencia_id FROM aprobaciones_compras WHERE tipo_solicitud = 'compra_mayor_umbral')";
            $stmtNew = $conn->prepare($sqlNew);
            $stmtNew->execute([':umbral' => $umbral]);
            $newPurchases = $stmtNew->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($newPurchases as $p) {
                $stmtIns = $conn->prepare("INSERT INTO aprobaciones_compras (tipo_solicitud, referencia_id, descripcion, estado) 
                                           VALUES ('compra_mayor_umbral', :ref, :desc, 'pendiente')");
                $stmtIns->execute([
                    ':ref' => $p['id'],
                    ':desc' => "Compra a {$p['proveedor_razon_social']} por " . number_format($p['importe_total'], 2)
                ]);
            }

            // Return all approvals
            $sql = "SELECT a.*, u.usuario as aprobador 
                    FROM aprobaciones_compras a
                    LEFT JOIN usuarios u ON a.aprobado_por = u.id
                    ORDER BY a.fecha_solicitud DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute();
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'manage_approval':
            if ($rol !== 'admin' && $rol !== 'gerente') {
                http_response_code(403);
                echo json_encode(["message" => "Permiso denegado"]);
                break;
            }
            $data = json_decode(file_get_contents("php://input"), true);
            if (empty($data['id']) || empty($data['status'])) {
                throw new Exception("Datos incompletos");
            }

            $sql = "UPDATE aprobaciones_compras 
                    SET estado = :status, aprobado_por = :user, fecha_respuesta = NOW() 
                    WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':status' => $data['status'],
                ':user' => (is_object($userData) ? $userData->id : $userData['id']),
                ':id' => $data['id']
            ]);
            
            echo json_encode(["message" => "Solicitud actualizada"]);
            break;

        default:
            echo json_encode(["message" => "Acción no válida"]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
$conn = null;
