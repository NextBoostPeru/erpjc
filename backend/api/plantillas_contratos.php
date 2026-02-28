<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Disable warning reporting to prevent JSON corruption
error_reporting(E_ERROR | E_PARSE);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';

// Validate JWT
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(['error' => 'Token inválido']);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;
$id = $_GET['id'] ?? null;

try {
    if ($method === 'GET') {
        if ($id) {
            // Get specific template with sections
            $stmt = $conn->prepare("SELECT * FROM plantillas_contratos WHERE id = ?");
            $stmt->execute([$id]);
            $template = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($template) {
                $stmtSections = $conn->prepare("SELECT * FROM secciones_contratos WHERE plantilla_id = ? ORDER BY orden ASC");
                $stmtSections->execute([$id]);
                $template['secciones'] = $stmtSections->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode($template);
            } else {
                http_response_code(404);
                echo json_encode(['message' => 'Plantilla no encontrada']);
            }
        } else {
            // List all templates
            $stmt = $conn->query("SELECT * FROM plantillas_contratos ORDER BY nombre ASC");
            $templates = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($templates);
        }
    } 
    elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);

        if ($action === 'create_template') {
            $stmt = $conn->prepare("INSERT INTO plantillas_contratos (nombre, tipo_contrato, descripcion) VALUES (?, ?, ?)");
            $stmt->execute([$data['nombre'], $data['tipo_contrato'], $data['descripcion']]);
            echo json_encode(['message' => 'Plantilla creada', 'id' => $conn->lastInsertId()]);
        } 
        elseif ($action === 'update_template') {
            $stmt = $conn->prepare("UPDATE plantillas_contratos SET nombre = ?, tipo_contrato = ?, descripcion = ? WHERE id = ?");
            $stmt->execute([$data['nombre'], $data['tipo_contrato'], $data['descripcion'], $data['id']]);
            echo json_encode(['message' => 'Plantilla actualizada']);
        }
        elseif ($action === 'create_section') {
            $stmt = $conn->prepare("INSERT INTO secciones_contratos (plantilla_id, titulo, contenido, orden) VALUES (?, ?, ?, ?)");
            $stmt->execute([$data['plantilla_id'], $data['titulo'], $data['contenido'], $data['orden']]);
            echo json_encode(['message' => 'Sección añadida', 'id' => $conn->lastInsertId()]);
        }
        elseif ($action === 'update_section') {
            $stmt = $conn->prepare("UPDATE secciones_contratos SET titulo = ?, contenido = ?, orden = ? WHERE id = ?");
            $stmt->execute([$data['titulo'], $data['contenido'], $data['orden'], $data['id']]);
            echo json_encode(['message' => 'Sección actualizada']);
        }
        elseif ($action === 'reorder_sections') {
             // Expects array of {id, orden}
             $sections = $data['sections'];
             $stmt = $conn->prepare("UPDATE secciones_contratos SET orden = ? WHERE id = ?");
             foreach ($sections as $section) {
                 $stmt->execute([$section['orden'], $section['id']]);
             }
             echo json_encode(['message' => 'Orden actualizado']);
        }
    }
    elseif ($method === 'DELETE') {
        if ($action === 'delete_section' && $id) {
            $stmt = $conn->prepare("DELETE FROM secciones_contratos WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['message' => 'Sección eliminada']);
        } 
        elseif ($id) {
             // Delete template (cascade deletes sections due to foreign key)
             $stmt = $conn->prepare("DELETE FROM plantillas_contratos WHERE id = ?");
             $stmt->execute([$id]);
             echo json_encode(['message' => 'Plantilla eliminada']);
        }
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['message' => 'Error de base de datos: ' . $e->getMessage()]);
}
?>