<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once __DIR__ . '/helpers/StockHelper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function ensureTables($conn) {
    $conn->exec("CREATE TABLE IF NOT EXISTS alquileres (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente_tipo_doc CHAR(1) DEFAULT '6',
        cliente_num_doc VARCHAR(15) NOT NULL,
        cliente_razon_social VARCHAR(255) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        almacen_id INT NULL,
        estado VARCHAR(30) DEFAULT 'Activo',
        alert_days INT DEFAULT 3,
        observaciones TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $conn->exec("CREATE TABLE IF NOT EXISTS alquileres_detalle (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alquiler_id INT NOT NULL,
        item_tipo VARCHAR(20) NOT NULL,
        producto_id INT NULL,
        descripcion VARCHAR(255) NULL,
        cantidad INT NOT NULL,
        tarifa_diaria DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $conn->exec("CREATE TABLE IF NOT EXISTS alquileres_recojos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alquiler_id INT NOT NULL,
        pickup_date DATE NOT NULL,
        estado VARCHAR(20) DEFAULT 'Programado',
        notas TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

try {
    ensureTables($conn);

    if ($method === 'GET') {
        if ($action === 'listar') {
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
            $offset = ($page - 1) * $limit;
            $search = isset($_GET['search']) ? trim($_GET['search']) : '';
            $status = isset($_GET['status']) ? trim($_GET['status']) : '';
            $type = isset($_GET['type']) ? trim($_GET['type']) : '';

            $where = [];
            $params = [];
            if ($search !== '') {
                $where[] = "(cliente_razon_social LIKE :search OR cliente_num_doc LIKE :search)";
                $params[':search'] = "%$search%";
            }
            if ($status !== '') {
                $where[] = "estado = :estado";
                $params[':estado'] = $status;
            }
            if ($type !== '') {
                $where[] = "tipo = :tipo";
                $params[':tipo'] = $type;
            }
            $whereSql = count($where) ? "WHERE " . implode(" AND ", $where) : "";

            $stmtCount = $conn->prepare("SELECT COUNT(*) FROM alquileres $whereSql");
            $stmtCount->execute($params);
            $total = (int)$stmtCount->fetchColumn();

            $sql = "SELECT * FROM alquileres $whereSql ORDER BY fecha_fin ASC, id DESC LIMIT :limit OFFSET :offset";
            $stmt = $conn->prepare($sql);
            foreach ($params as $k => $v) $stmt->bindValue($k, $v);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($rows)) {
                $ids = implode(',', array_map(function($r){ return (int)$r['id']; }, $rows));
                $detStmt = $conn->query("SELECT * FROM alquileres_detalle WHERE alquiler_id IN ($ids)");
                $detRows = $detStmt->fetchAll(PDO::FETCH_ASSOC);
                $detMap = [];
                foreach ($detRows as $d) { $detMap[$d['alquiler_id']][] = $d; }
                foreach ($rows as &$r) {
                    $di = new DateTime($r['fecha_inicio']);
                    $df = new DateTime($r['fecha_fin']);
                    $days = $di->diff($df)->days + 1;
                    $r['dias'] = $days;
                    $rem = (new DateTime())->diff($df)->days;
                    $r['dias_restantes'] = ($df >= new DateTime(date('Y-m-d'))) ? $rem : 0;
                    $r['detalles'] = $detMap[$r['id']] ?? [];
                }
            }

            echo json_encode([
                'data' => is_array($rows) ? $rows : [],
                'pagination' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int)ceil($total / $limit) : 1
                ]
            ]);
        } elseif ($action === 'alertas') {
            $stmt = $conn->query("SELECT * FROM alquileres WHERE estado IN ('Activo','Recojo Programado')");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $today = new DateTime(date('Y-m-d'));
            $alerts = [];
            foreach ($rows as $r) {
                $df = new DateTime($r['fecha_fin']);
                $diff = $today->diff($df)->days;
                $isSoon = ($df >= $today) && ($diff <= (int)$r['alert_days']);
                if ($isSoon) {
                    $alerts[] = $r;
                }
            }
            echo json_encode(['data' => $alerts]);
        } elseif ($action === 'detalles') {
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['message' => 'ID requerido']);
                exit;
            }
            $stmt = $conn->prepare("SELECT * FROM alquileres WHERE id = ?");
            $stmt->execute([$id]);
            $alquiler = $stmt->fetch(PDO::FETCH_ASSOC);
            $det = $conn->prepare("SELECT * FROM alquileres_detalle WHERE alquiler_id = ?");
            $det->execute([$id]);
            $items = $det->fetchAll(PDO::FETCH_ASSOC);
            $rec = $conn->prepare("SELECT * FROM alquileres_recojos WHERE alquiler_id = ? ORDER BY created_at DESC");
            $rec->execute([$id]);
            $recojos = $rec->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['alquiler' => $alquiler, 'detalles' => $items, 'recojos' => $recojos]);
        } else {
            echo json_encode([]);
        }
    } elseif ($method === 'POST') {
        if ($action === 'crear') {
            $data = json_decode(file_get_contents("php://input"), true);
            $conn->beginTransaction();
            try {
                $stmt = $conn->prepare("INSERT INTO alquileres (cliente_tipo_doc, cliente_num_doc, cliente_razon_social, tipo, fecha_inicio, fecha_fin, almacen_id, estado, alert_days, observaciones) VALUES (:ctipo, :cnum, :crazon, :tipo, :inicio, :fin, :almacen, 'Activo', :alert, :obs)");
                $stmt->execute([
                    ':ctipo' => $data['cliente_tipo_doc'] ?? '6',
                    ':cnum' => $data['cliente_num_doc'],
                    ':crazon' => $data['cliente_razon_social'],
                    ':tipo' => $data['tipo'],
                    ':inicio' => $data['fecha_inicio'],
                    ':fin' => $data['fecha_fin'],
                    ':almacen' => $data['almacen_id'] ?? null,
                    ':alert' => $data['alert_days'] ?? 3,
                    ':obs' => $data['observaciones'] ?? null
                ]);
                $alquilerId = $conn->lastInsertId();

                if (isset($data['detalles']) && is_array($data['detalles'])) {
                    $stmtDet = $conn->prepare("INSERT INTO alquileres_detalle (alquiler_id, item_tipo, producto_id, descripcion, cantidad, tarifa_diaria) VALUES (:aid, :itipo, :pid, :desc, :cant, :tarifa)");
                    foreach ($data['detalles'] as $d) {
                        $stmtDet->execute([
                            ':aid' => $alquilerId,
                            ':itipo' => $d['item_tipo'],
                            ':pid' => $d['producto_id'] ?? null,
                            ':desc' => $d['descripcion'] ?? null,
                            ':cant' => $d['cantidad'],
                            ':tarifa' => $d['tarifa_diaria'] ?? 0
                        ]);
                    }
                }

                if ($data['tipo'] === 'andamio' && !empty($data['almacen_id'])) {
                    $itemsMov = [];
                    foreach ($data['detalles'] as $d) {
                        if (!empty($d['producto_id']) && (int)$d['cantidad'] > 0) {
                            $itemsMov[] = [
                                'producto_id' => (int)$d['producto_id'],
                                'cantidad' => (int)$d['cantidad'],
                                'costo_unitario' => 0
                            ];
                        }
                    }
                    if (!empty($itemsMov)) {
                        $stockHelper = new StockHelper($conn);
                        $stockHelper->registrarMovimiento([
                            'almacen_id' => (int)$data['almacen_id'],
                            'usuario_id' => (int)$userData->id,
                            'motivo' => 'alquiler',
                            'tipo' => 'salida',
                            'items' => $itemsMov,
                            'documento_referencia' => 'ALQ-' . $alquilerId
                        ]);
                    }
                }

                $conn->commit();
                echo json_encode(['message' => 'Alquiler creado', 'id' => $alquilerId]);
            } catch (Exception $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                http_response_code(500);
                echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
            }
        } elseif ($action === 'programar_recojo') {
            $data = json_decode(file_get_contents("php://input"), true);
            $id = (int)($data['alquiler_id'] ?? 0);
            $fecha = $data['pickup_date'] ?? null;
            $notas = $data['notas'] ?? null;
            if ($id <= 0 || !$fecha) {
                http_response_code(400);
                echo json_encode(['message' => 'Datos requeridos']);
                exit;
            }
            $conn->beginTransaction();
            try {
                $conn->prepare("UPDATE alquileres SET estado = 'Recojo Programado' WHERE id = ?")->execute([$id]);
                $conn->prepare("INSERT INTO alquileres_recojos (alquiler_id, pickup_date, estado, notas) VALUES (?, ?, 'Programado', ?)")->execute([$id, $fecha, $notas]);
                $conn->commit();
                echo json_encode(['message' => 'Recojo programado']);
            } catch (Exception $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                http_response_code(500);
                echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
            }
        } elseif ($action === 'confirmar_recojo') {
            $data = json_decode(file_get_contents("php://input"), true);
            $id = (int)($data['alquiler_id'] ?? 0);
            $fecha = $data['pickup_date'] ?? date('Y-m-d');
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['message' => 'ID requerido']);
                exit;
            }
            $conn->beginTransaction();
            try {
                $stmtAlq = $conn->prepare("SELECT * FROM alquileres WHERE id = ?");
                $stmtAlq->execute([$id]);
                $alq = $stmtAlq->fetch(PDO::FETCH_ASSOC);
                $conn->prepare("UPDATE alquileres SET estado = 'Recogido' WHERE id = ?")->execute([$id]);
                $conn->prepare("UPDATE alquileres_recojos SET estado = 'Completado' WHERE alquiler_id = ? AND pickup_date = ?")->execute([$id, $fecha]);
                if ($alq && $alq['tipo'] === 'andamio' && !empty($alq['almacen_id'])) {
                    $det = $conn->prepare("SELECT * FROM alquileres_detalle WHERE alquiler_id = ?");
                    $det->execute([$id]);
                    $itemsDet = $det->fetchAll(PDO::FETCH_ASSOC);
                    $itemsMov = [];
                    foreach ($itemsDet as $d) {
                        if (!empty($d['producto_id']) && (int)$d['cantidad'] > 0) {
                            $itemsMov[] = [
                                'producto_id' => (int)$d['producto_id'],
                                'cantidad' => (int)$d['cantidad'],
                                'costo_unitario' => 0
                            ];
                        }
                    }
                    if (!empty($itemsMov)) {
                        $stockHelper = new StockHelper($conn);
                        $stockHelper->registrarMovimiento([
                            'almacen_id' => (int)$alq['almacen_id'],
                            'usuario_id' => (int)$userData->id,
                            'motivo' => 'alquiler retorno',
                            'tipo' => 'entrada',
                            'items' => $itemsMov,
                            'documento_referencia' => 'ALQ-RET-' . $id
                        ]);
                    }
                }
                $conn->commit();
                echo json_encode(['message' => 'Recojo confirmado']);
            } catch (Exception $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                http_response_code(500);
                echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
            }
        } elseif ($action === 'editar') {
            $data = json_decode(file_get_contents("php://input"), true);
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['message' => 'ID requerido']);
                exit;
            }
            try {
                $stmt = $conn->prepare("UPDATE alquileres SET cliente_tipo_doc = :ctipo, cliente_num_doc = :cnum, cliente_razon_social = :crazon, tipo = :tipo, fecha_inicio = :inicio, fecha_fin = :fin, almacen_id = :almacen, alert_days = :alert, observaciones = :obs WHERE id = :id");
                $stmt->execute([
                    ':ctipo' => $data['cliente_tipo_doc'] ?? '6',
                    ':cnum' => $data['cliente_num_doc'],
                    ':crazon' => $data['cliente_razon_social'],
                    ':tipo' => $data['tipo'],
                    ':inicio' => $data['fecha_inicio'],
                    ':fin' => $data['fecha_fin'],
                    ':almacen' => $data['almacen_id'] ?? null,
                    ':alert' => $data['alert_days'] ?? 3,
                    ':obs' => $data['observaciones'] ?? null,
                    ':id' => $id
                ]);
                echo json_encode(['message' => 'Alquiler actualizado']);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
            }
        } elseif ($action === 'cancelar') {
            $data = json_decode(file_get_contents("php://input"), true);
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['message' => 'ID requerido']);
                exit;
            }
            try {
                $conn->prepare("UPDATE alquileres SET estado = 'Cancelado' WHERE id = ?")->execute([$id]);
                echo json_encode(['message' => 'Alquiler cancelado']);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
            }
        } elseif ($action === 'eliminar') {
            $data = json_decode(file_get_contents("php://input"), true);
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['message' => 'ID requerido']);
                exit;
            }
            try {
                $conn->beginTransaction();
                $conn->prepare("DELETE FROM alquileres_detalle WHERE alquiler_id = ?")->execute([$id]);
                $conn->prepare("DELETE FROM alquileres_recojos WHERE alquiler_id = ?")->execute([$id]);
                $conn->prepare("DELETE FROM alquileres WHERE id = ?")->execute([$id]);
                $conn->commit();
                echo json_encode(['message' => 'Alquiler eliminado']);
            } catch (Exception $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                http_response_code(500);
                echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
            }
        } else {
            echo json_encode([]);
        }
    } else {
        echo json_encode([]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
}
?>
