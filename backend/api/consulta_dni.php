<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';
require_once 'services/SunatService.php';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);
if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

rbac_require($conn, $userData, 'colaboradores', 'GET', 'lectura');

$dni = $_GET['dni'] ?? null;

if (!$dni) {
    http_response_code(400);
    echo json_encode(["message" => "DNI requerido."]);
    $conn = null;
    exit;
}

if (strlen($dni) !== 8) {
    http_response_code(400);
    echo json_encode(["message" => "El DNI debe tener 8 dígitos."]);
    $conn = null;
    exit;
}

try {
    // 1. Get Token from Empresa Config
    $query = "SELECT configuracion_sunat FROM empresa_datos LIMIT 1";
    $stmt = $conn->prepare($query);
    $stmt->execute();
    $empresa = $stmt->fetch(PDO::FETCH_ASSOC);

    $token = '';
    if ($empresa && !empty($empresa['configuracion_sunat'])) {
        $config = json_decode($empresa['configuracion_sunat'], true);
        $token = $config['apiperu_token'] ?? ($config['token'] ?? '');
    }

    if (empty($token)) {
        // Fallback or Error? 
        // For now, let's try with empty token, maybe SunatService handles free endpoints without it or has a default.
        // Actually SunatService uses token for Bearer auth.
        // If no token is configured, we can't guarantee success, but we'll try.
    }

    // 2. Call Service
    $sunatService = new SunatService($token);
    $result = $sunatService->consultarDNI($dni);

    if ($result['success']) {
        echo json_encode($result);
    } else {
        http_response_code(404);
        echo json_encode($result);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error interno: " . $e->getMessage()]);
}
if (isset($conn)) $conn = null;
?>
