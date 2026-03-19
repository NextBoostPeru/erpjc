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
require_once '../config/rbac.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    $userData = $jwtHandler->validateToken($token);
    if (!$userData) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    rbac_require($conn, $userData, 'emos', $method);
    
    switch ($method) {
        case 'GET':
            $colabId = $_GET['colaborador_id'] ?? null;
            if (!$colabId) {
                throw new Exception("ID de colaborador requerido");
            }
            
            $stmt = $conn->prepare("SELECT * FROM emos WHERE colaborador_id = ? ORDER BY fecha_vencimiento DESC");
            $stmt->execute([$colabId]);
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($data);
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"));
            
            if (empty($data->colaborador_id) || empty($data->fecha_examen) || empty($data->fecha_vencimiento)) {
                throw new Exception("Datos incompletos");
            }

            $sql = "INSERT INTO emos (colaborador_id, fecha_examen, fecha_vencimiento, clinica, observaciones) 
                    VALUES (:cid, :fexamen, :fvenc, :clinica, :obs)";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':cid' => $data->colaborador_id,
                ':fexamen' => $data->fecha_examen,
                ':fvenc' => $data->fecha_vencimiento,
                ':clinica' => $data->clinica ?? '',
                ':obs' => $data->observaciones ?? ''
            ]);
            
            echo json_encode(["message" => "EMO registrado", "id" => $conn->lastInsertId()]);
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                throw new Exception("ID requerido");
            }

            $stmt = $conn->prepare("DELETE FROM emos WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(["message" => "EMO eliminado"]);
            break;
    }

} catch (Exception $e) {
    if (http_response_code() === 200) {
        http_response_code(500);
    }
    echo json_encode(["error" => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
