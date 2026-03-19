<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';
require '../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$action = $_GET['action'] ?? '';

// Authenticate and get User ID
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);
$usuario_id = $userData ? $userData->id : ($_GET['usuario_id'] ?? 1);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$relaxedReadActions = [
    'list_empresas',
    'list_normas',
    'list_iso_users',
    'list_coordinaciones',
    'list_pending_meetings',
    'report_builder'
];
if (!($method === 'GET' && in_array($action, $relaxedReadActions, true))) {
    rbac_require($conn, $userData, 'gestion_iso', $method);
}

function iso_column_exists(PDO $conn, string $table, string $column): bool {
    static $cache = [];
    $key = strtolower($table . '.' . $column);
    if (array_key_exists($key, $cache)) return $cache[$key];
    try {
        $stmt = $conn->prepare("
            SELECT COUNT(*) 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        ");
        $stmt->execute([$table, $column]);
        $cache[$key] = ((int)$stmt->fetchColumn()) > 0;
    } catch (Throwable $e) {
        $cache[$key] = false;
    }
    return $cache[$key];
}

function iso_numeral_key($numeral): ?array {
    $numeral = trim((string)($numeral ?? ''));
    if ($numeral === '') return null;
    $parts = preg_split('/[^0-9A-Za-z]+/', $numeral, -1, PREG_SPLIT_NO_EMPTY);
    if (!$parts) return null;
    return array_map(function ($p) {
        $p = trim((string)$p);
        if ($p !== '' && ctype_digit($p)) return (int)$p;
        return mb_strtolower($p);
    }, $parts);
}

function iso_compare_numeral_keys(?array $ka, ?array $kb): int {
    if ($ka === null && $kb === null) return 0;
    if ($ka === null) return 1;
    if ($kb === null) return -1;
    $len = max(count($ka), count($kb));
    for ($i = 0; $i < $len; $i++) {
        $a = $ka[$i] ?? null;
        $b = $kb[$i] ?? null;
        if ($a === null && $b === null) return 0;
        if ($a === null) return -1;
        if ($b === null) return 1;
        $aIsInt = is_int($a);
        $bIsInt = is_int($b);
        if ($aIsInt && $bIsInt) {
            if ($a < $b) return -1;
            if ($a > $b) return 1;
            continue;
        }
        if ($aIsInt && !$bIsInt) return -1;
        if (!$aIsInt && $bIsInt) return 1;
        $cmp = strcmp((string)$a, (string)$b);
        if ($cmp !== 0) return $cmp;
    }
    return 0;
}

function iso_place_new_item_by_numeral(PDO $conn, $norma_id, $newItemId, $newNumeral): void {
    $stmt = $conn->prepare("SELECT id, numeral, orden FROM iso_checklist_items WHERE norma_id = ? ORDER BY orden ASC, id ASC");
    $stmt->execute([$norma_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $maxOrden = 0;
    foreach ($rows as $r) {
        $o = (int)($r['orden'] ?? 0);
        if ($o > $maxOrden) $maxOrden = $o;
    }

    $newKey = iso_numeral_key($newNumeral);
    if ($newKey === null) {
        $conn->prepare("UPDATE iso_checklist_items SET orden = ? WHERE id = ? AND norma_id = ?")
             ->execute([$maxOrden + 1, $newItemId, $norma_id]);
        return;
    }

    $isSorted = true;
    $prevKey = null;
    foreach ($rows as $r) {
        $curKey = iso_numeral_key($r['numeral'] ?? '');
        if ($prevKey !== null) {
            if (iso_compare_numeral_keys($prevKey, $curKey) > 0) {
                $isSorted = false;
                break;
            }
        }
        $prevKey = $curKey;
    }

    if (!$isSorted) {
        $conn->prepare("UPDATE iso_checklist_items SET orden = ? WHERE id = ? AND norma_id = ?")
             ->execute([$maxOrden + 1, $newItemId, $norma_id]);
        return;
    }

    $insertOrden = null;
    foreach ($rows as $r) {
        if ((int)$r['id'] === (int)$newItemId) continue;
        $curKey = iso_numeral_key($r['numeral'] ?? '');
        if (iso_compare_numeral_keys($newKey, $curKey) < 0) {
            $insertOrden = (int)($r['orden'] ?? 0);
            break;
        }
    }

    if ($insertOrden === null || $insertOrden <= 0) {
        $conn->prepare("UPDATE iso_checklist_items SET orden = ? WHERE id = ? AND norma_id = ?")
             ->execute([$maxOrden + 1, $newItemId, $norma_id]);
        return;
    }

    $conn->prepare("UPDATE iso_checklist_items SET orden = orden + 1 WHERE norma_id = ? AND orden >= ? AND id <> ?")
         ->execute([$norma_id, $insertOrden, $newItemId]);
    $conn->prepare("UPDATE iso_checklist_items SET orden = ? WHERE id = ? AND norma_id = ?")
         ->execute([$insertOrden, $newItemId, $norma_id]);
}

function iso_ensure_coordinaciones_table(PDO $conn): void {
    $conn->exec("CREATE TABLE IF NOT EXISTS iso_coordinaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id INT NOT NULL,
        usuario_id INT NOT NULL,
        fecha DATETIME NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        detalle TEXT,
        estado VARCHAR(20) DEFAULT 'Completado',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_empresa (empresa_id),
        INDEX idx_usuario (usuario_id),
        INDEX idx_fecha (fecha),
        FOREIGN KEY (empresa_id) REFERENCES iso_empresas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function iso_ensure_certificados_table(PDO $conn): void {
    $conn->exec("CREATE TABLE IF NOT EXISTS iso_certificados (
        id INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id INT NOT NULL,
        norma_id INT NOT NULL,
        usuario_id INT NOT NULL,
        fecha_inicio DATE NULL,
        fecha_mantenimiento DATE NULL,
        fecha_vencimiento DATE NULL,
        alerta_dias INT NOT NULL DEFAULT 30,
        nombre_archivo VARCHAR(255) NULL,
        ruta_archivo VARCHAR(255) NULL,
        tipo_archivo VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_empresa_norma (empresa_id, norma_id),
        INDEX idx_empresa (empresa_id),
        INDEX idx_norma (norma_id),
        FOREIGN KEY (empresa_id) REFERENCES iso_empresas(id) ON DELETE CASCADE,
        FOREIGN KEY (norma_id) REFERENCES iso_normas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function iso_to_datetime_string($dateOrDatetime): string {
    $v = trim((string)($dateOrDatetime ?? ''));
    if ($v === '') return date('Y-m-d H:i:s');
    if (strlen($v) === 10) return $v . ' 00:00:00';
    return $v;
}

try {
    // ==========================================
    // NUEVA GESTIÓN ISO (MULTI-EMPRESA & TRACKING)
    // ==========================================

    if ($action === 'list_empresas') {
        $stmt = $conn->query("
            SELECT e.* 
            FROM iso_empresas e
            INNER JOIN iso_empresas_normas en ON en.empresa_id = e.id
            GROUP BY e.id
            ORDER BY e.nombre
        ");
        $empresas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($empresas as &$emp) {
            $stmtNormas = $conn->prepare("
                SELECT n.* FROM iso_normas n 
                JOIN iso_empresas_normas en ON n.id = en.norma_id 
                WHERE en.empresa_id = ?
            ");
            $stmtNormas->execute([$emp['id']]);
            $emp['normas'] = $stmtNormas->fetchAll(PDO::FETCH_ASSOC);
        }
        echo json_encode($empresas);
    }

    elseif ($action === 'resolve_cliente_for_empresa') {
        $empresaId = isset($_GET['empresa_id']) ? (int)$_GET['empresa_id'] : 0;
        if (!$empresaId) {
            http_response_code(400);
            echo json_encode(['message' => 'empresa_id requerido']);
            exit;
        }

        $stmtEmp = $conn->prepare("SELECT id, nombre, ruc FROM iso_empresas WHERE id = ? LIMIT 1");
        $stmtEmp->execute([$empresaId]);
        $empresa = $stmtEmp->fetch(PDO::FETCH_ASSOC);

        if (!$empresa) {
            http_response_code(404);
            echo json_encode(['message' => 'Empresa no encontrada']);
            exit;
        }

        $cliente = null;

        $ruc = trim((string)($empresa['ruc'] ?? ''));
        $nombre = trim((string)($empresa['nombre'] ?? ''));

        if ($ruc !== '') {
            $stmtCli = $conn->prepare("SELECT id, razon_social, num_doc FROM clientes WHERE num_doc = ? LIMIT 1");
            $stmtCli->execute([$ruc]);
            $cliente = $stmtCli->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        if (!$cliente && $nombre !== '') {
            $stmtCli = $conn->prepare("SELECT id, razon_social, num_doc FROM clientes WHERE razon_social = ? LIMIT 1");
            $stmtCli->execute([$nombre]);
            $cliente = $stmtCli->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        echo json_encode(['empresa' => $empresa, 'cliente' => $cliente]);
    }

    elseif ($action === 'list_coordinaciones') {
        iso_ensure_coordinaciones_table($conn);
        $empresaId = isset($_GET['empresa_id']) ? (int)$_GET['empresa_id'] : 0;
        if (!$empresaId) {
            http_response_code(400);
            echo json_encode(['message' => 'empresa_id requerido']);
            exit;
        }
        $startDate = $_GET['start_date'] ?? null;
        $endDate = $_GET['end_date'] ?? null;
        $sql = "SELECT c.*, u.usuario as usuario_nombre
                FROM iso_coordinaciones c
                LEFT JOIN usuarios u ON u.id = c.usuario_id
                WHERE c.empresa_id = ?";
        $params = [$empresaId];
        if ($startDate && $endDate) {
            $sql .= " AND DATE(c.fecha) BETWEEN ? AND ?";
            $params[] = $startDate;
            $params[] = $endDate;
        }
        $sql .= " ORDER BY c.fecha DESC LIMIT 5000";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'list_pending_meetings') {
        iso_ensure_coordinaciones_table($conn);
        $month = trim((string)($_GET['month'] ?? ''));
        $empresaId = isset($_GET['empresa_id']) ? (int)$_GET['empresa_id'] : 0;

        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            $month = date('Y-m');
        }

        $startDate = $month . '-01';
        $endDate = date('Y-m-t', strtotime($startDate));

        $sql = "
            SELECT 
                c.*,
                e.nombre as empresa_nombre,
                e.ruc as empresa_ruc,
                u.usuario as usuario_nombre
            FROM iso_coordinaciones c
            JOIN iso_empresas e ON e.id = c.empresa_id
            LEFT JOIN usuarios u ON u.id = c.usuario_id
            WHERE 
                c.estado = 'Pendiente'
                AND (c.tipo IN ('Reunión', 'Reunion', 'Visita'))
                AND DATE(c.fecha) BETWEEN ? AND ?
        ";
        $params = [$startDate, $endDate];

        if ($empresaId) {
            $sql .= " AND c.empresa_id = ? ";
            $params[] = $empresaId;
        }

        $sql .= " ORDER BY c.fecha ASC";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'create_coordinacion' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        iso_ensure_coordinaciones_table($conn);
        $data = json_decode(file_get_contents("php://input"), true);
        $empresaId = isset($data['empresa_id']) ? (int)$data['empresa_id'] : 0;
        if (!$empresaId) {
            http_response_code(400);
            echo json_encode(['message' => 'empresa_id requerido']);
            exit;
        }
        $fecha = iso_to_datetime_string($data['fecha'] ?? null);
        $tipo = trim((string)($data['tipo'] ?? ''));
        if ($tipo === '') $tipo = 'Reunión';
        $detalle = (string)($data['detalle'] ?? '');
        $estado = trim((string)($data['estado'] ?? 'Completado'));
        if ($estado === '') $estado = 'Completado';
        $stmt = $conn->prepare("INSERT INTO iso_coordinaciones (empresa_id, usuario_id, fecha, tipo, detalle, estado) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$empresaId, (int)$usuario_id, $fecha, $tipo, $detalle, $estado]);
        echo json_encode(['success' => true, 'id' => (int)$conn->lastInsertId()]);
    }

    elseif ($action === 'update_coordinacion' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        iso_ensure_coordinaciones_table($conn);
        $data = json_decode(file_get_contents("php://input"), true);
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['message' => 'id requerido']);
            exit;
        }
        $fecha = iso_to_datetime_string($data['fecha'] ?? null);
        $tipo = trim((string)($data['tipo'] ?? ''));
        if ($tipo === '') $tipo = 'Reunión';
        $detalle = (string)($data['detalle'] ?? '');
        $estado = trim((string)($data['estado'] ?? 'Completado'));
        if ($estado === '') $estado = 'Completado';
        $stmt = $conn->prepare("UPDATE iso_coordinaciones SET fecha = ?, tipo = ?, detalle = ?, estado = ? WHERE id = ?");
        $stmt->execute([$fecha, $tipo, $detalle, $estado, $id]);
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'delete_coordinacion') {
        iso_ensure_coordinaciones_table($conn);
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['message' => 'id requerido']);
            exit;
        }
        $conn->prepare("DELETE FROM iso_coordinaciones WHERE id = ?")->execute([$id]);
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'list_certificados') {
        iso_ensure_certificados_table($conn);
        $empresaId = isset($_GET['empresa_id']) ? (int)$_GET['empresa_id'] : 0;
        $normaId = isset($_GET['norma_id']) ? (int)$_GET['norma_id'] : 0;

        $sql = "
            SELECT 
                c.*,
                e.nombre as empresa_nombre,
                e.ruc as empresa_ruc,
                n.codigo as norma_codigo,
                n.nombre as norma_nombre,
                u.usuario as usuario_nombre
            FROM iso_certificados c
            JOIN iso_empresas e ON e.id = c.empresa_id
            JOIN iso_normas n ON n.id = c.norma_id
            LEFT JOIN usuarios u ON u.id = c.usuario_id
            WHERE 1=1
        ";
        $params = [];
        if ($empresaId) {
            $sql .= " AND c.empresa_id = ? ";
            $params[] = $empresaId;
        }
        if ($normaId) {
            $sql .= " AND c.norma_id = ? ";
            $params[] = $normaId;
        }
        $sql .= " ORDER BY e.nombre ASC, n.codigo ASC";

        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'get_certificado') {
        iso_ensure_certificados_table($conn);
        $empresaId = isset($_GET['empresa_id']) ? (int)$_GET['empresa_id'] : 0;
        $normaId = isset($_GET['norma_id']) ? (int)$_GET['norma_id'] : 0;
        if (!$empresaId || !$normaId) {
            http_response_code(400);
            echo json_encode(['message' => 'empresa_id y norma_id requeridos']);
            exit;
        }

        $stmt = $conn->prepare("SELECT * FROM iso_certificados WHERE empresa_id = ? AND norma_id = ? LIMIT 1");
        $stmt->execute([$empresaId, $normaId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode($row ?: null);
    }

    elseif ($action === 'upsert_certificado' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        iso_ensure_certificados_table($conn);

        $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
        $data = null;
        if (str_contains($contentType, 'application/json')) {
            $data = json_decode(file_get_contents("php://input"), true);
        } else {
            $data = $_POST;
        }

        $empresaId = isset($data['empresa_id']) ? (int)$data['empresa_id'] : 0;
        $normaId = isset($data['norma_id']) ? (int)$data['norma_id'] : 0;
        if (!$empresaId || !$normaId) {
            http_response_code(400);
            echo json_encode(['message' => 'empresa_id y norma_id requeridos']);
            exit;
        }

        $fechaInicio = isset($data['fecha_inicio']) && trim((string)$data['fecha_inicio']) !== '' ? trim((string)$data['fecha_inicio']) : null;
        $fechaMantenimiento = isset($data['fecha_mantenimiento']) && trim((string)$data['fecha_mantenimiento']) !== '' ? trim((string)$data['fecha_mantenimiento']) : null;
        $fechaVencimiento = isset($data['fecha_vencimiento']) && trim((string)$data['fecha_vencimiento']) !== '' ? trim((string)$data['fecha_vencimiento']) : null;
        $alertaDias = isset($data['alerta_dias']) ? (int)$data['alerta_dias'] : 30;
        if ($alertaDias <= 0) $alertaDias = 30;

        $stmtPrev = $conn->prepare("SELECT id, ruta_archivo FROM iso_certificados WHERE empresa_id = ? AND norma_id = ? LIMIT 1");
        $stmtPrev->execute([$empresaId, $normaId]);
        $prev = $stmtPrev->fetch(PDO::FETCH_ASSOC) ?: null;

        $nombreArchivo = null;
        $rutaArchivo = null;
        $tipoArchivo = null;

        if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['file'];
            $fileName = (string)($file['name'] ?? '');
            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            $allowedExts = ['pdf', 'jpg', 'jpeg', 'png'];
            if (!in_array($ext, $allowedExts, true)) {
                http_response_code(400);
                echo json_encode(['message' => 'Tipo de archivo no permitido (PDF/JPG/PNG)']);
                exit;
            }
            if ((int)($file['size'] ?? 0) > (15 * 1024 * 1024)) {
                http_response_code(400);
                echo json_encode(['message' => 'El archivo excede el límite de 15MB']);
                exit;
            }

            $uploadDir = 'uploads/iso_certificados/';
            if (!file_exists($uploadDir)) mkdir($uploadDir, 0777, true);
            $safeBase = bin2hex(random_bytes(8));
            $storedName = 'cert_' . $empresaId . '_' . $normaId . '_' . date('Ymd_His') . '_' . $safeBase . '.' . $ext;
            $destPath = $uploadDir . $storedName;
            if (!move_uploaded_file($file['tmp_name'], $destPath)) {
                throw new Exception('No se pudo guardar el archivo');
            }
            $nombreArchivo = $fileName;
            $rutaArchivo = $destPath;
            $tipoArchivo = (string)($file['type'] ?? '');
        }

        $conn->beginTransaction();
        if ($prev && !empty($prev['id'])) {
            $set = "usuario_id = ?, fecha_inicio = ?, fecha_mantenimiento = ?, fecha_vencimiento = ?, alerta_dias = ?";
            $params = [(int)$usuario_id, $fechaInicio, $fechaMantenimiento, $fechaVencimiento, $alertaDias];
            if ($rutaArchivo !== null) {
                $set .= ", nombre_archivo = ?, ruta_archivo = ?, tipo_archivo = ?";
                $params[] = $nombreArchivo;
                $params[] = $rutaArchivo;
                $params[] = $tipoArchivo;
            }
            $params[] = (int)$prev['id'];
            $stmt = $conn->prepare("UPDATE iso_certificados SET {$set} WHERE id = ?");
            $stmt->execute($params);
            $certId = (int)$prev['id'];

            if ($rutaArchivo !== null && !empty($prev['ruta_archivo']) && $prev['ruta_archivo'] !== $rutaArchivo) {
                $old = (string)$prev['ruta_archivo'];
                if ($old !== '' && file_exists($old)) {
                    @unlink($old);
                }
            }
        } else {
            $stmt = $conn->prepare("
                INSERT INTO iso_certificados 
                    (empresa_id, norma_id, usuario_id, fecha_inicio, fecha_mantenimiento, fecha_vencimiento, alerta_dias, nombre_archivo, ruta_archivo, tipo_archivo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $empresaId,
                $normaId,
                (int)$usuario_id,
                $fechaInicio,
                $fechaMantenimiento,
                $fechaVencimiento,
                $alertaDias,
                $nombreArchivo,
                $rutaArchivo,
                $tipoArchivo
            ]);
            $certId = (int)$conn->lastInsertId();
        }
        $conn->commit();
        echo json_encode(['success' => true, 'id' => $certId]);
    }

    elseif ($action === 'delete_certificado') {
        iso_ensure_certificados_table($conn);
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['message' => 'id requerido']);
            exit;
        }
        $stmtPrev = $conn->prepare("SELECT ruta_archivo FROM iso_certificados WHERE id = ? LIMIT 1");
        $stmtPrev->execute([$id]);
        $ruta = (string)($stmtPrev->fetchColumn() ?: '');
        $conn->prepare("DELETE FROM iso_certificados WHERE id = ?")->execute([$id]);
        if ($ruta !== '' && file_exists($ruta)) {
            @unlink($ruta);
        }
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'save_empresa' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $conn->beginTransaction();
        
        if (empty($data['id'])) {
            $stmt = $conn->prepare("INSERT INTO iso_empresas (nombre, ruc, logo) VALUES (?, ?, ?)");
            $stmt->execute([$data['nombre'], $data['ruc'] ?? '', $data['logo'] ?? '']);
            $empresaId = $conn->lastInsertId();
        } else {
            $empresaId = $data['id'];
            $stmt = $conn->prepare("UPDATE iso_empresas SET nombre = ?, ruc = ?, logo = ? WHERE id = ?");
            $stmt->execute([$data['nombre'], $data['ruc'] ?? '', $data['logo'] ?? '', $empresaId]);
            
            // Clear existing norms to re-add
            $conn->prepare("DELETE FROM iso_empresas_normas WHERE empresa_id = ?")->execute([$empresaId]);
        }

        if (!empty($data['normas'])) {
            $stmtNorma = $conn->prepare("INSERT INTO iso_empresas_normas (empresa_id, norma_id) VALUES (?, ?)");
            foreach ($data['normas'] as $normaId) {
                $stmtNorma->execute([$empresaId, $normaId]);
            }
        }
        
        $conn->commit();
        echo json_encode(['success' => true, 'id' => $empresaId]);
    }

    elseif ($action === 'delete_empresa') {
        $id = $_GET['id'] ?? 0;
        $conn->prepare("DELETE FROM iso_empresas WHERE id = ?")->execute([$id]);
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'list_normas') {
        $stmt = $conn->query("SELECT * FROM iso_normas ORDER BY nombre");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'create_norma' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $codigo = $data['codigo'];
        $nombre = $data['nombre'];
        $descripcion = $data['descripcion'] ?? '';
        
        if (empty($codigo) || empty($nombre)) {
            throw new Exception("Código y Nombre son obligatorios");
        }

        $stmt = $conn->prepare("INSERT INTO iso_normas (codigo, nombre, descripcion) VALUES (?, ?, ?)");
        $stmt->execute([$codigo, $nombre, $descripcion]);
        
        echo json_encode(['success' => true, 'id' => $conn->lastInsertId()]);
    }

    elseif ($action === 'update_norma' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $id = $data['id'];
        $codigo = $data['codigo'];
        $nombre = $data['nombre'];
        $descripcion = $data['descripcion'] ?? '';
        
        if (empty($id) || empty($codigo) || empty($nombre)) {
            throw new Exception("ID, Código y Nombre son obligatorios");
        }

        $stmt = $conn->prepare("UPDATE iso_normas SET codigo = ?, nombre = ?, descripcion = ? WHERE id = ?");
        $stmt->execute([$codigo, $nombre, $descripcion, $id]);
        
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'delete_norma') {
        $id = $_GET['id'] ?? 0;
        
        // Check usage in iso_empresas_normas
        $stmtCheck = $conn->prepare("SELECT COUNT(*) FROM iso_empresas_normas WHERE norma_id = ?");
        $stmtCheck->execute([$id]);
        if ($stmtCheck->fetchColumn() > 0) {
            throw new Exception("No se puede eliminar la norma porque está asignada a empresas.");
        }

        // Check usage in iso_checklist_items
        $stmtCheckItems = $conn->prepare("SELECT COUNT(*) FROM iso_checklist_items WHERE norma_id = ?");
        $stmtCheckItems->execute([$id]);
        if ($stmtCheckItems->fetchColumn() > 0) {
            throw new Exception("No se puede eliminar la norma porque tiene items de checklist asociados.");
        }

        $conn->prepare("DELETE FROM iso_normas WHERE id = ?")->execute([$id]);
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'get_tracking') {
        $empresa_id = $_GET['empresa_id'] ?? 0;
        $norma_id = $_GET['norma_id'] ?? 0;
        $anio = $_GET['anio'] ?? date('Y');
        
        if (!$empresa_id || !$norma_id) throw new Exception("Empresa y Norma son requeridos");

        // AUTOMATION: Update 'Retrasado' status for overdue items
        // Only affects items that have a tracking record (meaning they have been scheduled)
        $today = date('Y-m-d');
        $stmtUpdate = $conn->prepare("
            UPDATE iso_tracking 
            SET estado = 'Retrasado' 
            WHERE empresa_id = ? 
            AND norma_id = ? 
            AND fecha_limite < ? 
            AND estado NOT IN ('Ejecutado', 'No aplica', 'Retrasado')
            AND fecha_limite IS NOT NULL
        ");
        $stmtUpdate->execute([$empresa_id, $norma_id, $today]);

        // Get items for the norm
        $hasNoEvidCol = iso_column_exists($conn, 'iso_tracking', 'no_requiere_evidencia');
        $trackingFields = "t.id as tracking_id, t.estado, t.fecha_programada, t.fecha_limite, t.fecha_ejecucion, t.observaciones_internas";
        if ($hasNoEvidCol) {
            $trackingFields .= ", t.no_requiere_evidencia";
        }
        
        $stmtItems = $conn->prepare("
            SELECT i.*, 
                {$trackingFields}
            FROM iso_checklist_items i
            LEFT JOIN iso_tracking t ON i.id = t.item_id AND t.empresa_id = ?
            WHERE i.norma_id = ?
            ORDER BY i.orden
        ");
        $stmtItems->execute([$empresa_id, $norma_id]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        // Enhance items with docs count/list and subitems
        foreach ($items as &$item) {
            if ($item['tracking_id']) {
                $hasMesCol = iso_column_exists($conn, 'iso_documentos', 'mes');
                $stmtDocs = $conn->prepare("SELECT * FROM iso_documentos WHERE tracking_id = ?");
                $stmtDocs->execute([$item['tracking_id']]);
                $item['documentos'] = $stmtDocs->fetchAll(PDO::FETCH_ASSOC);
                if (!$hasMesCol) {
                    foreach ($item['documentos'] as &$d) {
                        $d['mes'] = !empty($d['created_at']) ? date('Y-m', strtotime($d['created_at'])) : null;
                    }
                    unset($d);
                }
            } else {
                $item['documentos'] = [];
            }

            // Subitems with status
            $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
            if (!$hasFechaProgCol) {
                try {
                    $conn->exec("ALTER TABLE iso_subitem_evaluaciones ADD COLUMN fecha_programada DATE NULL AFTER anio");
                    $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
                } catch (Throwable $e) {
                    $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
                }
            }
            $fechaProgSelect = $hasFechaProgCol ? ", e.fecha_programada" : "";
            $stmtSub = $conn->prepare("
                SELECT s.*, 
                       e.hallazgos, e.estado as estado_anual{$fechaProgSelect},
                       e.ene_p, e.ene_e,
                       e.feb_p, e.feb_e,
                       e.mar_p, e.mar_e,
                       e.abr_p, e.abr_e,
                       e.may_p, e.may_e,
                       e.jun_p, e.jun_e,
                       e.jul_p, e.jul_e,
                       e.ago_p, e.ago_e,
                       e.sep_p, e.sep_e,
                       e.oct_p, e.oct_e,
                       e.nov_p, e.nov_e,
                       e.dic_p, e.dic_e
                FROM iso_checklist_subitems s
                LEFT JOIN iso_subitem_evaluaciones e ON s.id = e.subitem_id AND e.empresa_id = ? AND e.anio = ?
                WHERE s.item_id = ? 
                ORDER BY s.id
            ");
            $stmtSub->execute([$empresa_id, $anio, $item['id']]);
            $item['subitems'] = $stmtSub->fetchAll(PDO::FETCH_ASSOC);
        }

        echo json_encode($items);
    }

    elseif ($action === 'update_tracking_item' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $empresa_id = $data['empresa_id'];
        $norma_id = $data['norma_id'];
        $item_id = $data['item_id'];
        
        // Get current state if exists
        $stmtCheck = $conn->prepare("SELECT id, estado FROM iso_tracking WHERE empresa_id=? AND norma_id=? AND item_id=?");
        $stmtCheck->execute([$empresa_id, $norma_id, $item_id]);
        $existing = $stmtCheck->fetch(PDO::FETCH_ASSOC);
        $trackingId = $existing['id'] ?? null;
        $previousState = $existing['estado'] ?? 'Pendiente';

        $noEvidencia = !empty($data['no_requiere_evidencia']);
        if (
            !$noEvidencia &&
            !empty($data['observaciones_internas']) &&
            strpos($data['observaciones_internas'], '[NO_EVIDENCIA]') !== false
        ) {
            $noEvidencia = true;
        }
        
        $nextEstado = $data['estado'] ?? 'Programado';
        $obs = $data['observaciones_internas'] ?? '';
        $fecha_programada = $data['fecha_programada'] ?? null;
        $fecha_limite = $data['fecha_limite'] ?? null;
        $fecha_ejecucion = $data['fecha_ejecucion'] ?? null;
        
        if ($noEvidencia) {
            $nextEstado = 'No aplica';
            $fecha_programada = null;
            $fecha_limite = null;
            $fecha_ejecucion = null;
        }
        
        // Validation: Cannot be 'Ejecutado' without docs unless marked as no-evidence
        if ($nextEstado === 'Ejecutado' && !$noEvidencia) {
            $docCount = 0;
            if ($trackingId) {
                $stmtDocs = $conn->prepare("SELECT COUNT(*) FROM iso_documentos WHERE tracking_id = ?");
                $stmtDocs->execute([$trackingId]);
                $docCount = $stmtDocs->fetchColumn();
            }
            
            if ($docCount == 0) {
                throw new Exception("No se puede marcar como Ejecutado sin documentos adjuntos");
            }
        }

        // Upsert Tracking
        $hasNoEvidCol = iso_column_exists($conn, 'iso_tracking', 'no_requiere_evidencia');
        if ($hasNoEvidCol) {
            $stmt = $conn->prepare("
                INSERT INTO iso_tracking (empresa_id, norma_id, item_id, estado, fecha_programada, fecha_limite, fecha_ejecucion, observaciones_internas, no_requiere_evidencia)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    estado = VALUES(estado),
                    fecha_programada = VALUES(fecha_programada),
                    fecha_limite = VALUES(fecha_limite),
                    fecha_ejecucion = VALUES(fecha_ejecucion),
                    observaciones_internas = VALUES(observaciones_internas),
                    no_requiere_evidencia = VALUES(no_requiere_evidencia)
            ");
            $stmt->execute([
                $empresa_id, $norma_id, $item_id,
                $nextEstado,
                $fecha_programada ?: null,
                $fecha_limite ?: null,
                $fecha_ejecucion ?: null,
                $obs,
                $noEvidencia ? 1 : 0
            ]);
        } else {
            $stmt = $conn->prepare("
                INSERT INTO iso_tracking (empresa_id, norma_id, item_id, estado, fecha_programada, fecha_limite, fecha_ejecucion, observaciones_internas)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    estado = VALUES(estado),
                    fecha_programada = VALUES(fecha_programada),
                    fecha_limite = VALUES(fecha_limite),
                    fecha_ejecucion = VALUES(fecha_ejecucion),
                    observaciones_internas = VALUES(observaciones_internas)
            ");
            $stmt->execute([
                $empresa_id, $norma_id, $item_id,
                $nextEstado,
                $fecha_programada ?: null,
                $fecha_limite ?: null,
                $fecha_ejecucion ?: null,
                $obs
            ]);
        }

        // Get the tracking ID (if it was new)
        if (!$trackingId) {
            $trackingId = $conn->lastInsertId();
        }

        // Log History only if state changed
        if ($previousState !== $nextEstado) {
            $detalle = "Estado: $previousState -> {$nextEstado}";
            $conn->prepare("INSERT INTO iso_historial (tracking_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)")
                 ->execute([$trackingId, $usuario_id, 'CAMBIO_ESTADO', $detalle]);
        } elseif (!empty($obs)) {
             // Log comment update if state didn't change but maybe comments did (optional, but good practice)
             // For now, sticking to state change as requested
        }

        echo json_encode(['success' => true, 'tracking_id' => $trackingId]);
    }

    elseif ($action === 'create_item' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $norma_id = $data['norma_id'];
        $categoria = $data['categoria'];
        $numeral = $data['numeral'];
        $requisito = $data['requisito'];
        $descripcion = $data['descripcion_requisito'];
        $no_requiere_subitems = isset($data['no_requiere_subitems']) ? ($data['no_requiere_subitems'] ? 1 : 0) : 0;
        
        if (empty($norma_id) || empty($requisito) || empty($descripcion)) {
            throw new Exception("Norma, Requisito y Descripción son obligatorios");
        }

        $conn->beginTransaction();
        try {
            $stmt = $conn->prepare("
                INSERT INTO iso_checklist_items (norma_id, categoria, numeral, requisito, descripcion_requisito, orden, no_requiere_subitems)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$norma_id, $categoria, $numeral, $requisito, $descripcion, 0, $no_requiere_subitems]);
            $newId = $conn->lastInsertId();

            iso_place_new_item_by_numeral($conn, $norma_id, $newId, $numeral);

            $conn->commit();
            echo json_encode(['success' => true, 'id' => $newId]);
        } catch (Throwable $e) {
            $conn->rollBack();
            throw $e;
        }
    }

    elseif ($action === 'update_item' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $id = $data['id'];
        $categoria = $data['categoria'];
        $numeral = $data['numeral'];
        $requisito = $data['requisito'];
        $descripcion = $data['descripcion_requisito'];
        $no_requiere_subitems = isset($data['no_requiere_subitems']) ? ($data['no_requiere_subitems'] ? 1 : 0) : 0;
        
        if (empty($id) || empty($requisito) || empty($descripcion)) {
            throw new Exception("ID, Requisito y Descripción son obligatorios");
        }

        $stmt = $conn->prepare("
            UPDATE iso_checklist_items 
            SET categoria = ?, numeral = ?, requisito = ?, descripcion_requisito = ?, no_requiere_subitems = ?
            WHERE id = ?
        ");
        $stmt->execute([$categoria, $numeral, $requisito, $descripcion, $no_requiere_subitems, $id]);
        
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'reorder_items' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        $norma_id = $data['norma_id'] ?? 0;
        $ordered_ids = $data['ordered_ids'] ?? null;
        if (empty($norma_id) || !is_array($ordered_ids) || count($ordered_ids) === 0) {
            throw new Exception("Datos incompletos para reordenar");
        }

        $conn->beginTransaction();
        try {
            $stmtUpd = $conn->prepare("UPDATE iso_checklist_items SET orden = ? WHERE id = ? AND norma_id = ?");
            $i = 1;
            foreach ($ordered_ids as $id) {
                $stmtUpd->execute([$i, $id, $norma_id]);
                $i++;
            }
            $conn->commit();
            echo json_encode(['success' => true]);
        } catch (Throwable $e) {
            $conn->rollBack();
            throw $e;
        }
    }

    elseif ($action === 'rename_category' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $norma_id = $data['norma_id'];
        $old_category = $data['old_category'];
        $new_category = $data['new_category'];
        
        if (empty($norma_id) || empty($old_category) || empty($new_category)) {
            throw new Exception("Norma, categoría anterior y nueva categoría son obligatorios");
        }

        $stmt = $conn->prepare("
            UPDATE iso_checklist_items 
            SET categoria = ?
            WHERE categoria = ? AND norma_id = ?
        ");
        $stmt->execute([$new_category, $old_category, $norma_id]);
        
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'delete_item') {
        $id = $_GET['id'] ?? 0;
        if (!$id) throw new Exception("ID is required");

        // Check for dependencies (documents) via tracking
        $stmtDocs = $conn->prepare("
            SELECT COUNT(*) 
            FROM iso_documentos d
            JOIN iso_tracking t ON d.tracking_id = t.id
            WHERE t.item_id = ?
        ");
        $stmtDocs->execute([$id]);
        $hasDocs = $stmtDocs->fetchColumn();

        if ($hasDocs > 0) {
            throw new Exception("No se puede eliminar el item porque tiene documentos asociados. Elimine los documentos primero.");
        }

        // Delete associated tracking (if any)
        $conn->prepare("DELETE FROM iso_tracking WHERE item_id = ?")->execute([$id]);

        // Delete subitem evaluations (if table exists) and subitems to avoid FK issues
        try {
            $conn->prepare("
                DELETE e FROM iso_subitem_evaluaciones e
                JOIN iso_checklist_subitems s ON s.id = e.subitem_id
                WHERE s.item_id = ?
            ")->execute([$id]);
        } catch (Throwable $e) {
        }
        $conn->prepare("DELETE FROM iso_checklist_subitems WHERE item_id = ?")->execute([$id]);
        
        // Delete item
        $conn->prepare("DELETE FROM iso_checklist_items WHERE id = ?")->execute([$id]);
        
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'upload_document' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $empresa_id = $_POST['empresa_id'];
        $norma_id = $_POST['norma_id'];
        $item_id = $_POST['item_id'];
        $subitem_id = !empty($_POST['subitem_id']) ? $_POST['subitem_id'] : null;
        $mes = !empty($_POST['mes']) ? trim((string)$_POST['mes']) : null;
        if ($mes !== null && !preg_match('/^\d{4}-\d{2}$/', $mes)) {
            throw new Exception("Formato de mes inválido. Use YYYY-MM");
        }
        if ($subitem_id && $mes === null) {
            $mes = date('Y-m');
        }
        
        // Check if we have files (either single 'file' or multiple 'files')
        $files = [];
        if (isset($_FILES['files'])) {
            // Re-organize $_FILES array for easier iteration
            $count = count($_FILES['files']['name']);
            for ($i = 0; $i < $count; $i++) {
                if ($_FILES['files']['error'][$i] === UPLOAD_ERR_OK) {
                    $files[] = [
                        'name' => $_FILES['files']['name'][$i],
                        'type' => $_FILES['files']['type'][$i],
                        'tmp_name' => $_FILES['files']['tmp_name'][$i],
                        'error' => $_FILES['files']['error'][$i],
                        'size' => $_FILES['files']['size'][$i]
                    ];
                }
            }
        } elseif (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            // Legacy support or single file upload
            $files[] = $_FILES['file'];
        }

        if (empty($files)) throw new Exception("No se han subido archivos válidos");

        if ($subitem_id && count($files) > 1) {
            $files = [ $files[0] ];
        }
        
        // Ensure tracking record exists
        $stmtId = $conn->prepare("SELECT id FROM iso_tracking WHERE empresa_id=? AND norma_id=? AND item_id=?");
        $stmtId->execute([$empresa_id, $norma_id, $item_id]);
        $trackingId = $stmtId->fetchColumn();
        
        if (!$trackingId) {
            // Create default pending tracking record
            $conn->prepare("INSERT INTO iso_tracking (empresa_id, norma_id, item_id) VALUES (?, ?, ?)")
                 ->execute([$empresa_id, $norma_id, $item_id]);
            $trackingId = $conn->lastInsertId();
        }

        $uploadDir = 'uploads/iso/';
        if (!file_exists($uploadDir)) mkdir($uploadDir, 0777, true);
        
        $allowedExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'jpg', 'jpeg', 'png'];
        $uploadedCount = 0;
        $errors = [];

        $hasSubitemCol = $subitem_id ? iso_column_exists($conn, 'iso_documentos', 'subitem_id') : false;
        if ($subitem_id && !$hasSubitemCol) {
            try {
                $conn->exec("ALTER TABLE iso_documentos ADD COLUMN subitem_id INT NULL AFTER tracking_id");
                $hasSubitemCol = iso_column_exists($conn, 'iso_documentos', 'subitem_id');
            } catch (Throwable $e) {
                $hasSubitemCol = iso_column_exists($conn, 'iso_documentos', 'subitem_id');
            }
        }

        $hasMesCol = ($subitem_id && $mes !== null) ? iso_column_exists($conn, 'iso_documentos', 'mes') : false;
        if ($subitem_id && $mes !== null && !$hasMesCol) {
            try {
                $conn->exec("ALTER TABLE iso_documentos ADD COLUMN mes VARCHAR(7) NULL AFTER subitem_id");
                $hasMesCol = iso_column_exists($conn, 'iso_documentos', 'mes');
            } catch (Throwable $e) {
                $hasMesCol = iso_column_exists($conn, 'iso_documentos', 'mes');
            }
        }
        
        foreach ($files as $file) {
            $fileName = $file['name'];
            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            
            if (!in_array($ext, $allowedExts)) {
                $errors[] = "Tipo no permitido: $fileName";
                continue; 
            }
            
            $uniqueName = time() . '_' . uniqid() . '_' . basename($fileName);
            $targetPath = $uploadDir . $uniqueName;
            
            if (move_uploaded_file($file['tmp_name'], $targetPath)) {
                if ($subitem_id && $hasSubitemCol && $hasMesCol && $mes !== null) {
                    $stmtPrev = $conn->prepare("SELECT id, ruta_archivo, nombre_archivo FROM iso_documentos WHERE tracking_id = ? AND subitem_id = ? AND mes = ? LIMIT 1");
                    $stmtPrev->execute([$trackingId, $subitem_id, $mes]);
                    $prev = $stmtPrev->fetch(PDO::FETCH_ASSOC);
                    if ($prev) {
                        if (!empty($prev['ruta_archivo']) && file_exists($prev['ruta_archivo'])) {
                            unlink($prev['ruta_archivo']);
                        }
                        $conn->prepare("DELETE FROM iso_documentos WHERE id = ?")->execute([$prev['id']]);
                    }

                    $conn->prepare("INSERT INTO iso_documentos (tracking_id, subitem_id, mes, nombre_archivo, ruta_archivo, tipo_archivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
                         ->execute([$trackingId, $subitem_id, $mes, $fileName, $targetPath, $file['type'], $usuario_id]);
                } elseif ($subitem_id && $hasSubitemCol) {
                    $conn->prepare("INSERT INTO iso_documentos (tracking_id, subitem_id, nombre_archivo, ruta_archivo, tipo_archivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?)")
                         ->execute([$trackingId, $subitem_id, $fileName, $targetPath, $file['type'], $usuario_id]);
                } else {
                    $conn->prepare("INSERT INTO iso_documentos (tracking_id, nombre_archivo, ruta_archivo, tipo_archivo, usuario_id) VALUES (?, ?, ?, ?, ?)")
                         ->execute([$trackingId, $fileName, $targetPath, $file['type'], $usuario_id]);
                }
                
                // Log History
                $detail = "Archivo: {$fileName}" . ($subitem_id ? " (Subitem ID: {$subitem_id}" . ($mes ? ", Mes: {$mes}" : "") . ")" : "");
                $conn->prepare("INSERT INTO iso_historial (tracking_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)")
                     ->execute([$trackingId, $usuario_id, 'SUBIDA_DOC', $detail]);
                     
                $uploadedCount++;
            } else {
                $errors[] = "Error moviendo archivo: $fileName";
            }
        }
        
        if ($uploadedCount === 0) {
            throw new Exception("No se pudo subir ningún archivo. " . implode(", ", $errors));
        }
        
        echo json_encode(['success' => true, 'count' => $uploadedCount, 'errors' => $errors]);
    }

    elseif ($action === 'delete_document') {
        $id = $_GET['id'];
        $stmt = $conn->prepare("SELECT * FROM iso_documentos WHERE id = ?");
        $stmt->execute([$id]);
        $doc = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($doc) {
            if (file_exists($doc['ruta_archivo'])) unlink($doc['ruta_archivo']);
            
            $conn->prepare("DELETE FROM iso_documentos WHERE id = ?")->execute([$id]);
            
            // Log
            $conn->prepare("INSERT INTO iso_historial (tracking_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)")
                 ->execute([$doc['tracking_id'], $usuario_id, 'ELIMINACION_DOC', "Archivo: {$doc['nombre_archivo']}"]);
        }
        echo json_encode(['success' => true]);
    }
    
    elseif ($action === 'get_item_history') {
        $tracking_id = $_GET['tracking_id'];
        $stmt = $conn->prepare("
            SELECT h.*, u.usuario as usuario_nombre 
            FROM iso_historial h 
            LEFT JOIN usuarios u ON h.usuario_id = u.id 
            WHERE h.tracking_id = ? 
            ORDER BY h.created_at DESC
        ");
        $stmt->execute([$tracking_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif ($action === 'report_builder') {
        $date_from = $_GET['date_from'] ?? null;
        $date_to = $_GET['date_to'] ?? null;
        $empresa_ids = !empty($_GET['empresa_ids']) ? array_filter(array_map('intval', explode(',', $_GET['empresa_ids']))) : [];
        $norma_ids = !empty($_GET['norma_ids']) ? array_filter(array_map('intval', explode(',', $_GET['norma_ids']))) : [];
        $usuario_ids = !empty($_GET['usuario_ids']) ? array_filter(array_map('intval', explode(',', $_GET['usuario_ids']))) : [];
        
        $sql = "
            SELECT 
                t.id as tracking_id,
                e.nombre as empresa,
                n.codigo as norma_codigo,
                n.nombre as norma_nombre,
                i.categoria, i.numeral, i.requisito, i.descripcion_requisito,
                t.estado, t.fecha_programada, t.fecha_limite, t.fecha_ejecucion,
                (SELECT COUNT(*) FROM iso_documentos d WHERE d.tracking_id = t.id) as documentos_count
            FROM iso_tracking t
            JOIN iso_empresas e ON t.empresa_id = e.id
            JOIN iso_normas n ON t.norma_id = n.id
            JOIN iso_checklist_items i ON t.item_id = i.id
            WHERE 1=1
        ";
        $params = [];
        
        if (!empty($empresa_ids)) {
            $in = implode(',', array_fill(0, count($empresa_ids), '?'));
            $sql .= " AND t.empresa_id IN ($in)";
            $params = array_merge($params, $empresa_ids);
        }
        if (!empty($norma_ids)) {
            $in = implode(',', array_fill(0, count($norma_ids), '?'));
            $sql .= " AND t.norma_id IN ($in)";
            $params = array_merge($params, $norma_ids);
        }
        if ($date_from && $date_to) {
            $sql .= " AND ( 
                (t.fecha_programada BETWEEN ? AND ?) OR 
                (t.fecha_ejecucion BETWEEN ? AND ?) OR 
                (t.fecha_limite BETWEEN ? AND ?) OR
                EXISTS(SELECT 1 FROM iso_documentos d WHERE d.tracking_id=t.id AND DATE(d.created_at) BETWEEN ? AND ?) OR
                EXISTS(SELECT 1 FROM iso_historial h WHERE h.tracking_id=t.id AND DATE(h.created_at) BETWEEN ? AND ?)
            )";
            $params = array_merge($params, [$date_from, $date_to, $date_from, $date_to, $date_from, $date_to, $date_from, $date_to, $date_from, $date_to]);
        }
        if (!empty($usuario_ids)) {
            $in = implode(',', array_fill(0, count($usuario_ids), '?'));
            $sql .= " AND ( 
                EXISTS(SELECT 1 FROM iso_documentos d WHERE d.tracking_id=t.id AND d.usuario_id IN ($in)) OR
                EXISTS(SELECT 1 FROM iso_historial h WHERE h.tracking_id=t.id AND h.usuario_id IN ($in))
            )";
            $params = array_merge($params, $usuario_ids, $usuario_ids);
        }
        
        $sql .= " ORDER BY e.nombre, n.codigo, i.orden";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode(['rows' => $rows]);
    }

    elseif ($action === 'list_iso_users') {
        $sql = "
            SELECT DISTINCT u.id, u.usuario, u.nombre_real
            FROM usuarios u
            WHERE EXISTS (SELECT 1 FROM iso_documentos d WHERE d.usuario_id = u.id)
               OR EXISTS (SELECT 1 FROM iso_historial h WHERE h.usuario_id = u.id)
            ORDER BY COALESCE(u.nombre_real, u.usuario)
        ";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($users);
    }

    // ==========================================
    // DASHBOARD: CERTIFICADOS POR VENCER (MULTI-EMPRESA)
    // ==========================================
    elseif ($action === 'dashboard_certificados') {
        $days = isset($_GET['days']) ? (int)$_GET['days'] : 90;
        if ($days <= 0) $days = 90;
        $today = date('Y-m-d');
        $limitDate = date('Y-m-d', strtotime("+{$days} days"));
        
        $sql = "
            SELECT 
                t.id as tracking_id,
                t.empresa_id,
                t.norma_id,
                t.item_id,
                t.estado,
                t.fecha_programada,
                t.fecha_limite,
                t.fecha_ejecucion,
                t.observaciones_internas,
                e.nombre as empresa,
                n.codigo as norma_codigo,
                n.nombre as norma_nombre,
                i.categoria,
                i.numeral,
                i.requisito
            FROM iso_tracking t
            JOIN iso_empresas e ON t.empresa_id = e.id
            JOIN iso_normas n ON t.norma_id = n.id
            JOIN iso_checklist_items i ON t.item_id = i.id
            WHERE 
                t.fecha_limite IS NOT NULL
                AND t.fecha_limite BETWEEN ? AND ?
                AND (LOWER(i.requisito) LIKE '%certific%' OR LOWER(i.categoria) LIKE '%certific%')
                AND t.estado NOT IN ('Ejecutado', 'No aplica')
            ORDER BY t.fecha_limite ASC, e.nombre ASC
        ";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$today, $limitDate]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Enrich with days remaining
        foreach ($rows as &$r) {
            $r['dias_restantes'] = (int) floor((strtotime($r['fecha_limite']) - strtotime($today)) / 86400);
            $r['norma'] = trim(($r['norma_codigo'] ?? '') . ' ' . ($r['norma_nombre'] ?? ''));
        }
        echo json_encode($rows);
    }

    // ==========================================
    // SUBITEMS & EVALUACIONES MENSUALES
    // ==========================================

    elseif ($action === 'get_subitems') {
        $item_id = $_GET['item_id'] ?? 0;
        $empresa_id = $_GET['empresa_id'] ?? 0;
        $anio = $_GET['anio'] ?? date('Y');
        $norma_id = $_GET['norma_id'] ?? 0; // Should be passed if possible, otherwise we infer from item?
        // Actually, item_id is unique enough, but tracking needs empresa_id.

        if (!$item_id) throw new Exception("Item ID is required");

        $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
        if (!$hasFechaProgCol) {
            try {
                $conn->exec("ALTER TABLE iso_subitem_evaluaciones ADD COLUMN fecha_programada DATE NULL AFTER anio");
                $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
            } catch (Throwable $e) {
                $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
            }
        }
        $fechaProgSelect = $hasFechaProgCol ? ", e.fecha_programada" : "";
        
        // Fetch subitems with their annual evaluation data
        $sql = "SELECT s.*, 
                       e.hallazgos, e.estado as estado_anual{$fechaProgSelect},
                       e.ene_p, e.ene_e,
                       e.feb_p, e.feb_e,
                       e.mar_p, e.mar_e,
                       e.abr_p, e.abr_e,
                       e.may_p, e.may_e,
                       e.jun_p, e.jun_e,
                       e.jul_p, e.jul_e,
                       e.ago_p, e.ago_e,
                       e.sep_p, e.sep_e,
                       e.oct_p, e.oct_e,
                       e.nov_p, e.nov_e,
                       e.dic_p, e.dic_e
                FROM iso_checklist_subitems s
                LEFT JOIN iso_subitem_evaluaciones e 
                ON s.id = e.subitem_id AND e.empresa_id = ? AND e.anio = ?
                WHERE s.item_id = ? 
                ORDER BY s.id";
                
        $stmt = $conn->prepare($sql);
        $stmt->execute([$empresa_id, $anio, $item_id]);
        $subitems = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch documents for these subitems
        // First get tracking_id for this item/empresa context
        // If norma_id is not passed, we can try to find tracking just by item_id and empresa_id
        // (Assuming item_id belongs to a norma, and tracking is unique for item+empresa)
        $stmtTracking = $conn->prepare("SELECT id FROM iso_tracking WHERE item_id = ? AND empresa_id = ?");
        $stmtTracking->execute([$item_id, $empresa_id]);
        $trackingId = $stmtTracking->fetchColumn();

        if ($trackingId) {
            $hasMesCol = iso_column_exists($conn, 'iso_documentos', 'mes');
            $select = "id, subitem_id, nombre_archivo, ruta_archivo, tipo_archivo, created_at";
            if ($hasMesCol) $select .= ", mes";
            $stmtDocs = $conn->prepare("SELECT {$select} FROM iso_documentos WHERE tracking_id = ? AND subitem_id IS NOT NULL");
            $stmtDocs->execute([$trackingId]);
            $documents = $stmtDocs->fetchAll(PDO::FETCH_ASSOC);
            if (!$hasMesCol) {
                foreach ($documents as &$d) {
                    $d['mes'] = !empty($d['created_at']) ? date('Y-m', strtotime($d['created_at'])) : null;
                }
                unset($d);
            }

            // Attach documents to subitems
            foreach ($subitems as &$sub) {
                $sub['documentos'] = array_values(array_filter($documents, function($d) use ($sub) {
                    return $d['subitem_id'] == $sub['id'];
                }));
            }
        } else {
             foreach ($subitems as &$sub) {
                $sub['documentos'] = [];
            }
        }

        echo json_encode($subitems);
    }

    elseif ($action === 'create_subitem' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $item_id = $data['item_id'];
        $descripcion = $data['descripcion'];
        $literal = $data['literal'] ?? '';
        
        if (empty($item_id) || empty($descripcion)) {
            throw new Exception("Item ID y Descripción son obligatorios");
        }

        $stmt = $conn->prepare("INSERT INTO iso_checklist_subitems (item_id, descripcion, literal) VALUES (?, ?, ?)");
        $stmt->execute([$item_id, $descripcion, $literal]);
        
        echo json_encode(['success' => true, 'id' => $conn->lastInsertId()]);
    }

    elseif ($action === 'update_subitem' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $id = $data['id'];
        $descripcion = $data['descripcion'];
        $literal = $data['literal'] ?? '';
        
        if (empty($id) || empty($descripcion)) {
            throw new Exception("ID y Descripción son obligatorios");
        }

        $stmt = $conn->prepare("UPDATE iso_checklist_subitems SET descripcion = ?, literal = ? WHERE id = ?");
        $stmt->execute([$descripcion, $literal, $id]);
        
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'delete_subitem') {
        $id = $_GET['id'] ?? 0;
        if (!$id) throw new Exception("ID is required");

        $hasSubitemCol = iso_column_exists($conn, 'iso_documentos', 'subitem_id');
        if ($hasSubitemCol) {
            $stmtDocs = $conn->prepare("SELECT id, tracking_id, nombre_archivo, ruta_archivo FROM iso_documentos WHERE subitem_id = ?");
            $stmtDocs->execute([$id]);
            $docs = $stmtDocs->fetchAll(PDO::FETCH_ASSOC);
            foreach ($docs as $doc) {
                if (!empty($doc['ruta_archivo']) && file_exists($doc['ruta_archivo'])) {
                    unlink($doc['ruta_archivo']);
                }
                $conn->prepare("DELETE FROM iso_documentos WHERE id = ?")->execute([$doc['id']]);
                if (!empty($doc['tracking_id'])) {
                    $conn->prepare("INSERT INTO iso_historial (tracking_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)")
                         ->execute([$doc['tracking_id'], $usuario_id, 'ELIMINACION_DOC', "Archivo: {$doc['nombre_archivo']}"]);
                }
            }
        }
        
        try {
            $conn->prepare("DELETE FROM iso_subitem_evaluaciones WHERE subitem_id = ?")->execute([$id]);
        } catch (Throwable $e) {
        }
        $conn->prepare("DELETE FROM iso_checklist_subitems WHERE id = ?")->execute([$id]);
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'save_subitem_evaluation' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $subitem_id = $data['subitem_id'];
        $empresa_id = $data['empresa_id'];
        $anio = $data['anio'];
        
        if (empty($subitem_id) || empty($empresa_id) || empty($anio)) {
            throw new Exception("Datos incompletos para evaluación");
        }
        
        $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
        if (!$hasFechaProgCol) {
            try {
                $conn->exec("ALTER TABLE iso_subitem_evaluaciones ADD COLUMN fecha_programada DATE NULL AFTER anio");
                $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
            } catch (Throwable $e) {
                $hasFechaProgCol = iso_column_exists($conn, 'iso_subitem_evaluaciones', 'fecha_programada');
            }
        }

        // Optional fields
        $hallazgos = $data['hallazgos'] ?? '';
        $estado = $data['estado'] ?? 'Pendiente';
        $fecha_programada = $data['fecha_programada'] ?? null;
        if ($fecha_programada === '') $fecha_programada = null;
        if ($fecha_programada !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$fecha_programada)) {
            throw new Exception("Formato de fecha_programada inválido. Use YYYY-MM-DD");
        }
        
        // Grid fields construction
        $months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        if ($hasFechaProgCol) {
            $params = [$subitem_id, $empresa_id, $anio, $fecha_programada, $hallazgos, $estado];
            $updateParts = ["fecha_programada = VALUES(fecha_programada)", "hallazgos = VALUES(hallazgos)", "estado = VALUES(estado)"];
            $placeholders = "?, ?, ?, ?, ?, ?";
            $columns = "subitem_id, empresa_id, anio, fecha_programada, hallazgos, estado";
        } else {
            $params = [$subitem_id, $empresa_id, $anio, $hallazgos, $estado];
            $updateParts = ["hallazgos = VALUES(hallazgos)", "estado = VALUES(estado)"];
            $placeholders = "?, ?, ?, ?, ?";
            $columns = "subitem_id, empresa_id, anio, hallazgos, estado";
        }
        
        foreach ($months as $m) {
            // Check if key exists, otherwise default to 0 (false)
            $p = !empty($data["{$m}_p"]) ? 1 : 0;
            $e = !empty($data["{$m}_e"]) ? 1 : 0;
            
            $columns .= ", {$m}_p, {$m}_e";
            $placeholders .= ", ?, ?";
            $params[] = $p;
            $params[] = $e;
            
            $updateParts[] = "{$m}_p = VALUES({$m}_p)";
            $updateParts[] = "{$m}_e = VALUES({$m}_e)";
        }
        
        $sql = "INSERT INTO iso_subitem_evaluaciones ($columns) VALUES ($placeholders)
                ON DUPLICATE KEY UPDATE " . implode(", ", $updateParts);
                
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'send_alerts') {
        // Fetch pending/overdue items
        $today = date('Y-m-d');
        $nextWeek = date('Y-m-d', strtotime('+7 days'));
        
        $sql = "
            SELECT t.*, e.nombre as empresa, n.codigo as norma, i.requisito 
            FROM iso_tracking t
            JOIN iso_empresas e ON t.empresa_id = e.id
            JOIN iso_normas n ON t.norma_id = n.id
            JOIN iso_checklist_items i ON t.item_id = i.id
            WHERE (t.estado = 'Retrasado' OR (t.fecha_limite BETWEEN ? AND ? AND t.estado NOT IN ('Ejecutado', 'No aplica')))
            AND t.fecha_limite IS NOT NULL
            ORDER BY e.nombre, t.fecha_limite ASC
        ";
        
        $stmt = $conn->prepare($sql);
        $stmt->execute([$today, $nextWeek]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (count($items) > 0) {
            // Get SMTP Settings
            $smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_email', 'smtp_from_name'];
            $stmtSettings = $conn->prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('" . implode("','", $smtpKeys) . "')");
            $stmtSettings->execute();
            $settings = $stmtSettings->fetchAll(PDO::FETCH_KEY_PAIR);
            
            if (empty($settings['smtp_host'])) {
                 // Skip email if no config, but return items found
                 echo json_encode(['success' => false, 'message' => 'Alertas encontradas pero falta configuración SMTP.', 'items' => $items]);
                 exit;
            }

            $mail = new PHPMailer(true);
            try {
                $mail->isSMTP();
                $mail->Host       = $settings['smtp_host'];
                $mail->SMTPAuth   = true;
                $mail->Username   = $settings['smtp_user'];
                $mail->Password   = $settings['smtp_pass'];
                $mail->SMTPSecure = $settings['smtp_secure'];
                $mail->Port       = $settings['smtp_port'];
                
                $fromEmail = $settings['smtp_from_email'] ?: 'noreply@erp.com';
                $fromName = $settings['smtp_from_name'] ?: 'ERP ISO System';
                
                $mail->setFrom($fromEmail, $fromName);
                $mail->addAddress($fromEmail); // Send to admin
                
                $mail->isHTML(true);
                $mail->Subject = 'Alerta de Vencimientos ISO - ' . date('d/m/Y');
                
                $body = "<h2>Reporte de Items Vencidos o Próximos a Vencer</h2>";
                $body .= "<p>Se han detectado <strong>" . count($items) . "</strong> items que requieren atención.</p>";
                $body .= "<table border='1' cellpadding='5' style='border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px;'>";
                $body .= "<tr style='background-color: #f2f2f2;'><th>Empresa</th><th>Norma</th><th>Requisito</th><th>Estado</th><th>Fecha Límite</th></tr>";
                
                foreach ($items as $item) {
                    $color = $item['estado'] == 'Retrasado' ? '#ffcccc' : '#ffffcc';
                    $body .= "<tr style='background-color: {$color};'>";
                    $body .= "<td>" . htmlspecialchars($item['empresa']) . "</td>";
                    $body .= "<td>" . htmlspecialchars($item['norma']) . "</td>";
                    $body .= "<td>" . htmlspecialchars($item['requisito']) . "</td>";
                    $body .= "<td>" . htmlspecialchars($item['estado']) . "</td>";
                    $body .= "<td>" . htmlspecialchars($item['fecha_limite']) . "</td>";
                    $body .= "</tr>";
                }
                $body .= "</table>";
                
                $mail->Body = $body;
                $mail->send();
                
                echo json_encode(['success' => true, 'message' => count($items) . ' alertas enviadas por correo.', 'items' => $items]);
            } catch (Exception $e) {
                echo json_encode(['success' => false, 'message' => 'Error enviando correo: ' . $mail->ErrorInfo, 'items' => $items]);
            }
        } else {
            echo json_encode(['success' => true, 'message' => 'No hay alertas pendientes.', 'items' => []]);
        }
    }

    elseif ($action === 'get_dashboard_stats') {
        $empresa_id = $_GET['empresa_id'];
        $norma_id = $_GET['norma_id'] ?? null;
        
        $where = "WHERE t.empresa_id = ?";
        $params = [$empresa_id];
        
        if ($norma_id) {
            $where .= " AND t.norma_id = ?";
            $params[] = $norma_id;
        }
        
        $stmt = $conn->prepare("
            SELECT t.estado, COUNT(*) as count 
            FROM iso_tracking t 
            $where 
            GROUP BY t.estado
        ");
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    // ==========================================
    // OLD AUDIT ACTIONS (BACKWARD COMPATIBILITY)
    // ==========================================

    elseif ($action === 'list_checklists') {
        $stmt = $conn->query("SELECT * FROM iso_checklists ORDER BY nombre");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    elseif ($action === 'get_checklist') {
        $id = $_GET['id'] ?? 0;
        $stmt = $conn->prepare("SELECT * FROM iso_checklists WHERE id = ?");
        $stmt->execute([$id]);
        $checklist = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($checklist) {
            $stmtItems = $conn->prepare("SELECT * FROM iso_checklist_items WHERE checklist_id = ? ORDER BY orden");
            $stmtItems->execute([$id]);
            $checklist['items'] = $stmtItems->fetchAll(PDO::FETCH_ASSOC);
        }
        
        echo json_encode($checklist);
    }
    elseif ($action === 'list_audits') {
        $stmt = $conn->query("
            SELECT a.*, c.nombre as checklist_nombre 
            FROM iso_audits a 
            JOIN iso_checklists c ON a.checklist_id = c.id 
            ORDER BY a.created_at DESC
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    elseif ($action === 'get_audit') {
        $id = $_GET['id'] ?? 0;
        $stmt = $conn->prepare("SELECT * FROM iso_audits WHERE id = ?");
        $stmt->execute([$id]);
        $audit = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($audit) {
            $stmtDetails = $conn->prepare("
                SELECT d.*, i.requisito, i.categoria 
                FROM iso_audit_details d 
                JOIN iso_checklist_items i ON d.item_id = i.id 
                WHERE d.audit_id = ? 
                ORDER BY i.orden
            ");
            $stmtDetails->execute([$id]);
            $audit['details'] = $stmtDetails->fetchAll(PDO::FETCH_ASSOC);
        }
        
        echo json_encode($audit);
    }
    elseif ($action === 'save_audit' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['checklist_id'])) {
            throw new Exception("Checklist ID is required");
        }

        $conn->beginTransaction();

        if (empty($data['id'])) {
            // Create
            $stmt = $conn->prepare("
                INSERT INTO iso_audits (checklist_id, cliente_nombre, n_contrato, direccion, representante_direccion, alcance, objetivo, fecha_auditoria, juicio_final, observaciones_finales, estado) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['checklist_id'],
                $data['cliente_nombre'] ?? '',
                $data['n_contrato'] ?? '',
                $data['direccion'] ?? '',
                $data['representante_direccion'] ?? '',
                $data['alcance'] ?? '',
                $data['objetivo'] ?? '',
                $data['fecha_auditoria'] ?? date('Y-m-d'),
                $data['juicio_final'] ?? null,
                $data['observaciones_finales'] ?? '',
                $data['estado'] ?? 'borrador'
            ]);
            $auditId = $conn->lastInsertId();
        } else {
            // Update
            $auditId = $data['id'];
            $stmt = $conn->prepare("
                UPDATE iso_audits SET 
                    cliente_nombre = ?, n_contrato = ?, direccion = ?, representante_direccion = ?, 
                    alcance = ?, objetivo = ?,
                    fecha_auditoria = ?, juicio_final = ?, observaciones_finales = ?, estado = ? 
                WHERE id = ?
            ");
            $stmt->execute([
                $data['cliente_nombre'] ?? '',
                $data['n_contrato'] ?? '',
                $data['direccion'] ?? '',
                $data['representante_direccion'] ?? '',
                $data['alcance'] ?? '',
                $data['objetivo'] ?? '',
                $data['fecha_auditoria'] ?? date('Y-m-d'),
                $data['juicio_final'] ?? null,
                $data['observaciones_finales'] ?? '',
                $data['estado'] ?? 'borrador',
                $auditId
            ]);
            
            // Delete old details to replace
            $conn->prepare("DELETE FROM iso_audit_details WHERE audit_id = ?")->execute([$auditId]);
        }

        // Save details
        if (!empty($data['details'])) {
            $stmtDetail = $conn->prepare("
                INSERT INTO iso_audit_details (audit_id, item_id, hallazgos, es_nc, es_obs, verificado) 
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($data['details'] as $detail) {
                $stmtDetail->execute([
                    $auditId,
                    $detail['item_id'],
                    $detail['hallazgos'] ?? '',
                    isset($detail['es_nc']) && $detail['es_nc'] ? 1 : 0,
                    isset($detail['es_obs']) && $detail['es_obs'] ? 1 : 0,
                    isset($detail['verificado']) && $detail['verificado'] ? 1 : 0
                ]);
            }
        }

        $conn->commit();
        echo json_encode(['success' => true, 'id' => $auditId]);
    }
    elseif ($action === 'delete_audit' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = $_GET['id'] ?? 0;
        $conn->prepare("DELETE FROM iso_audits WHERE id = ?")->execute([$id]);
        echo json_encode(['success' => true]);
    }
    else {
        throw new Exception("Invalid action");
    }

} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
