<?php
include_once '../config/db.php';
require_once '../config/jwt.php';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$startDate = $_GET['start_date'] ?? date('Y-m-01');
$endDate = $_GET['end_date'] ?? date('Y-m-d');

try {
    if ($method === 'GET') {
        switch ($action) {
            case 'reports':
                // 1. Ventas por Área
                $sqlArea = "SELECT COALESCE(a.nombre, 'Sin Área') as area, SUM(c.total_importe) as total
                            FROM comprobantes_electronicos c
                            LEFT JOIN usuarios u ON c.usuario_id = u.id
                            LEFT JOIN areas a ON u.area_id = a.id
                            WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
                            GROUP BY a.nombre
                            ORDER BY total DESC";
                $stmt = $conn->prepare($sqlArea);
                $stmt->execute([':start' => $startDate, ':end' => $endDate]);
                $salesByArea = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // 2. Ventas por Vendedor (Ranking Comercial)
                $sqlSeller = "SELECT u.usuario as vendedor, SUM(c.total_importe) as total, COUNT(*) as cantidad
                              FROM comprobantes_electronicos c
                              LEFT JOIN usuarios u ON c.usuario_id = u.id
                              WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
                              GROUP BY u.usuario 
                              ORDER BY total DESC";
                $stmt = $conn->prepare($sqlSeller);
                $stmt->execute([':start' => $startDate, ':end' => $endDate]);
                $salesBySeller = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // 3. Ventas por Producto
                $sqlProduct = "SELECT d.descripcion, SUM(d.cantidad) as cantidad, SUM(d.valor_venta) as total
                               FROM comprobantes_electronicos_detalle d
                               JOIN comprobantes_electronicos c ON d.comprobante_id = c.id
                               WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'
                               GROUP BY d.descripcion 
                               ORDER BY total DESC LIMIT 10";
                $stmt = $conn->prepare($sqlProduct);
                $stmt->execute([':start' => $startDate, ':end' => $endDate]);
                $salesByProduct = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // 4. Márgenes
                $sqlMargins = "SELECT 
                                SUM(d.valor_venta) as ventas_netas,
                                SUM(d.cantidad * COALESCE(p.precio_compra, 0)) as costo_estimado
                               FROM comprobantes_electronicos_detalle d
                               JOIN comprobantes_electronicos c ON d.comprobante_id = c.id
                               LEFT JOIN productos p ON d.item_codigo = p.codigo_interno
                               WHERE c.fecha_emision BETWEEN :start AND :end AND c.estado != 'Anulado'";
                $stmt = $conn->prepare($sqlMargins);
                $stmt->execute([':start' => $startDate, ':end' => $endDate]);
                $margins = $stmt->fetch(PDO::FETCH_ASSOC);
                
                $margins['margen_bruto'] = $margins['ventas_netas'] - $margins['costo_estimado'];
                $margins['margen_porcentaje'] = $margins['ventas_netas'] > 0 
                    ? ($margins['margen_bruto'] / $margins['ventas_netas']) * 100 
                    : 0;

                // 5. Proyección (Simple Linear based on daily average)
                $currentMonth = date('m');
                $currentYear = date('Y');
                $daysInMonth = date('t');
                $currentDay = date('j');
                
                // Get sales for current month only for projection
                $sqlMonth = "SELECT SUM(total_importe) as total FROM comprobantes_electronicos 
                             WHERE MONTH(fecha_emision) = :m AND YEAR(fecha_emision) = :y AND estado != 'Anulado'";
                $stmt = $conn->prepare($sqlMonth);
                $stmt->execute([':m' => $currentMonth, ':y' => $currentYear]);
                $monthTotal = $stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0;
                
                $dailyAvg = $currentDay > 0 ? $monthTotal / $currentDay : 0;
                $projection = $dailyAvg * $daysInMonth;

                echo json_encode([
                    "by_area" => $salesByArea,
                    "by_seller" => $salesBySeller,
                    "by_product" => $salesByProduct,
                    "margins" => $margins,
                    "projection" => [
                        "current_total" => $monthTotal,
                        "projected_total" => $projection,
                        "daily_average" => $dailyAvg
                    ]
                ]);
                break;

            case 'approvals':
                $status = $_GET['status'] ?? 'pendiente';
                $sql = "SELECT a.*, u.usuario as solicitante 
                        FROM aprobaciones_ventas a
                        JOIN usuarios u ON a.solicitado_por = u.id
                        WHERE a.estado = :status
                        ORDER BY a.fecha_solicitud DESC";
                $stmt = $conn->prepare($sql);
                $stmt->execute([':status' => $status]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                break;
        }
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"));

        switch ($action) {
            case 'manage_approval':
                if (!isset($data->id) || !isset($data->status)) {
                    http_response_code(400);
                    echo json_encode(["message" => "Datos incompletos"]);
                    $conn = null;
                    exit;
                }
                
                $sql = "UPDATE aprobaciones_ventas 
                        SET estado = :status, aprobado_por = :user, fecha_respuesta = NOW() 
                        WHERE id = :id";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':status' => $data->status,
                    ':user' => $userData->data->id,
                    ':id' => $data->id
                ]);
                
                echo json_encode(["message" => "Solicitud actualizada correctamente"]);
                break;
                
            case 'request_approval':
                // Endpoint for sellers to create a request
                if (!isset($data->tipo) || !isset($data->descripcion)) {
                    http_response_code(400);
                    echo json_encode(["message" => "Datos incompletos"]);
                    exit;
                }

                $sql = "INSERT INTO aprobaciones_ventas (tipo, descripcion, data_json, solicitado_por) 
                        VALUES (:tipo, :desc, :json, :user)";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':tipo' => $data->tipo,
                    ':desc' => $data->descripcion,
                    ':json' => json_encode($data->data ?? []),
                    ':user' => $userData->data->id
                ]);
                
                echo json_encode(["message" => "Solicitud enviada correctamente"]);
                break;
        }
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error en el servidor: " . $e->getMessage()]);
}

$conn = null;
