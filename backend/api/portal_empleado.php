<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
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
    $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

$userId = $userData->id;
$action = $_GET['action'] ?? 'profile';

try {
    // 1. Find Linked Collaborator
    $stmt = $conn->prepare("SELECT * FROM colaboradores WHERE usuario_id = :uid OR email = (SELECT email FROM usuarios WHERE id = :uid2) LIMIT 1");
    $stmt->execute([':uid' => $userId, ':uid2' => $userId]);
    $colaborador = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$colaborador) {
        // Fallback: If not linked, return basic user info but empty data
        if ($action === 'profile') {
             $stmtUser = $conn->prepare("SELECT id, usuario, email FROM usuarios WHERE id = ?");
             $stmtUser->execute([$userId]);
             $user = $stmtUser->fetch(PDO::FETCH_ASSOC);
             echo json_encode(['linked' => false, 'user' => $user, 'message' => 'No hay perfil de colaborador asociado a este usuario.']);
             exit;
        } else {
             echo json_encode(['data' => []]);
             exit;
        }
    }

    $colaboradorId = $colaborador['id'];

    // Update link if missing (self-healing)
    if (empty($colaborador['usuario_id'])) {
        $updateStmt = $conn->prepare("UPDATE colaboradores SET usuario_id = :uid WHERE id = :cid");
        $updateStmt->execute([':uid' => $userId, ':cid' => $colaboradorId]);
    }

    switch ($action) {
        case 'profile':
            echo json_encode(['linked' => true, 'data' => $colaborador]);
            break;

        case 'boletas':
            // Fetch Boletas (Planilla Detalles) for this collaborator
            $sql = "SELECT d.id, p.mes, p.anio, d.total_bruto, d.total_descuentos, d.neto_pagar, p.estado
                    FROM planilla_detalles d
                    JOIN planillas p ON d.planilla_id = p.id
                    WHERE d.colaborador_id = :cid AND p.estado = 'cerrada'
                    ORDER BY p.anio DESC, p.mes DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':cid' => $colaboradorId]);
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;

        case 'vacaciones':
            // Fetch Vacation Requests
            $sql = "SELECT * FROM solicitudes_permisos 
                    WHERE colaborador_id = :cid AND tipo = 'Vacaciones'
                    ORDER BY created_at DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':cid' => $colaboradorId]);
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;
            
        case 'solicitar_vacaciones':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception("Método no permitido");
            }
            $input = json_decode(file_get_contents("php://input"), true);
            
            // Basic validation
            if (empty($input['fecha_inicio']) || empty($input['fecha_fin'])) {
                throw new Exception("Fechas requeridas");
            }

            $start = new DateTime($input['fecha_inicio']);
            $end = new DateTime($input['fecha_fin']);
            $diff = $start->diff($end);
            $dias = $diff->days + 1;
            if ($dias <= 0) {
                throw new Exception("Fechas inválidas");
            }
            
            // Insert Request
            $sql = "INSERT INTO solicitudes_permisos (colaborador_id, tipo, fecha_inicio, fecha_fin, dias, motivo, estado) 
                    VALUES (:cid, 'Vacaciones', :inicio, :fin, :dias, :motivo, 'Pendiente')";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':cid' => $colaboradorId,
                ':inicio' => $input['fecha_inicio'],
                ':fin' => $input['fecha_fin'],
                ':dias' => $dias,
                ':motivo' => $input['motivo'] ?? 'Solicitud desde Portal'
            ]);
            
            echo json_encode(['success' => true, 'message' => 'Solicitud enviada correctamente']);
            break;

        default:
            echo json_encode(['message' => 'Acción no válida']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}

$conn = null;
