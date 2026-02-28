<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', 'debug_cierre.log');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';

// Auth Helper
function getAuthorizationHeader(){
    $headers = null;
    if (isset($_SERVER['Authorization'])) {
        $headers = trim($_SERVER["Authorization"]);
    }
    else if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers = trim($_SERVER["HTTP_AUTHORIZATION"]);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }
    return $headers;
}

try {
    $authHeader = getAuthorizationHeader();
    $token = $authHeader ? str_replace('Bearer ', '', $authHeader) : null;
    if (!$token) throw new Exception("No token provided");

    $jwtHandler = new JWTHandler();
    $userData = $jwtHandler->validateToken($token);
    if (!$userData) throw new Exception("Token inválido");
    $userId = $userData->id;
} catch (Exception $e) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso denegado"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $periodo = $_GET['periodo'] ?? date('Y-m');
    
    // Check if exists
    $stmt = $conn->prepare("SELECT * FROM cierre_contable WHERE periodo = ?");
    $stmt->execute([$periodo]);
    $cierre = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$cierre) {
        // Initialize new period
        $conn->beginTransaction();
        try {
            $stmt = $conn->prepare("INSERT INTO cierre_contable (periodo, estado) VALUES (?, 'abierto')");
            $stmt->execute([$periodo]);
            $cierreId = $conn->lastInsertId();
            
            // Default Checklist
            $tasks = [
                "Conciliación Bancaria Completa",
                "Depreciación de Activos Generada",
                "Registro de Ventas Revisado",
                "Registro de Compras Revisado",
                "Cálculo de Impuestos (IGV/Renta)",
                "Asientos de Ajuste Registrados",
                "Revisión de Gastos Generales"
            ];
            
            $stmtTask = $conn->prepare("INSERT INTO cierre_checklist (cierre_id, tarea) VALUES (?, ?)");
            foreach ($tasks as $task) {
                $stmtTask->execute([$cierreId, $task]);
            }
            
            $conn->commit();
            
            // Fetch again
            $stmt = $conn->prepare("SELECT * FROM cierre_contable WHERE id = ?");
            $stmt->execute([$cierreId]);
            $cierre = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Error initializing period']);
            if (isset($conn)) $conn = null;
            exit;
        }
    }
    
    // Get checklist
    $stmt = $conn->prepare("SELECT * FROM cierre_checklist WHERE cierre_id = ?");
    $stmt->execute([$cierre['id']]);
    $checklist = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode(['success' => true, 'cierre' => $cierre, 'checklist' => $checklist]);

} elseif ($method === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    $action = $input['action'] ?? '';
    
    if ($action === 'toggle_task') {
        $taskId = $input['task_id'];
        $completed = $input['completed'] ? 1 : 0;
        
        $stmt = $conn->prepare("UPDATE cierre_checklist SET completado = ?, fecha_completado = NOW() WHERE id = ?");
        $stmt->execute([$completed, $taskId]);
        
        // Update Cierre status to 'en_proceso' if 'abierto'
        // (Optional logic could go here)
        
        echo json_encode(['success' => true]);
        
    } elseif ($action === 'close_period') {
        $cierreId = $input['cierre_id'];
        
        // Verify all tasks completed? (Optional)
        
        $stmt = $conn->prepare("UPDATE cierre_contable SET estado = 'cerrado', fecha_cierre = NOW(), usuario_cierre_id = ? WHERE id = ?");
        $stmt->execute([$userId, $cierreId]);
        
        echo json_encode(['success' => true]);
    }
}

if (isset($conn)) $conn = null;
?>
