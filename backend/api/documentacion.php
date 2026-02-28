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

$method = $_SERVER['REQUEST_METHOD'];
$uploadDir = __DIR__ . '/../uploads/documentos/';

try {
    switch ($method) {
        case 'GET':
            $colabId = isset($_GET['colaborador_id']) ? $_GET['colaborador_id'] : null;
            $type = isset($_GET['type']) ? $_GET['type'] : null;
            $alerts = isset($_GET['alerts']) ? true : false;

            $sql = "SELECT d.*, c.nombres, c.apellidos, c.documento_numero 
                    FROM documentos_laborales d
                    JOIN colaboradores c ON d.colaborador_id = c.id
                    WHERE 1=1";
            
            $params = [];

            if ($colabId) {
                $sql .= " AND d.colaborador_id = ?";
                $params[] = $colabId;
            }
            if ($type) {
                $sql .= " AND d.tipo_documento = ?";
                $params[] = $type;
            }
            if ($alerts) {
                // Documents expiring in the next 30 days
                $sql .= " AND d.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)";
            }

            $sql .= " ORDER BY d.fecha_vencimiento ASC, d.fecha_carga DESC";

            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Process URLs
            foreach ($data as &$row) {
                $row['url'] = '/backend/uploads/documentos/' . $row['nombre_archivo'];
            }

            echo json_encode($data);
            break;

        case 'POST':
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
                    if ($files['error'][$i] === UPLOAD_ERR_OK) {
                        $ext = pathinfo($files['name'][$i], PATHINFO_EXTENSION);
                        $filename = uniqid() . '_' . time() . '_' . $i . '.' . $ext;
                        $filepath = $uploadDir . $filename;

                        if (move_uploaded_file($files['tmp_name'][$i], $filepath)) {
                            $stmt = $conn->prepare("INSERT INTO documentos_laborales (colaborador_id, tipo_documento, nombre_archivo, ruta_archivo, fecha_vencimiento, comentario) VALUES (?, ?, ?, ?, ?, ?)");
                            $stmt->execute([$colaborador_id, $tipo, $filename, $filepath, $fecha_vencimiento, $comentario]);
                            $uploaded++;
                        }
                    }
                }
                
                if ($uploaded > 0) {
                    echo json_encode(['message' => "$uploaded documentos subidos correctamente"]);
                } else {
                    throw new Exception("No se pudieron subir los archivos");
                }

            } elseif (isset($_FILES['file'])) {
                // Single file (legacy support)
                $file = $_FILES['file'];
                $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
                $filename = uniqid() . '_' . time() . '.' . $ext;
                $filepath = $uploadDir . $filename;

                if (move_uploaded_file($file['tmp_name'], $filepath)) {
                    $stmt = $conn->prepare("INSERT INTO documentos_laborales (colaborador_id, tipo_documento, nombre_archivo, ruta_archivo, fecha_vencimiento, comentario) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$colaborador_id, $tipo, $filename, $filepath, $fecha_vencimiento, $comentario]);
                    echo json_encode(['message' => 'Documento subido correctamente']);
                } else {
                    throw new Exception("Error al mover el archivo");
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