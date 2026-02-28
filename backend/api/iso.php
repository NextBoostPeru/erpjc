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
require '../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$action = $_GET['action'] ?? '';

// Authenticate and get User ID
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);
$usuario_id = $userData ? $userData->id : ($_GET['usuario_id'] ?? 1);

try {
    // ==========================================
    // NUEVA GESTIÓN ISO (MULTI-EMPRESA & TRACKING)
    // ==========================================

    if ($action === 'list_empresas') {
        $stmt = $conn->query("SELECT * FROM iso_empresas ORDER BY nombre");
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
        $stmtItems = $conn->prepare("
            SELECT i.*, 
                t.id as tracking_id, t.estado, t.fecha_programada, t.fecha_limite, t.fecha_ejecucion, t.observaciones_internas
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
                $stmtDocs = $conn->prepare("SELECT * FROM iso_documentos WHERE tracking_id = ?");
                $stmtDocs->execute([$item['tracking_id']]);
                $item['documentos'] = $stmtDocs->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $item['documentos'] = [];
            }

            // Subitems with status
            $stmtSub = $conn->prepare("
                SELECT s.*, e.estado as estado_anual 
                FROM iso_checklist_subitems s
                LEFT JOIN iso_subitem_evaluaciones e ON s.id = e.subitem_id AND e.empresa_id = ? AND e.anio = ?
                WHERE s.item_id = ? 
                ORDER BY s.id
            ");
            $stmtSub->execute([$empresa_id, date('Y'), $item['id']]);
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

        // Validation: Cannot be 'Ejecutado' without docs
        if ($data['estado'] === 'Ejecutado') {
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
            $data['estado'],
            $data['fecha_programada'] ?: null,
            $data['fecha_limite'] ?: null,
            $data['fecha_ejecucion'] ?: null,
            $data['observaciones_internas']
        ]);

        // Get the tracking ID (if it was new)
        if (!$trackingId) {
            $trackingId = $conn->lastInsertId();
        }

        // Log History only if state changed
        if ($previousState !== $data['estado']) {
            $detalle = "Estado: $previousState -> {$data['estado']}";
            $conn->prepare("INSERT INTO iso_historial (tracking_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)")
                 ->execute([$trackingId, $usuario_id, 'CAMBIO_ESTADO', $detalle]);
        } elseif ($data['observaciones_internas']) {
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

        // Calculate order
        $stmtOrder = $conn->prepare("SELECT MAX(orden) FROM iso_checklist_items WHERE norma_id = ?");
        $stmtOrder->execute([$norma_id]);
        $maxOrder = $stmtOrder->fetchColumn();
        $orden = $maxOrder ? $maxOrder + 1 : 1;

        $stmt = $conn->prepare("
            INSERT INTO iso_checklist_items (norma_id, categoria, numeral, requisito, descripcion_requisito, orden, no_requiere_subitems)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$norma_id, $categoria, $numeral, $requisito, $descripcion, $orden, $no_requiere_subitems]);
        
        echo json_encode(['success' => true, 'id' => $conn->lastInsertId()]);
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
        
        // Delete item
        $conn->prepare("DELETE FROM iso_checklist_items WHERE id = ?")->execute([$id]);
        
        echo json_encode(['success' => true]);
    }

    elseif ($action === 'upload_document' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $empresa_id = $_POST['empresa_id'];
        $norma_id = $_POST['norma_id'];
        $item_id = $_POST['item_id'];
        $subitem_id = !empty($_POST['subitem_id']) ? $_POST['subitem_id'] : null;
        
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
                $conn->prepare("INSERT INTO iso_documentos (tracking_id, subitem_id, nombre_archivo, ruta_archivo, tipo_archivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?)")
                     ->execute([$trackingId, $subitem_id, $fileName, $targetPath, $file['type'], $usuario_id]);
                
                // Log History
                $detail = "Archivo: {$fileName}" . ($subitem_id ? " (Subitem ID: {$subitem_id})" : "");
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
        
        // Fetch subitems with their annual evaluation data
        $sql = "SELECT s.*, 
                       e.hallazgos, e.estado as estado_anual,
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
            $stmtDocs = $conn->prepare("SELECT id, subitem_id, nombre_archivo, ruta_archivo, tipo_archivo, created_at FROM iso_documentos WHERE tracking_id = ? AND subitem_id IS NOT NULL");
            $stmtDocs->execute([$trackingId]);
            $documents = $stmtDocs->fetchAll(PDO::FETCH_ASSOC);

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
        
        // Optional fields
        $hallazgos = $data['hallazgos'] ?? '';
        $estado = $data['estado'] ?? 'Pendiente';
        
        // Grid fields construction
        $months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        $params = [$subitem_id, $empresa_id, $anio, $hallazgos, $estado];
        $updateParts = ["hallazgos = VALUES(hallazgos)", "estado = VALUES(estado)"];
        
        $placeholders = "?, ?, ?, ?, ?";
        $columns = "subitem_id, empresa_id, anio, hallazgos, estado";
        
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