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

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$resource = $_GET['resource'] ?? 'vacantes'; // vacantes, postulantes, entrevistas

try {
    switch ($resource) {
        case 'vacantes':
            handleVacantes($conn, $method);
            break;
        case 'postulantes':
            handlePostulantes($conn, $method);
            break;
        case 'entrevistas':
            handleEntrevistas($conn, $method);
            break;
        default:
            http_response_code(400);
            echo json_encode(["message" => "Recurso no válido"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;

function handleVacantes($conn, $method) {
    if ($method === 'GET') {
        $sql = "SELECT * FROM reclutamiento_vacantes ORDER BY created_at DESC";
        $stmt = $conn->query($sql);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"));
        $sql = "INSERT INTO reclutamiento_vacantes (titulo, departamento, descripcion, requisitos, fecha_cierre) 
                VALUES (?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$data->titulo, $data->departamento, $data->descripcion, $data->requisitos, $data->fecha_cierre ?? null]);
        echo json_encode(['success' => true, 'id' => $conn->lastInsertId()]);
    } elseif ($method === 'PUT') {
         $data = json_decode(file_get_contents("php://input"));
         $sql = "UPDATE reclutamiento_vacantes SET titulo=?, departamento=?, descripcion=?, requisitos=?, estado=? WHERE id=?";
         $stmt = $conn->prepare($sql);
         $stmt->execute([$data->titulo, $data->departamento, $data->descripcion, $data->requisitos, $data->estado, $data->id]);
         echo json_encode(['success' => true]);
    }
}

function handlePostulantes($conn, $method) {
    if ($method === 'GET') {
        $vacanteId = $_GET['vacante_id'] ?? null;
        $sql = "SELECT p.*, v.titulo as vacante_titulo 
                FROM reclutamiento_postulantes p 
                JOIN reclutamiento_vacantes v ON p.vacante_id = v.id";
        if ($vacanteId) {
            $sql .= " WHERE p.vacante_id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$vacanteId]);
        } else {
            $stmt = $conn->query($sql);
        }
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"));
        $sql = "INSERT INTO reclutamiento_postulantes (vacante_id, nombres, apellidos, email, telefono, cv_url) 
                VALUES (?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$data->vacante_id, $data->nombres, $data->apellidos, $data->email, $data->telefono, $data->cv_url ?? '']);
        echo json_encode(['success' => true, 'id' => $conn->lastInsertId()]);
    } elseif ($method === 'PUT') {
        // Change status mainly
        $data = json_decode(file_get_contents("php://input"));
        $sql = "UPDATE reclutamiento_postulantes SET estado=? WHERE id=?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$data->estado, $data->id]);
        echo json_encode(['success' => true]);
    }
}

function handleEntrevistas($conn, $method) {
    if ($method === 'GET') {
        $sql = "SELECT e.*, p.nombres, p.apellidos, v.titulo as vacante_titulo 
                FROM reclutamiento_entrevistas e
                JOIN reclutamiento_postulantes p ON e.postulante_id = p.id
                JOIN reclutamiento_vacantes v ON p.vacante_id = v.id
                ORDER BY e.fecha_programada ASC";
        $stmt = $conn->query($sql);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"));
        $sql = "INSERT INTO reclutamiento_entrevistas (postulante_id, entrevistador_id, fecha_programada, tipo, notas) 
                VALUES (?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$data->postulante_id, $data->entrevistador_id ?? null, $data->fecha_programada, $data->tipo, $data->notas ?? '']);
        
        // Update candidate status
        $conn->prepare("UPDATE reclutamiento_postulantes SET estado = 'entrevista' WHERE id = ?")->execute([$data->postulante_id]);
        
        echo json_encode(['success' => true]);
    }
}
