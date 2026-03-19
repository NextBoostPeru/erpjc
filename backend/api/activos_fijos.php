<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', 'debug_errors.log');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    if (!$token) throw new Exception("No token provided");

    $userData = $jwtHandler->validateToken($token);
    if (!$userData) throw new Exception("Token inválido");
} catch (Exception $e) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso denegado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    rbac_require($conn, $userData, 'activos_fijos', $method);

    switch ($method) {
        case 'GET':
            $page = isset($_GET['page']) ? (int)$_GET['page'] : null;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
            
            if ($page) {
                $offset = ($page - 1) * $limit;
                
                // Get total count
                $countStmt = $conn->prepare("SELECT COUNT(*) as total FROM activos_fijos");
                $countStmt->execute();
                $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];
                
                // Get paginated data
                $stmt = $conn->prepare("SELECT id, codigo, nombre, fecha_adquisicion, valor_compra, vida_util_meses, valor_residual, estado, created_at FROM activos_fijos ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
                $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                echo json_encode([
                    'success' => true, 
                    'data' => $data,
                    'meta' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'total_pages' => ceil($total / $limit)
                    ]
                ]);
            } else {
                // Fallback for non-paginated requests (but limit to 500 to prevent saturation)
                $stmt = $conn->prepare("SELECT id, codigo, nombre, fecha_adquisicion, valor_compra, vida_util_meses, valor_residual, estado, created_at FROM activos_fijos ORDER BY created_at DESC LIMIT 500");
                $stmt->execute();
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['success' => true, 'data' => $data]);
            }
            break;

        case 'POST':
            $input = json_decode(file_get_contents("php://input"), true);
            
            // Validaciones básicas
            if (empty($input['nombre']) || empty($input['valor_compra'])) {
                throw new Exception("Nombre y Valor de Compra son requeridos");
            }

            $sql = "INSERT INTO activos_fijos (codigo, nombre, fecha_adquisicion, valor_compra, vida_util_meses, valor_residual, estado) 
                    VALUES (:codigo, :nombre, :fecha, :valor, :vida, :residual, :estado)";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':codigo' => $input['codigo'] ?? uniqid('ACT-'),
                ':nombre' => $input['nombre'],
                ':fecha' => $input['fecha_adquisicion'],
                ':valor' => $input['valor_compra'],
                ':vida' => $input['vida_util_meses'] ?? 60, // 5 años default
                ':residual' => $input['valor_residual'] ?? 0,
                ':estado' => $input['estado'] ?? 'activo'
            ]);
            
            echo json_encode(['success' => true, 'message' => 'Activo registrado', 'id' => $conn->lastInsertId()]);
            break;

        case 'PUT':
             // Update logic (simplified)
             $input = json_decode(file_get_contents("php://input"), true);
             if (empty($input['id'])) throw new Exception("ID requerido para actualizar");
             
             $sql = "UPDATE activos_fijos SET nombre = :nombre, valor_compra = :valor, estado = :estado WHERE id = :id";
             $stmt = $conn->prepare($sql);
             $stmt->execute([
                 ':nombre' => $input['nombre'],
                 ':valor' => $input['valor_compra'],
                 ':estado' => $input['estado'],
                 ':id' => $input['id']
             ]);
             echo json_encode(['success' => true, 'message' => 'Activo actualizado']);
             break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) throw new Exception("ID no proporcionado");
            
            $stmt = $conn->prepare("DELETE FROM activos_fijos WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true, 'message' => 'Activo eliminado']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
if (isset($conn)) $conn = null;
