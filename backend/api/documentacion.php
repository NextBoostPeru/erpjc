<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$method = $_SERVER['REQUEST_METHOD'];
$uploadDir = __DIR__ . '/../uploads/documentos/';

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

    rbac_require($conn, $userData, 'documentacion', $method);

    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    if (!is_dir($uploadDir) || !is_writable($uploadDir)) {
        throw new Exception("Directorio de subida no disponible");
    }

    switch ($method) {
        case 'GET':
            $colabId = isset($_GET['colaborador_id']) ? $_GET['colaborador_id'] : null;
            $type = isset($_GET['type']) ? $_GET['type'] : null;
            $alerts = isset($_GET['alerts']) ? true : false;
            $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
            $limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 12;
            $offset = ($page - 1) * $limit;
            $search = isset($_GET['search']) ? trim($_GET['search']) : '';
            $usePagination = isset($_GET['page']) || isset($_GET['limit']) || isset($_GET['search']);

            $baseSql = "FROM documentos_laborales d
                        JOIN colaboradores c ON d.colaborador_id = c.id
                        WHERE 1=1";
            
            $params = [];

            if ($colabId) {
                $baseSql .= " AND d.colaborador_id = ?";
                $params[] = $colabId;
            }
            if ($type) {
                $baseSql .= " AND d.tipo_documento = ?";
                $params[] = $type;
            }
            if ($alerts) {
                // Documents expiring in the next 30 days
                $baseSql .= " AND d.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)";
            }
            if ($search !== '') {
                $baseSql .= " AND (d.nombre_archivo LIKE ? OR d.tipo_documento LIKE ? OR IFNULL(d.comentario,'') LIKE ?)";
                $like = "%{$search}%";
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
            }

            $countSql = "SELECT COUNT(*) " . $baseSql;
            $countStmt = $conn->prepare($countSql);
            $countStmt->execute($params);
            $total = (int)$countStmt->fetchColumn();

            $sql = "SELECT d.*, c.nombres, c.apellidos, c.documento_numero 
                    FROM documentos_laborales d
                    JOIN colaboradores c ON d.colaborador_id = c.id
                    WHERE 1=1";

            if ($colabId) $sql .= " AND d.colaborador_id = ?";
            if ($type) $sql .= " AND d.tipo_documento = ?";
            if ($alerts) $sql .= " AND d.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)";
            if ($search !== '') $sql .= " AND (d.nombre_archivo LIKE ? OR d.tipo_documento LIKE ? OR IFNULL(d.comentario,'') LIKE ?)";

            $sql .= " ORDER BY d.fecha_vencimiento ASC, d.fecha_carga DESC";
            if ($usePagination) {
                $sql .= " LIMIT " . (int)$limit . " OFFSET " . (int)$offset;
            }

            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Process URLs
            foreach ($data as &$row) {
                $row['url'] = '/backend/uploads/documentos/' . $row['nombre_archivo'];
            }

            if ($usePagination) {
                $totalPages = (int)ceil($total / $limit);
                echo json_encode([
                    'data' => $data,
                    'pagination' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'totalPages' => max(1, $totalPages)
                    ]
                ]);
            } else {
                echo json_encode($data);
            }
            break;

        case 'POST':
            if (isset($_GET['action']) && $_GET['action'] === 'update') {
                $data = json_decode(file_get_contents("php://input"), true);
                $id = isset($data['id']) ? (int)$data['id'] : 0;
                $tipo = $data['tipo_documento'] ?? null;
                $fecha_vencimiento = isset($data['fecha_vencimiento']) && $data['fecha_vencimiento'] !== '' ? $data['fecha_vencimiento'] : null;
                $comentario = $data['comentario'] ?? '';

                if (!$id) {
                    http_response_code(400);
                    echo json_encode(['message' => 'ID requerido']);
                    break;
                }
                if (!$tipo) {
                    http_response_code(400);
                    echo json_encode(['message' => 'tipo_documento requerido']);
                    break;
                }

                $stmt = $conn->prepare("UPDATE documentos_laborales SET tipo_documento = ?, fecha_vencimiento = ?, comentario = ? WHERE id = ?");
                $stmt->execute([$tipo, $fecha_vencimiento, $comentario, $id]);
                echo json_encode(['message' => 'Documento actualizado']);
                break;
            }

            $colaborador_id = $_POST['colaborador_id'];
            $tipo = $_POST['tipo_documento'];
            $fecha_vencimiento = !empty($_POST['fecha_vencimiento']) ? $_POST['fecha_vencimiento'] : null;
            $comentario = $_POST['comentario'] ?? '';

            if (isset($_FILES['files'])) {
                // Multiple files
                $files = $_FILES['files'];
                $count = count($files['name']);
                $uploaded = 0;

                for ($i = 0; $i < $count; $i++) {
                    $err = $files['error'][$i];
                    if ($err !== UPLOAD_ERR_OK) {
                        $msg = "Error subiendo archivo";
                        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) $msg = "El archivo excede el tamaño permitido";
                        elseif ($err === UPLOAD_ERR_PARTIAL) $msg = "El archivo se subió parcialmente";
                        elseif ($err === UPLOAD_ERR_NO_FILE) $msg = "No se recibió el archivo";
                        elseif ($err === UPLOAD_ERR_NO_TMP_DIR) $msg = "Falta el directorio temporal";
                        elseif ($err === UPLOAD_ERR_CANT_WRITE) $msg = "No se pudo escribir el archivo en disco";
                        elseif ($err === UPLOAD_ERR_EXTENSION) $msg = "Subida bloqueada por extensión del servidor";
                        throw new Exception($msg);
                    }

                    $originalName = $files['name'][$i] ?? '';
                    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
                    $allowed = ['pdf', 'png', 'jpg', 'jpeg'];
                    if ($ext === '' || !in_array($ext, $allowed, true)) {
                        throw new Exception("Tipo de archivo no permitido");
                    }
                    $size = (int)($files['size'][$i] ?? 0);
                    if ($size <= 0) {
                        throw new Exception("Archivo inválido");
                    }
                    if ($size > 10 * 1024 * 1024) {
                        throw new Exception("El archivo excede el tamaño permitido");
                    }

                    $filename = uniqid() . '_' . time() . '_' . $i . '.' . $ext;
                    $filepath = $uploadDir . $filename;

                    if (!move_uploaded_file($files['tmp_name'][$i], $filepath)) {
                        throw new Exception("No se pudo guardar el archivo");
                    }

                    $stmt = $conn->prepare("INSERT INTO documentos_laborales (colaborador_id, tipo_documento, nombre_archivo, ruta_archivo, fecha_vencimiento, comentario) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$colaborador_id, $tipo, $filename, $filepath, $fecha_vencimiento, $comentario]);
                    $uploaded++;
                }
                
                if ($uploaded > 0) {
                    echo json_encode(['message' => "$uploaded documentos subidos correctamente"]);
                } else {
                    throw new Exception("No se pudieron subir los archivos");
                }

            } elseif (isset($_FILES['file'])) {
                // Single file (legacy support)
                $file = $_FILES['file'];
                if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                    $err = $file['error'];
                    $msg = "Error subiendo archivo";
                    if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) $msg = "El archivo excede el tamaño permitido";
                    elseif ($err === UPLOAD_ERR_PARTIAL) $msg = "El archivo se subió parcialmente";
                    elseif ($err === UPLOAD_ERR_NO_FILE) $msg = "No se recibió el archivo";
                    elseif ($err === UPLOAD_ERR_NO_TMP_DIR) $msg = "Falta el directorio temporal";
                    elseif ($err === UPLOAD_ERR_CANT_WRITE) $msg = "No se pudo escribir el archivo en disco";
                    elseif ($err === UPLOAD_ERR_EXTENSION) $msg = "Subida bloqueada por extensión del servidor";
                    throw new Exception($msg);
                }

                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                $allowed = ['pdf', 'png', 'jpg', 'jpeg'];
                if ($ext === '' || !in_array($ext, $allowed, true)) {
                    throw new Exception("Tipo de archivo no permitido");
                }
                $size = (int)($file['size'] ?? 0);
                if ($size <= 0) {
                    throw new Exception("Archivo inválido");
                }
                if ($size > 10 * 1024 * 1024) {
                    throw new Exception("El archivo excede el tamaño permitido");
                }

                $filename = uniqid() . '_' . time() . '.' . $ext;
                $filepath = $uploadDir . $filename;

                if (move_uploaded_file($file['tmp_name'], $filepath)) {
                    $stmt = $conn->prepare("INSERT INTO documentos_laborales (colaborador_id, tipo_documento, nombre_archivo, ruta_archivo, fecha_vencimiento, comentario) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$colaborador_id, $tipo, $filename, $filepath, $fecha_vencimiento, $comentario]);
                    echo json_encode(['message' => 'Documento subido correctamente']);
                } else {
                    throw new Exception("No se pudo guardar el archivo");
                }
            } else {
                throw new Exception("No se han seleccionado archivos");
            }
            break;

        case 'DELETE':
            $id = $_GET['id'];
            
            // Get file path
            $stmt = $conn->prepare("SELECT ruta_archivo FROM documentos_laborales WHERE id = ?");
            $stmt->execute([$id]);
            $doc = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($doc) {
                if (file_exists($doc['ruta_archivo'])) {
                    unlink($doc['ruta_archivo']);
                }
                $conn->prepare("DELETE FROM documentos_laborales WHERE id = ?")->execute([$id]);
                echo json_encode(['message' => 'Documento eliminado']);
            } else {
                throw new Exception("Documento no encontrado");
            }
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['message' => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
