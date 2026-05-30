<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';
$uploadDir = __DIR__ . '/../uploads/calendario_rrss/';
if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    $userData = $jwtHandler->validateToken($token);
    if (!$userData) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    rbac_require($conn, $userData, 'calendario_rrss', $method);
    $userId = (int)($userData->id ?? 0);

    switch ($method) {
        case 'GET':
            if ($action === 'list') {
                $mes = isset($_GET['mes']) ? (int)$_GET['mes'] : (int)date('m');
                $anio = isset($_GET['anio']) ? (int)$_GET['anio'] : (int)date('Y');
                $estado = $_GET['estado'] ?? '';
                $prioridad = $_GET['prioridad'] ?? '';

                $where = "WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?";
                $params = [$anio, $mes];

                if ($estado !== '') {
                    $where .= " AND estado = ?";
                    $params[] = $estado;
                }
                if ($prioridad !== '') {
                    $where .= " AND prioridad = ?";
                    $params[] = $prioridad;
                }

                $stmt = $conn->prepare("SELECT * FROM calendario_rrss $where ORDER BY fecha ASC, prioridad ASC, id ASC");
                $stmt->execute($params);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            } elseif ($action === 'get') {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'ID requerido']);
                    break;
                }
                $stmt = $conn->prepare("SELECT * FROM calendario_rrss WHERE id = ? LIMIT 1");
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    echo json_encode($row);
                } else {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'No encontrado']);
                }
            }
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"), true);

            if ($action === 'create') {
                $tarea = trim($data['tarea'] ?? '');
                if ($tarea === '') {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'La tarea es requerida']);
                    break;
                }
                $fecha = $data['fecha'] ?? date('Y-m-d');
                $estado = $data['estado'] ?? 'pendiente';
                $prioridad = $data['prioridad'] ?? 'media';
                $encargadoId = isset($data['encargado_id']) ? (int)$data['encargado_id'] : null;
                $encargadoNombre = $data['encargado_nombre'] ?? '';
                $tipoProyecto = $data['tipo_proyecto'] ?? '';
                $archivos = $data['archivos'] ?? '[]';

                $stmt = $conn->prepare("INSERT INTO calendario_rrss (tarea, estado, prioridad, encargado_id, encargado_nombre, fecha, tipo_proyecto, archivos, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$tarea, $estado, $prioridad, $encargadoId, $encargadoNombre, $fecha, $tipoProyecto, $archivos, $userId]);
                echo json_encode(['success' => true, 'message' => 'Tarea creada', 'id' => (int)$conn->lastInsertId()]);

            } elseif ($action === 'update') {
                $id = (int)($data['id'] ?? 0);
                if ($id <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'ID requerido']);
                    break;
                }
                $tarea = trim($data['tarea'] ?? '');
                if ($tarea === '') {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'La tarea es requerida']);
                    break;
                }
                $stmt = $conn->prepare("UPDATE calendario_rrss SET tarea = ?, estado = ?, prioridad = ?, encargado_id = ?, encargado_nombre = ?, fecha = ?, tipo_proyecto = ?, archivos = ? WHERE id = ?");
                $stmt->execute([
                    $tarea,
                    $data['estado'] ?? 'pendiente',
                    $data['prioridad'] ?? 'media',
                    isset($data['encargado_id']) ? (int)$data['encargado_id'] : null,
                    $data['encargado_nombre'] ?? '',
                    $data['fecha'] ?? date('Y-m-d'),
                    $data['tipo_proyecto'] ?? '',
                    $data['archivos'] ?? '[]',
                    $id
                ]);
                echo json_encode(['success' => true, 'message' => 'Tarea actualizada']);

            } elseif ($action === 'delete') {
                $id = (int)($data['id'] ?? ($_GET['id'] ?? 0));
                if ($id <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'ID requerido']);
                    break;
                }
                $stmt = $conn->prepare("SELECT archivos FROM calendario_rrss WHERE id = ? LIMIT 1");
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $files = json_decode($row['archivos'] ?? '[]', true);
                    foreach ($files as $f) {
                        $path = __DIR__ . '/../' . ($f['ruta'] ?? '');
                        if (is_file($path)) @unlink($path);
                    }
                }
                $stmt = $conn->prepare("DELETE FROM calendario_rrss WHERE id = ?");
                $stmt->execute([$id]);
                echo json_encode(['success' => true, 'message' => 'Tarea eliminada']);

            } elseif ($action === 'upload_file') {
                if (!isset($_FILES['file'])) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'No se envió archivo']);
                    break;
                }
                $file = $_FILES['file'];
                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                $allowed = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'mp4', 'mov', 'avi', 'mkv', 'zip', 'rar', '7z'];
                if (!in_array($ext, $allowed)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Tipo de archivo no permitido: ' . $ext]);
                    break;
                }
                $maxSize = 50 * 1024 * 1024;
                if ($file['size'] > $maxSize) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Archivo muy grande (máx 50MB)']);
                    break;
                }
                $nombre = uniqid('rrss_') . '.' . $ext;
                $destino = $uploadDir . $nombre;
                if (move_uploaded_file($file['tmp_name'], $destino)) {
                    $rutaRel = 'uploads/calendario_rrss/' . $nombre;
                    echo json_encode([
                        'success' => true,
                        'nombre' => $file['name'],
                        'nombre_archivo' => $nombre,
                        'ruta' => $rutaRel,
                        'ext' => $ext,
                        'size' => $file['size']
                    ]);
                } else {
                    http_response_code(500);
                    echo json_encode(['success' => false, 'message' => 'Error al guardar archivo']);
                }
            } elseif ($action === 'delete_file') {
                $ruta = $data['ruta'] ?? '';
                if ($ruta === '') {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Ruta requerida']);
                    break;
                }
                $path = __DIR__ . '/../' . $ruta;
                if (is_file($path)) @unlink($path);
                echo json_encode(['success' => true, 'message' => 'Archivo eliminado']);
            }
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
