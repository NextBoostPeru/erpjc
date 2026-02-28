<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

$method = $_SERVER['REQUEST_METHOD'];
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user = $jwt->validateToken($token);
$user = (array)$user; // Convertir a array para mantener compatibilidad

if (!$user || empty($user)) {
    http_response_code(401);
    if (isset($conn)) $conn = null;
    exit;
}

function inputJson() {
    return json_decode(file_get_contents("php://input"), true);
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    $fecha_inicio = $_GET['fecha_inicio'] ?? date('Y-m-01');
    $fecha_fin = $_GET['fecha_fin'] ?? date('Y-m-t');
    $estado = $_GET['estado'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM ordenes_trabajo WHERE id = ?");
            $stmt->execute([$id]);
            $orden = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$orden) {
                http_response_code(404);
                echo json_encode(['error' => 'Orden no encontrada']);
                exit;
            }
            $dstmt = $conn->prepare("SELECT * FROM ordenes_trabajo_tareas WHERE orden_id = ?");
            $dstmt->execute([$id]);
            $orden['tareas'] = $dstmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($orden);
        } else {
            $sql = "SELECT * FROM ordenes_trabajo WHERE fecha BETWEEN ? AND ?";
            $params = [$fecha_inicio, $fecha_fin];
            if ($estado) {
                $sql .= " AND estado = ?";
                $params[] = $estado;
            }
            $sql .= " ORDER BY created_at DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'POST') {
    $data = inputJson();
    try {
        $conn->beginTransaction();
        $codigo = $data['codigo'] ?? null;
        if (!$codigo) {
            $stmtMax = $conn->query("SELECT MAX(id) as max_id FROM ordenes_trabajo");
            $row = $stmtMax->fetch(PDO::FETCH_ASSOC);
            $next = ($row['max_id'] ?? 0) + 1;
            $codigo = 'OT-' . str_pad($next, 6, '0', STR_PAD_LEFT);
        }
        $stmt = $conn->prepare("
            INSERT INTO ordenes_trabajo
            (codigo, titulo, descripcion, fecha, prioridad, estado, responsable_id, area, inicio, fin, lugar_trabajo, solicitante_nombre, solicitante_dni, solicitante_cargo, costo_estimado, costo_real, usuario_id)
            VALUES (?, ?, ?, ?, ?, 'Abierta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $codigo,
            $data['titulo'],
            $data['descripcion'] ?? '',
            $data['fecha'] ?? date('Y-m-d'),
            $data['prioridad'] ?? 'Media',
            !empty($data['responsable_id']) ? $data['responsable_id'] : null,
            $data['area'] ?? null,
            !empty($data['inicio']) ? $data['inicio'] : null,
            !empty($data['fin']) ? $data['fin'] : null,
            $data['lugar_trabajo'] ?? null,
            $data['solicitante_nombre'] ?? null,
            $data['solicitante_dni'] ?? null,
            $data['solicitante_cargo'] ?? null,
            $data['costo_estimado'] ?? 0,
            $data['costo_real'] ?? 0,
            $user['id']
        ]);
        $orden_id = $conn->lastInsertId();
        if (!empty($data['tareas']) && is_array($data['tareas'])) {
            $dstmt = $conn->prepare("
                INSERT INTO ordenes_trabajo_tareas (orden_id, descripcion, detalles, encargado_id, fecha_limite, estado)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($data['tareas'] as $t) {
                $dstmt->execute([
                    $orden_id,
                    $t['descripcion'],
                    $t['detalles'] ?? null,
                    $t['encargado_id'] ?? null,
                    $t['fecha_limite'] ?? null,
                    $t['estado'] ?? 'Pendiente'
                ]);
            }
        }
        $conn->commit();
        echo json_encode(['success' => true, 'id' => $orden_id, 'codigo' => $codigo]);
    } catch (Exception $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'PUT') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'ID requerido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    $data = inputJson();
    $action = $data['action'] ?? null;
    try {
        if ($action === 'cambiar_estado') {
            $estado = $data['estado'] ?? null;
            $stmt = $conn->prepare("UPDATE ordenes_trabajo SET estado = ? WHERE id = ?");
            $stmt->execute([$estado, $id]);
            echo json_encode(['success' => true]);
        } elseif ($action === 'agregar_tarea') {
            $dstmt = $conn->prepare("
                INSERT INTO ordenes_trabajo_tareas (orden_id, descripcion, detalles, encargado_id, fecha_limite, estado)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $dstmt->execute([
                $id,
                $data['descripcion'],
                $data['detalles'] ?? null,
                $data['encargado_id'] ?? null,
                $data['fecha_limite'] ?? null,
                $data['estado'] ?? 'Pendiente'
            ]);
            echo json_encode(['success' => true]);
        } elseif ($action === 'actualizar') {
            $conn->beginTransaction();
            $stmt = $conn->prepare("
                UPDATE ordenes_trabajo SET
                titulo = ?, descripcion = ?, fecha = ?, prioridad = ?, responsable_id = ?, area = ?, inicio = ?, fin = ?, lugar_trabajo = ?, solicitante_nombre = ?, solicitante_dni = ?, solicitante_cargo = ?, costo_estimado = ?, costo_real = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $data['titulo'],
                $data['descripcion'] ?? '',
                $data['fecha'] ?? date('Y-m-d'),
                $data['prioridad'] ?? 'Media',
                !empty($data['responsable_id']) ? $data['responsable_id'] : null,
                $data['area'] ?? null,
                !empty($data['inicio']) ? $data['inicio'] : null,
                !empty($data['fin']) ? $data['fin'] : null,
                $data['lugar_trabajo'] ?? null,
                $data['solicitante_nombre'] ?? null,
                $data['solicitante_dni'] ?? null,
                $data['solicitante_cargo'] ?? null,
                $data['costo_estimado'] ?? 0,
                $data['costo_real'] ?? 0,
                $id
            ]);

            // Actualizar tareas (estrategia: eliminar y recrear para simplificar sincronización)
            $stmtDel = $conn->prepare("DELETE FROM ordenes_trabajo_tareas WHERE orden_id = ?");
            $stmtDel->execute([$id]);

            if (!empty($data['tareas']) && is_array($data['tareas'])) {
                $dstmt = $conn->prepare("
                    INSERT INTO ordenes_trabajo_tareas (orden_id, descripcion, detalles, encargado_id, fecha_limite, estado)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                foreach ($data['tareas'] as $t) {
                    $dstmt->execute([
                        $id,
                        $t['descripcion'],
                        $t['detalles'] ?? null,
                        $t['encargado_id'] ?? null,
                        $t['fecha_limite'] ?? null,
                        $t['estado'] ?? 'Pendiente'
                    ]);
                }
            }

            $conn->commit();
            echo json_encode(['success' => true]);
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Acción no válida']);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'ID requerido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    try {
        $conn->beginTransaction();
        
        // Eliminar tareas asociadas primero
        $stmtTareas = $conn->prepare("DELETE FROM ordenes_trabajo_tareas WHERE orden_id = ?");
        $stmtTareas->execute([$id]);

        // Eliminar la orden
        $stmt = $conn->prepare("DELETE FROM ordenes_trabajo WHERE id = ?");
        $stmt->execute([$id]);
        
        $conn->commit();
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

$conn = null;
?>
