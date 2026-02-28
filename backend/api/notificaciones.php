<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
header("Content-Type: application/json; charset=UTF-8");

require_once '../config/jwt.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;

// Validate Token
try {
    $authHeader = null;
    if (isset($_SERVER['Authorization'])) {
        $authHeader = trim($_SERVER["Authorization"]);
    } else if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = trim($_SERVER["HTTP_AUTHORIZATION"]);
    } elseif (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (isset($headers['Authorization'])) {
            $authHeader = trim($headers['Authorization']);
        }
    }
    
    if (!$authHeader || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        throw new Exception("Token no encontrado");
    }
    
    $jwt = $matches[1];
    $jwtHandler = new JWTHandler();
    $userData = $jwtHandler->validateToken($jwt);
    
    if (!$userData) {
        throw new Exception("Token inválido o expirado");
    }
    
    $userId = $userData->id;
    $roleId = $userData->rol_id;
    
} catch (Exception $e) {
    http_response_code(401);
    $conn = null;
    echo json_encode(["message" => "Acceso denegado", "error" => $e->getMessage()]);
    exit;
}

try {
    if ($method === 'GET') {
        // 1. Run Auto-Check for System Notifications (Lazy Load)
        checkSystemNotifications($conn, $userId, $roleId);

        // 2. Fetch Notifications
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $unreadOnly = isset($_GET['unread']) && $_GET['unread'] === 'true';

        $sql = "SELECT * FROM notificaciones 
                WHERE (usuario_id = :uid OR (rol_id = :rid AND usuario_id IS NULL)) ";
        
        if ($unreadOnly) {
            $sql .= " AND leido = 0";
        }

        $sql .= " ORDER BY created_at DESC LIMIT :limit";

        $stmt = $conn->prepare($sql);
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':rid', $roleId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Count unread
        $countSql = "SELECT COUNT(*) FROM notificaciones 
                     WHERE (usuario_id = :uid OR (rol_id = :rid AND usuario_id IS NULL)) AND leido = 0";
        $countStmt = $conn->prepare($countSql);
        $countStmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $countStmt->bindValue(':rid', $roleId, PDO::PARAM_INT);
        $countStmt->execute();
        $unreadCount = $countStmt->fetchColumn();

        echo json_encode([
            "success" => true,
            "data" => $notifications,
            "unread_count" => $unreadCount
        ]);

    } elseif ($method === 'PUT') {
        // Mark as read
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? null;
        $markAll = $data['mark_all'] ?? false;

        if ($markAll) {
            $sql = "UPDATE notificaciones SET leido = 1 WHERE usuario_id = :uid OR (rol_id = :rid AND usuario_id IS NULL)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':uid' => $userId, ':rid' => $roleId]);
            echo json_encode(["success" => true, "message" => "Todas las notificaciones marcadas como leídas"]);
        } elseif ($id) {
            // Check ownership
            $check = $conn->prepare("SELECT id FROM notificaciones WHERE id = :id AND (usuario_id = :uid OR rol_id = :rid)");
            $check->execute([':id' => $id, ':uid' => $userId, ':rid' => $roleId]);
            
            if ($check->rowCount() > 0) {
                $update = $conn->prepare("UPDATE notificaciones SET leido = 1 WHERE id = :id");
                $update->execute([':id' => $id]);
                echo json_encode(["success" => true, "message" => "Notificación marcada como leída"]);
            } else {
                http_response_code(403);
                echo json_encode(["message" => "No tienes permiso para modificar esta notificación"]);
            }
        } else {
            throw new Exception("ID requerido");
        }
    }

    $conn = null;
} catch (Exception $e) {
    if (isset($conn)) $conn = null;
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}

// Helper Function to Generate Notifications
function checkSystemNotifications($conn, $userId, $roleId) {
    // Only check for RRHH role (assuming we can identify it, or just check for everyone and let logic decide)
    // Get Role Name
    $stmt = $conn->prepare("SELECT nombre FROM roles WHERE id = ?");
    $stmt->execute([$roleId]);
    $roleName = $stmt->fetchColumn();

    if ($roleName === 'rrhh' || $roleName === 'admin') {
        // 1. Contract Expirations (Next 30 days)
        $sql = "SELECT c.id, col.nombres, col.apellidos, c.fecha_fin 
                FROM contratos c 
                JOIN colaboradores col ON c.colaborador_id = col.id
                WHERE c.estado = 'Vigente' 
                AND c.fecha_fin BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)";
        
        $contracts = $conn->query($sql)->fetchAll(PDO::FETCH_ASSOC);

        foreach ($contracts as $contract) {
            $title = "Contrato por Vencer";
            $msg = "El contrato de {$contract['nombres']} {$contract['apellidos']} vence el {$contract['fecha_fin']}.";
            $link = "/gestion-contratos?search={$contract['nombres']}"; 

            $check = $conn->prepare("SELECT id FROM notificaciones WHERE usuario_id = :uid AND mensaje = :msg AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)");
            $check->execute([':uid' => $userId, ':msg' => $msg]);

            if ($check->rowCount() === 0) {
                $ins = $conn->prepare("INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, enlace, created_at) VALUES (:uid, :title, :msg, 'warning', :link, NOW())");
                $ins->execute([':uid' => $userId, ':title' => $title, ':msg' => $msg, ':link' => $link]);
            }
        }

        // 2. Pending Vacation/Leave Requests
        $sqlPermisos = "SELECT s.id, c.nombres, c.apellidos, s.tipo, s.fecha_inicio, s.dias 
                        FROM solicitudes_permisos s
                        JOIN colaboradores c ON s.colaborador_id = c.id
                        WHERE s.estado = 'Pendiente'";
        
        $requests = $conn->query($sqlPermisos)->fetchAll(PDO::FETCH_ASSOC);

        foreach ($requests as $req) {
            $title = "Nueva Solicitud: {$req['tipo']}";
            $msg = "{$req['nombres']} {$req['apellidos']} solicita {$req['dias']} días desde {$req['fecha_inicio']}.";
            $link = "/vacaciones-permisos"; 

            $check = $conn->prepare("SELECT id FROM notificaciones WHERE usuario_id = :uid AND enlace = :link AND mensaje = :msg AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)");
            $check->execute([':uid' => $userId, ':link' => $link, ':msg' => $msg]);

            if ($check->rowCount() === 0) {
                $ins = $conn->prepare("INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, enlace, created_at) VALUES (:uid, :title, :msg, 'info', :link, NOW())");
                $ins->execute([':uid' => $userId, ':title' => $title, ':msg' => $msg, ':link' => $link]);
            }
        }

        // 3. Birthdays (Today and Next 7 Days) - Logic optimized for year wrap
        $sqlCumple = "SELECT id, nombres, apellidos, fecha_nacimiento 
                      FROM colaboradores 
                      WHERE fecha_nacimiento IS NOT NULL";
        
        $allColabs = $conn->query($sqlCumple)->fetchAll(PDO::FETCH_ASSOC);

        foreach ($allColabs as $colab) {
            $bday = $colab['fecha_nacimiento']; // YYYY-MM-DD
            $today = new DateTime();
            $bdayDate = new DateTime($bday);
            $bdayThisYear = new DateTime(date('Y') . '-' . $bdayDate->format('m-d'));
            
            // If birthday passed this year, check next year (for lookahead)
            if ($bdayThisYear < new DateTime(date('Y-m-d') . ' 00:00:00')) {
                $bdayThisYear->modify('+1 year');
            }

            $diff = $today->diff($bdayThisYear)->days;
            // $today->diff gives absolute difference, so we need to be careful. 
            // Better: Check if $bdayThisYear is between today and today+7
            
            $nextWeek = new DateTime();
            $nextWeek->modify('+7 days');

            if ($bdayThisYear >= new DateTime(date('Y-m-d') . ' 00:00:00') && $bdayThisYear <= $nextWeek) {
                 if ($bdayThisYear->format('Y-m-d') === $today->format('Y-m-d')) {
                    $title = "¡Cumpleaños Hoy!";
                    $msg = "Hoy es el cumpleaños de {$colab['nombres']} {$colab['apellidos']}.";
                    $type = 'success';
                } else {
                    $title = "Cumpleaños Próximo";
                    $msg = "El cumpleaños de {$colab['nombres']} {$colab['apellidos']} es el " . $bdayDate->format('d/m') . ".";
                    $type = 'info';
                }
                
                $link = "/gestion-colaboradores";

                $check = $conn->prepare("SELECT id FROM notificaciones WHERE usuario_id = :uid AND mensaje = :msg AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)");
                $check->execute([':uid' => $userId, ':msg' => $msg]);

                if ($check->rowCount() === 0) {
                    $ins = $conn->prepare("INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, enlace, created_at) VALUES (:uid, :title, :msg, :type, :link, NOW())");
                    $ins->execute([':uid' => $userId, ':title' => $title, ':msg' => $msg, ':type' => $type, ':link' => $link]);
                }
            }
        }

        // 4. EMO Expirations (Next 30 days)
        $sqlEmos = "SELECT e.id, c.nombres, c.apellidos, e.fecha_vencimiento 
                    FROM emos e
                    JOIN colaboradores c ON e.colaborador_id = c.id
                    WHERE e.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)";
        
        $emos = $conn->query($sqlEmos)->fetchAll(PDO::FETCH_ASSOC);

        foreach ($emos as $emo) {
            $title = "Vencimiento de EMO";
            $msg = "El Examen Médico de {$emo['nombres']} {$emo['apellidos']} vence el {$emo['fecha_vencimiento']}.";
            $link = "/gestion-colaboradores"; 

            $check = $conn->prepare("SELECT id FROM notificaciones WHERE usuario_id = :uid AND mensaje = :msg AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)");
            $check->execute([':uid' => $userId, ':msg' => $msg]);

            if ($check->rowCount() === 0) {
                $ins = $conn->prepare("INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, enlace, created_at) VALUES (:uid, :title, :msg, 'warning', :link, NOW())");
                $ins->execute([':uid' => $userId, ':title' => $title, ':msg' => $msg, ':link' => $link]);
            }
        }
    }
}
?>
