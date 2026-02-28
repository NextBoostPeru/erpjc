<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';

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
$keys = [
    'asistencia_horario_lv_entrada',
    'asistencia_horario_lv_salida',
    'asistencia_horario_sab_entrada',
    'asistencia_horario_sab_salida'
];

try {
    if ($method === 'GET') {
        $placeholders = implode(',', array_fill(0, count($keys), '?'));
        $stmt = $conn->prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ($placeholders)");
        $stmt->execute($keys);
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        // Defaults if not set
        $response = [
            'asistencia_horario_lv_entrada' => $settings['asistencia_horario_lv_entrada'] ?? '08:00',
            'asistencia_horario_lv_salida' => $settings['asistencia_horario_lv_salida'] ?? '17:30',
            'asistencia_horario_sab_entrada' => $settings['asistencia_horario_sab_entrada'] ?? '08:00',
            'asistencia_horario_sab_salida' => $settings['asistencia_horario_sab_salida'] ?? '13:00'
        ];
        
        echo json_encode($response);
        
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        $conn->beginTransaction();
        $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?");
        
        foreach ($keys as $key) {
            if (isset($data[$key])) {
                $stmt->execute([$key, $data[$key], $data[$key]]);
            }
        }
        
        $conn->commit();
        echo json_encode(["message" => "Horarios guardados correctamente"]);
    }
} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}

if (isset($conn)) $conn = null;
?>
