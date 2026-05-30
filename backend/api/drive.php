<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? strtolower(trim((string)$_GET['action'])) : '';
$uploadDir = __DIR__ . '/../uploads/drive/';

function drive_ensure_schema(PDO $conn): void {
    try {
        $conn->exec("
            CREATE TABLE IF NOT EXISTS drive_folders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                parent_id INT NULL,
                nombre VARCHAR(150) NOT NULL,
                created_by INT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_parent (parent_id),
                INDEX idx_nombre (nombre),
                INDEX idx_created_by (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (Throwable $e) {
    }

    try {
        $conn->exec("
            CREATE TABLE IF NOT EXISTS drive_files (
                id INT AUTO_INCREMENT PRIMARY KEY,
                folder_id INT NULL,
                nombre VARCHAR(255) NULL,
                nombre_original VARCHAR(255) NULL,
                nombre_archivo VARCHAR(255) NOT NULL,
                ruta_archivo VARCHAR(255) NOT NULL,
                mime VARCHAR(100) NULL,
                ext VARCHAR(20) NULL,
                size_bytes BIGINT NULL,
                created_by INT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_folder (folder_id),
                INDEX idx_nombre (nombre),
                INDEX idx_created_by (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (Throwable $e) {
    }

    try {
        $conn->exec("
            CREATE TABLE IF NOT EXISTS drive_compartidos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                folder_id INT NULL,
                file_id INT NULL,
                usuario_id INT NOT NULL,
                nivel VARCHAR(20) DEFAULT 'lectura',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_folder (folder_id),
                INDEX idx_file (file_id),
                INDEX idx_usuario (usuario_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (Throwable $e) {
    }
}

function drive_sanitize_name(string $name, int $maxLen = 255): string {
    $name = trim($name);
    $name = preg_replace('/[^\p{L}\p{N}\s\.\-\_\(\)]+/u', '', $name);
    $name = preg_replace('/\s+/', ' ', (string)$name);
    $name = trim((string)$name);
    if ($maxLen > 0) $name = mb_substr($name, 0, $maxLen);
    return $name;
}

function drive_mime_for_ext(string $ext): string {
    $ext = strtolower(trim($ext));
    return match ($ext) {
        'pdf' => 'application/pdf',
        'png' => 'image/png',
        'jpg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
        'txt' => 'text/plain',
        'csv' => 'text/csv',
        'zip' => 'application/zip',
        'rar' => 'application/vnd.rar',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'mp4' => 'video/mp4',
        'mov' => 'video/quicktime',
        'avi' => 'video/x-msvideo',
        'mkv' => 'video/x-matroska',
        'webm' => 'video/webm',
        'wmv' => 'video/x-ms-wmv',
        'flv' => 'video/x-flv',
        default => 'application/octet-stream'
    };
}

function drive_get_breadcrumbs(PDO $conn, ?int $folderId): array {
    if (!$folderId || $folderId <= 0) return [];
    $trail = [];
    $current = $folderId;
    $guard = 0;
    while ($current && $guard < 50) {
        $guard++;
        $stmt = $conn->prepare("SELECT id, parent_id, nombre FROM drive_folders WHERE id = ? LIMIT 1");
        $stmt->execute([$current]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) break;
        $trail[] = ['id' => (int)$row['id'], 'nombre' => (string)$row['nombre']];
        $pid = $row['parent_id'];
        $current = $pid !== null ? (int)$pid : 0;
    }
    return array_reverse($trail);
}

function drive_ensure_upload_dir(string $dir): void {
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
}

function drive_own_or_shared_sql(string $alias, string $userIdParam): string {
    return "($alias.created_by = $userIdParam OR $alias.id IN (SELECT folder_id FROM drive_compartidos WHERE usuario_id = $userIdParam AND folder_id IS NOT NULL))";
}

function drive_can_access_folder(PDO $conn, int $userId, ?int $folderId): bool {
    if ($folderId === null || $folderId <= 0) return true;
    $stmt = $conn->prepare("SELECT 1 FROM drive_folders WHERE id = ? AND (created_by IS NULL OR created_by = ? OR id IN (SELECT folder_id FROM drive_compartidos WHERE usuario_id = ? AND folder_id = ?)) LIMIT 1");
    $stmt->execute([$folderId, $userId, $userId, $folderId]);
    return (bool)$stmt->fetchColumn();
}

function drive_can_write_folder(PDO $conn, int $userId, ?int $folderId): bool {
    if ($folderId === null || $folderId <= 0) return true;
    $stmt = $conn->prepare("SELECT 1 FROM drive_folders WHERE id = ? AND (created_by IS NULL OR created_by = ? OR id IN (SELECT folder_id FROM drive_compartidos WHERE usuario_id = ? AND folder_id = ? AND nivel = 'escritura')) LIMIT 1");
    $stmt->execute([$folderId, $userId, $userId, $folderId]);
    return (bool)$stmt->fetchColumn();
}

function drive_can_access_file(PDO $conn, int $userId, int $fileId): bool {
    $stmt = $conn->prepare("SELECT f.id, f.folder_id, f.created_by FROM drive_files f WHERE f.id = ? LIMIT 1");
    $stmt->execute([$fileId]);
    $file = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$file) return false;
    if ($file['created_by'] === null || (int)$file['created_by'] === $userId) return true;
    $stmt = $conn->prepare("SELECT 1 FROM drive_compartidos WHERE file_id = ? AND usuario_id = ? LIMIT 1");
    $stmt->execute([$fileId, $userId]);
    if ($stmt->fetchColumn()) return true;
    $fid = $file['folder_id'];
    if ($fid !== null) {
        return drive_can_access_folder($conn, $userId, (int)$fid);
    }
    return false;
}

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

    rbac_require($conn, $userData, 'drive', $method);
    drive_ensure_schema($conn);
    drive_ensure_upload_dir($uploadDir);

    if (!is_dir($uploadDir) || !is_writable($uploadDir)) {
        throw new Exception("Directorio de subida no disponible");
    }

    $userId = isset($userData->id) ? (int)$userData->id : (isset($userData->user_id) ? (int)$userData->user_id : 0);

    if ($method === 'GET') {
        if ($action === 'tree') {
            $stmt = $conn->prepare("SELECT id, parent_id, nombre FROM drive_folders WHERE created_by IS NULL OR created_by = ? OR id IN (SELECT folder_id FROM drive_compartidos WHERE usuario_id = ? AND folder_id IS NOT NULL) ORDER BY COALESCE(parent_id, 0) ASC, nombre ASC, id ASC LIMIT 2000");
            $stmt->execute([$userId, $userId]);
            $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
            echo json_encode(['success' => true, 'folders' => $rows]);
            exit;
        }

        if ($action === 'file') {
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['message' => 'ID requerido']);
                exit;
            }

            if (!drive_can_access_file($conn, $userId, $id)) {
                http_response_code(403);
                echo json_encode(['message' => 'No tienes acceso a este archivo']);
                exit;
            }

            $stmt = $conn->prepare("SELECT id, nombre, nombre_original, ruta_archivo, mime, ext FROM drive_files WHERE id = ? LIMIT 1");
            $stmt->execute([$id]);
            $doc = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$doc) {
                http_response_code(404);
                echo json_encode(['message' => 'Archivo no encontrado']);
                exit;
            }

            $path = (string)($doc['ruta_archivo'] ?? '');
            $realUpload = realpath($uploadDir) ?: $uploadDir;
            $realPath = $path !== '' ? realpath($path) : false;
            if (!$realPath || strpos($realPath, $realUpload) !== 0 || !is_file($realPath)) {
                http_response_code(404);
                echo json_encode(['message' => 'Archivo no disponible']);
                exit;
            }

            $ext = strtolower((string)($doc['ext'] ?? pathinfo($realPath, PATHINFO_EXTENSION)));
            $mime = (string)($doc['mime'] ?? '');
            if ($mime === '') $mime = drive_mime_for_ext($ext);

            $baseName = drive_sanitize_name((string)($doc['nombre'] ?? ''), 200);
            $fallbackName = drive_sanitize_name((string)($doc['nombre_original'] ?? ''), 200);
            $filename = $baseName !== '' ? $baseName : ($fallbackName !== '' ? $fallbackName : basename($realPath));
            if ($ext !== '' && stripos($filename, '.' . $ext) === false) {
                $filename .= '.' . $ext;
            }

            $download = isset($_GET['download']) && ((string)$_GET['download'] === '1' || strtolower((string)$_GET['download']) === 'true');
            header_remove('Content-Type');
            header('Content-Type: ' . $mime);
            header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="' . str_replace('"', '', $filename) . '"');
            header('Content-Length: ' . (string)filesize($realPath));
            readfile($realPath);
            exit;
        }

        if ($action === 'list') {
            $folderId = isset($_GET['folder_id']) ? (int)$_GET['folder_id'] : 0;
            $fid = $folderId > 0 ? $folderId : null;
            $page = max(1, (int)($_GET['page'] ?? 1));
            $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 50)));
            $offset = ($page - 1) * $perPage;

            if ($fid && !drive_can_access_folder($conn, $userId, $fid)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'No tienes acceso a esta carpeta']);
                exit;
            }

            $folderFilter = $fid === null ? 'parent_id IS NULL' : 'parent_id = ?';
            $folderParams = $fid !== null ? [$fid] : [];
            $userClause = "(created_by IS NULL OR created_by = ? OR id IN (SELECT folder_id FROM drive_compartidos WHERE usuario_id = ? AND folder_id IS NOT NULL))";
            $sqlF = "SELECT id, parent_id, nombre, created_at, updated_at FROM drive_folders WHERE $folderFilter AND $userClause ORDER BY nombre ASC, id ASC LIMIT 500";
            $stmtF = $conn->prepare($sqlF);
            if ($fid !== null) {
                $stmtF->execute(array_merge($folderParams, [$userId, $userId]));
            } else {
                $stmtF->execute([$userId, $userId]);
            }
            $folders = $stmtF ? $stmtF->fetchAll(PDO::FETCH_ASSOC) : [];

            $fileWhere = $fid === null ? 'folder_id IS NULL' : 'folder_id = ?';
            $fileParams = $fid !== null ? [$fid] : [];
            $limitClause = "LIMIT " . (int)$perPage . " OFFSET " . (int)$offset;

            $stmtCount = $conn->prepare("SELECT COUNT(*) FROM drive_files WHERE $fileWhere AND (created_by IS NULL OR created_by = ? OR id IN (SELECT file_id FROM drive_compartidos WHERE usuario_id = ? AND file_id IS NOT NULL) OR folder_id IN (SELECT folder_id FROM drive_compartidos WHERE usuario_id = ? AND folder_id IS NOT NULL))");
            if ($fid !== null) {
                $stmtCount->execute(array_merge($fileParams, [$userId, $userId, $userId]));
            } else {
                $stmtCount->execute([$userId, $userId, $userId]);
            }
            $totalFiles = (int)($stmtCount->fetchColumn() ?: 0);

            $sqlD = "SELECT id, folder_id, nombre, nombre_original, mime, ext, size_bytes, created_at, updated_at, created_by FROM drive_files WHERE $fileWhere AND (created_by IS NULL OR created_by = ? OR id IN (SELECT file_id FROM drive_compartidos WHERE usuario_id = ? AND file_id IS NOT NULL) OR folder_id IN (SELECT folder_id FROM drive_compartidos WHERE usuario_id = ? AND folder_id IS NOT NULL)) ORDER BY updated_at DESC, id DESC $limitClause";
            $stmtD = $conn->prepare($sqlD);
            if ($fid !== null) {
                $stmtD->execute(array_merge($fileParams, [$userId, $userId, $userId]));
            } else {
                $stmtD->execute([$userId, $userId, $userId]);
            }
            $files = $stmtD ? $stmtD->fetchAll(PDO::FETCH_ASSOC) : [];

            echo json_encode([
                'success' => true,
                'folder_id' => $fid,
                'breadcrumbs' => drive_get_breadcrumbs($conn, $fid),
                'folders' => $folders,
                'files' => $files,
                'page' => $page,
                'per_page' => $perPage,
                'total_files' => $totalFiles,
                'total_pages' => $totalFiles > 0 ? (int)ceil($totalFiles / $perPage) : 1
            ]);
            exit;
        }

        if ($action === 'listar_compartidos') {
            $type = isset($_GET['type']) ? strtolower(trim((string)$_GET['type'])) : '';
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id <= 0 || ($type !== 'folder' && $type !== 'file')) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Parámetros inválidos']);
                exit;
            }

            if ($type === 'folder') {
                $stmt = $conn->prepare("SELECT 1 FROM drive_folders WHERE id = ? AND created_by = ? LIMIT 1");
            } else {
                $stmt = $conn->prepare("SELECT 1 FROM drive_files WHERE id = ? AND created_by = ? LIMIT 1");
            }
            $stmt->execute([$id, $userId]);
            if (!$stmt->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Solo el propietario puede ver los compartidos']);
                exit;
            }

            if ($type === 'folder') {
                $stmt = $conn->prepare("SELECT c.id, c.usuario_id, c.nivel, c.created_at, u.usuario, u.nombre_real FROM drive_compartidos c LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.folder_id = ? ORDER BY c.created_at DESC");
            } else {
                $stmt = $conn->prepare("SELECT c.id, c.usuario_id, c.nivel, c.created_at, u.usuario, u.nombre_real FROM drive_compartidos c LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.file_id = ? ORDER BY c.created_at DESC");
            }
            $stmt->execute([$id]);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'compartidos' => $result]);
            exit;
        }

        if ($action === 'buscar_usuarios') {
            $q = trim((string)($_GET['q'] ?? ''));
            if ($q === '') {
                echo json_encode(['success' => true, 'usuarios' => []]);
                exit;
            }
            $stmt = $conn->prepare("SELECT id, usuario, email, nombre_real FROM usuarios WHERE usuario LIKE ? OR email LIKE ? OR nombre_real LIKE ? LIMIT 20");
            $like = '%' . $q . '%';
            $stmt->execute([$like, $like, $like]);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'usuarios' => $result]);
            exit;
        }

        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Acción no válida']);
        exit;
    }

    if ($method === 'POST') {
        if ($action === 'create_folder') {
            $data = json_decode(file_get_contents("php://input"), true) ?? [];
            $name = drive_sanitize_name((string)($data['name'] ?? ''), 150);
            $parentId = isset($data['parent_id']) ? (int)$data['parent_id'] : 0;
            $pid = $parentId > 0 ? $parentId : null;
            if ($name === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Nombre requerido']);
                exit;
            }

            if ($pid && !drive_can_write_folder($conn, $userId, $pid)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'No tienes permiso para crear carpetas aquí']);
                exit;
            }

            $stmt = $conn->prepare("INSERT INTO drive_folders (parent_id, nombre, created_by) VALUES (?, ?, ?)");
            $stmt->execute([$pid, $name, ($userId > 0 ? $userId : null)]);
            echo json_encode(['success' => true, 'message' => 'Carpeta creada', 'id' => (int)$conn->lastInsertId()]);
            exit;
        }

        if ($action === 'upload') {
            $folderId = isset($_POST['folder_id']) ? (int)$_POST['folder_id'] : 0;
            $fid = $folderId > 0 ? $folderId : null;

            if ($fid && !drive_can_write_folder($conn, $userId, $fid)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'No tienes permiso para subir archivos aquí']);
                exit;
            }

            $allowedExt = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'csv', 'zip', 'rar', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv'];
            $maxBytes = 200 * 1024 * 1024;

            $files = $_FILES['files'] ?? null;
            if (!$files) $files = $_FILES['file'] ?? null;
            if (!$files) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Archivo requerido']);
                exit;
            }

            $names = $_POST['names'] ?? [];
            if (!is_array($names)) $names = [$names];

            $isMulti = is_array($files['name'] ?? null);
            $count = $isMulti ? count($files['name']) : 1;
            $uploaded = 0;

            for ($i = 0; $i < $count; $i++) {
                $tmp = $isMulti ? ($files['tmp_name'][$i] ?? '') : ($files['tmp_name'] ?? '');
                $orig = $isMulti ? ($files['name'][$i] ?? '') : ($files['name'] ?? '');
                $size = (int)($isMulti ? ($files['size'][$i] ?? 0) : ($files['size'] ?? 0));
                $err = (int)($isMulti ? ($files['error'][$i] ?? 0) : ($files['error'] ?? 0));

                if ($err !== UPLOAD_ERR_OK || $tmp === '' || $size <= 0) continue;
                if ($size > $maxBytes) continue;

                $ext = strtolower(pathinfo((string)$orig, PATHINFO_EXTENSION));
                if ($ext === '') continue;
                if (!in_array($ext, $allowedExt, true)) continue;

                $custom = '';
                if (isset($names[$i])) {
                    $custom = drive_sanitize_name((string)$names[$i], 200);
                }

                $filename = uniqid('drv_', true) . '_' . time() . '_' . $i . '.' . $ext;
                $filepath = $uploadDir . $filename;
                if (!move_uploaded_file($tmp, $filepath)) continue;

                $mime = drive_mime_for_ext($ext);

                $stmt = $conn->prepare("
                    INSERT INTO drive_files (folder_id, nombre, nombre_original, nombre_archivo, ruta_archivo, mime, ext, size_bytes, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $fid,
                    ($custom !== '' ? $custom : null),
                    ($orig !== '' ? $orig : null),
                    $filename,
                    $filepath,
                    $mime,
                    $ext,
                    $size,
                    ($userId > 0 ? $userId : null)
                ]);
                $uploaded++;
            }

            echo json_encode(['success' => true, 'message' => 'Archivos subidos', 'uploaded' => $uploaded]);
            exit;
        }

        if ($action === 'compartir') {
            $data = json_decode(file_get_contents("php://input"), true) ?? [];
            $type = strtolower(trim((string)($data['type'] ?? '')));
            $id = isset($data['id']) ? (int)$data['id'] : 0;
            $targetUserId = isset($data['usuario_id']) ? (int)$data['usuario_id'] : 0;
            $nivel = in_array(($data['nivel'] ?? ''), ['lectura', 'escritura'], true) ? $data['nivel'] : 'lectura';

            if ($id <= 0 || $targetUserId <= 0 || ($type !== 'folder' && $type !== 'file')) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Parámetros inválidos']);
                exit;
            }

            if ($type === 'folder') {
                $stmt = $conn->prepare("SELECT 1 FROM drive_folders WHERE id = ? AND created_by = ? LIMIT 1");
            } else {
                $stmt = $conn->prepare("SELECT 1 FROM drive_files WHERE id = ? AND created_by = ? LIMIT 1");
            }
            $stmt->execute([$id, $userId]);
            if (!$stmt->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Solo el propietario puede compartir este elemento']);
                exit;
            }

            if ($type === 'folder') {
                $stmt = $conn->prepare("INSERT IGNORE INTO drive_compartidos (folder_id, usuario_id, nivel) VALUES (?, ?, ?)");
            } else {
                $stmt = $conn->prepare("INSERT IGNORE INTO drive_compartidos (file_id, usuario_id, nivel) VALUES (?, ?, ?)");
            }
            $stmt->execute([$id, $targetUserId, $nivel]);

            $inserted = $stmt->rowCount() > 0;
            echo json_encode(['success' => true, 'message' => $inserted ? 'Compartido correctamente' : 'El usuario ya tiene acceso']);
            exit;
        }

        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Acción no válida']);
        exit;
    }

    if ($method === 'PUT') {
        $data = json_decode(file_get_contents("php://input"), true) ?? [];

        if ($action === 'rename') {
            $type = strtolower(trim((string)($data['type'] ?? '')));
            $id = isset($data['id']) ? (int)$data['id'] : 0;
            $name = drive_sanitize_name((string)($data['name'] ?? ''), $type === 'folder' ? 150 : 200);
            if ($id <= 0 || ($type !== 'folder' && $type !== 'file') || $name === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Datos inválidos']);
                exit;
            }

            if ($type === 'folder') {
                $stmt = $conn->prepare("SELECT 1 FROM drive_folders WHERE id = ? AND (created_by IS NULL OR created_by = ?) LIMIT 1");
                $stmt->execute([$id, $userId]);
                if (!$stmt->fetchColumn()) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'message' => 'No tienes permiso para renombrar esta carpeta']);
                    exit;
                }
                $stmt = $conn->prepare("UPDATE drive_folders SET nombre = ? WHERE id = ?");
                $stmt->execute([$name, $id]);
                echo json_encode(['success' => true, 'message' => 'Carpeta renombrada']);
                exit;
            }

            $stmt = $conn->prepare("SELECT 1 FROM drive_files WHERE id = ? AND (created_by IS NULL OR created_by = ?) LIMIT 1");
            $stmt->execute([$id, $userId]);
            if (!$stmt->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'No tienes permiso para renombrar este archivo']);
                exit;
            }
            $stmt = $conn->prepare("UPDATE drive_files SET nombre = ? WHERE id = ?");
            $stmt->execute([$name, $id]);
            echo json_encode(['success' => true, 'message' => 'Archivo renombrado']);
            exit;
        }

        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Acción no válida']);
        exit;
    }

    if ($method === 'DELETE') {
        if ($action === 'delete') {
            $type = isset($_GET['type']) ? strtolower(trim((string)$_GET['type'])) : '';
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            $force = isset($_GET['force']) && ((string)$_GET['force'] === '1' || strtolower((string)$_GET['force']) === 'true');

            if ($id <= 0 || ($type !== 'folder' && $type !== 'file')) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Datos inválidos']);
                exit;
            }

            if ($type === 'file') {
                $stmt = $conn->prepare("SELECT 1 FROM drive_files WHERE id = ? AND (created_by IS NULL OR created_by = ?) LIMIT 1");
                $stmt->execute([$id, $userId]);
                if (!$stmt->fetchColumn()) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'message' => 'No tienes permiso para eliminar este archivo']);
                    exit;
                }
                $stmt = $conn->prepare("SELECT ruta_archivo FROM drive_files WHERE id = ? LIMIT 1");
                $stmt->execute([$id]);
                $path = (string)($stmt->fetchColumn() ?: '');
                $stmt = $conn->prepare("DELETE FROM drive_files WHERE id = ?");
                $stmt->execute([$id]);
                $conn->prepare("DELETE FROM drive_compartidos WHERE file_id = ?")->execute([$id]);
                $realUpload = realpath($uploadDir) ?: $uploadDir;
                $realPath = $path !== '' ? realpath($path) : false;
                if ($realPath && strpos($realPath, $realUpload) === 0 && is_file($realPath)) {
                    @unlink($realPath);
                }
                echo json_encode(['success' => true, 'message' => 'Archivo eliminado']);
                exit;
            }

            $stmt = $conn->prepare("SELECT 1 FROM drive_folders WHERE id = ? AND created_by = ? LIMIT 1");
            $stmt->execute([$id, $userId]);
            if (!$stmt->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Solo el propietario puede eliminar esta carpeta']);
                exit;
            }

            $stmt = $conn->prepare("SELECT COUNT(*) FROM drive_folders WHERE parent_id = ?");
            $stmt->execute([$id]);
            $childFolders = (int)($stmt->fetchColumn() ?: 0);

            $stmt = $conn->prepare("SELECT COUNT(*) FROM drive_files WHERE folder_id = ?");
            $stmt->execute([$id]);
            $childFiles = (int)($stmt->fetchColumn() ?: 0);

            if (($childFolders > 0 || $childFiles > 0) && !$force) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'La carpeta no está vacía', 'needs_force' => true]);
                exit;
            }

            if ($force) {
                $toDelete = [$id];
                $idx = 0;
                while ($idx < count($toDelete) && $idx < 5000) {
                    $cur = $toDelete[$idx];
                    $idx++;
                    $stmt = $conn->prepare("SELECT id FROM drive_folders WHERE parent_id = ?");
                    $stmt->execute([$cur]);
                    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);
                    foreach ($rows as $fid) {
                        $fid = (int)$fid;
                        if ($fid > 0) $toDelete[] = $fid;
                    }
                }

                $toDelete = array_values(array_unique($toDelete));
                if (count($toDelete) > 5000) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'message' => 'Demasiadas subcarpetas (máximo 5000)']);
                    exit;
                }

                $realUpload = realpath($uploadDir) ?: $uploadDir;
                $placeholders = implode(',', array_fill(0, count($toDelete), '?'));

                $stmt = $conn->prepare("SELECT id, ruta_archivo FROM drive_files WHERE folder_id IN ($placeholders)");
                $stmt->execute(array_map('intval', $toDelete));
                $allFiles = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($allFiles as $f) {
                    $path = (string)($f['ruta_archivo'] ?? '');
                    $realPath = $path !== '' ? realpath($path) : false;
                    if ($realPath && strpos($realPath, $realUpload) === 0 && is_file($realPath)) {
                        @unlink($realPath);
                    }
                }

                $conn->prepare("DELETE FROM drive_compartidos WHERE folder_id IN ($placeholders)")->execute(array_map('intval', $toDelete));
                $stmt = $conn->prepare("DELETE FROM drive_files WHERE folder_id IN ($placeholders)");
                $stmt->execute(array_map('intval', $toDelete));

                rsort($toDelete);
                $stmt = $conn->prepare("DELETE FROM drive_folders WHERE id IN ($placeholders)");
                $stmt->execute(array_map('intval', $toDelete));

                echo json_encode(['success' => true, 'message' => 'Carpeta eliminada']);
                exit;
            }

            $conn->prepare("DELETE FROM drive_compartidos WHERE folder_id = ?")->execute([$id]);
            $stmt = $conn->prepare("DELETE FROM drive_folders WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true, 'message' => 'Carpeta eliminada']);
            exit;
        }

        if ($action === 'eliminar_compartido') {
            $compartidoId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($compartidoId <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'ID requerido']);
                exit;
            }

            $stmt = $conn->prepare("SELECT c.id, c.folder_id, c.file_id FROM drive_compartidos c WHERE c.id = ? LIMIT 1");
            $stmt->execute([$compartidoId]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$comp) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Registro no encontrado']);
                exit;
            }

            if ($comp['folder_id']) {
                $stmt = $conn->prepare("SELECT 1 FROM drive_folders WHERE id = ? AND created_by = ? LIMIT 1");
                $stmt->execute([$comp['folder_id'], $userId]);
            } else {
                $stmt = $conn->prepare("SELECT 1 FROM drive_files WHERE id = ? AND created_by = ? LIMIT 1");
                $stmt->execute([$comp['file_id'], $userId]);
            }
            if (!$stmt->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Solo el propietario puede quitar el acceso']);
                exit;
            }

            $conn->prepare("DELETE FROM drive_compartidos WHERE id = ?")->execute([$compartidoId]);
            echo json_encode(['success' => true, 'message' => 'Acceso eliminado']);
            exit;
        }

        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Acción no válida']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}

if (isset($conn)) $conn = null;
