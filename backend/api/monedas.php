<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

if (!isset($conn)) {
    http_response_code(500);
    echo json_encode(["message" => "Error de conexión a base de datos"]);
    exit;
}
$db = $conn;

$method = $_SERVER['REQUEST_METHOD'];
$jwt = new JWTHandler();

$headers = getallheaders();
$authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';
$token = str_replace('Bearer ', '', $authHeader);
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

switch ($method) {
    case 'GET':
        // Consultar SUNAT (ApiPeruDev)
        if (isset($_GET['action']) && $_GET['action'] === 'consultar_sunat') {
            $fecha = $_GET['fecha'] ?? date('Y-m-d');
            require_once __DIR__ . '/services/SunatService.php';

            // Obtener configuración desde DB
            $stmtConfig = $db->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
            $stmtConfig->execute();
            $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
            $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];
            
            // Priorizar apiperu_token para consultas
            $token = $sunatConfig['apiperu_token'] ?? ''; 
            $url = $sunatConfig['apiperu_url'] ?? 'https://apiperu.dev/api/';

            $sunatService = new SunatService($token, $url);
            $result = $sunatService->consultarTipoCambio($fecha);
            
            if ($result['success']) {
                echo json_encode($result);
            } else {
                http_response_code(404);
                echo json_encode(["message" => $result['message']]);
            }
            if (isset($conn)) $conn = null;
            exit;
        }

        // If query param 'tipo_cambio' is present, fetch exchange rates
        if (isset($_GET['tipo_cambio'])) {
            $fecha = $_GET['fecha'] ?? date('Y-m-d');
            try {
                $query = "SELECT * FROM tipo_cambio WHERE fecha = :fecha";
                $stmt = $db->prepare($query);
                $stmt->bindParam(":fecha", $fecha);
                $stmt->execute();
                $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode($result);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["message" => "Error: " . $e->getMessage()]);
            }
        } else {
            // List all currencies
            try {
                $query = "SELECT * FROM monedas";
                $stmt = $db->prepare($query);
                $stmt->execute();
                $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode($result);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["message" => "Error: " . $e->getMessage()]);
            }
        }
        break;

    case 'POST':
        // Save exchange rate
        $data = json_decode(file_get_contents("php://input"));
        
        if (!isset($data->fecha) || !isset($data->compra) || !isset($data->venta)) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            // Upsert (Insert or Update on Duplicate Key)
            $query = "INSERT INTO tipo_cambio (fecha, moneda_origen, moneda_destino, compra, venta) 
                      VALUES (:fecha, :origen, :destino, :compra, :venta)
                      ON DUPLICATE KEY UPDATE compra = :compra_upd, venta = :venta_upd";
            
            $stmt = $db->prepare($query);
            
            $fecha = $data->fecha;
            $origen = $data->moneda_origen ?? 'USD';
            $destino = $data->moneda_destino ?? 'PEN';
            $compra = $data->compra;
            $venta = $data->venta;

            $stmt->bindParam(":fecha", $fecha);
            $stmt->bindParam(":origen", $origen);
            $stmt->bindParam(":destino", $destino);
            $stmt->bindParam(":compra", $compra);
            $stmt->bindParam(":venta", $venta);
            
            // For ON DUPLICATE KEY UPDATE
            $stmt->bindParam(":compra_upd", $compra);
            $stmt->bindParam(":venta_upd", $venta);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Tipo de cambio guardado correctamente"]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "No se pudo guardar el tipo de cambio"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;
}
if (isset($conn)) $conn = null;
?>
