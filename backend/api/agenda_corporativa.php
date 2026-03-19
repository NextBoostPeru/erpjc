<?php
require_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

// Validar Token
$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(['error' => 'Token inválido']);
    if (isset($conn)) if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

rbac_require($conn, $userData, 'agenda_corporativa', $method);

if ($method === 'GET') {
    // Listar eventos
    try {
        $stmt = $conn->query("SELECT * FROM agenda_corporativa ORDER BY fecha_inicio ASC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'POST') {
    // Crear evento
    $data = json_decode(file_get_contents('php://input'), true);
    
    try {
        $stmt = $conn->prepare("INSERT INTO agenda_corporativa (titulo, descripcion, fecha_inicio, fecha_fin, tipo, estado) VALUES (:titulo, :descripcion, :fecha_inicio, :fecha_fin, :tipo, :estado)");
        $stmt->execute([
            ':titulo' => $data['titulo'],
            ':descripcion' => $data['descripcion'] ?? '',
            ':fecha_inicio' => $data['fecha_inicio'],
            ':fecha_fin' => $data['fecha_fin'],
            ':tipo' => $data['tipo'],
            ':estado' => $data['estado'] ?? 'pendiente'
        ]);
        echo json_encode(['success' => true, 'id' => $conn->lastInsertId()]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} elseif ($method === 'DELETE') {
    // Eliminar evento
    $id = $_GET['id'] ?? null;
    if ($id) {
        try {
            $stmt = $conn->prepare("DELETE FROM agenda_corporativa WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
}
$conn = null;
?>
