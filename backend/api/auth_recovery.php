<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require '../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents("php://input"), true);

if ($action === 'forgot_password') {
    $email = $data['email'] ?? '';
    
    if (empty($email)) {
        http_response_code(400);
        echo json_encode(["message" => "Email requerido"]);
        exit;
    }

    $stmt = $conn->prepare("SELECT id, usuario FROM usuarios WHERE email = ? AND status = 'activo'");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        // Generate Token
        $token = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
        
        // Save Token
        $updateStmt = $conn->prepare("UPDATE usuarios SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?");
        $updateStmt->execute([$token, $expires, $user['id']]);

        $smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_email', 'smtp_from_name'];
        $stmtSettings = $conn->prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('" . implode("','", $smtpKeys) . "')");
        $stmtSettings->execute();
        $settings = $stmtSettings->fetchAll(PDO::FETCH_KEY_PAIR);
        
        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host       = $settings['smtp_host'] ?? '';
            $mail->SMTPAuth   = true;
            $mail->Username   = $settings['smtp_user'] ?? '';
            $mail->Password   = $settings['smtp_pass'] ?? '';
            $mail->SMTPSecure = $settings['smtp_secure'] ?? PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port       = isset($settings['smtp_port']) ? (int)$settings['smtp_port'] : 587;

            $fromEmail = $settings['smtp_from_email'] ?? 'noreply@erp.com';
            $fromName = $settings['smtp_from_name'] ?? 'ERP System';
            
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress($email);

            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $baseUrl = $protocol . '://' . $host;
            $resetLink = $baseUrl . "/reset-password?token=" . urlencode($token);

            $mail->isHTML(true);
            $mail->Subject = 'Recuperación de Contraseña - ERP';
            $mail->Body    = "
                <h2>Recuperación de Contraseña</h2>
                <p>Hola {$user['usuario']},</p>
                <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
                <p><a href='{$resetLink}'>Restablecer Contraseña</a></p>
                <p>Este enlace expirará en 1 hora.</p>
                <p>Si no solicitaste esto, ignora este correo.</p>
            ";

            $mail->send();
            echo json_encode(["message" => "Si el correo existe, recibirás instrucciones para restablecer tu contraseña."]);
        } catch (Exception $e) {
            // Log error but don't reveal too much to user? Or maybe yes for debugging now.
            // Better to return success even if email fails to avoid user enumeration, 
            // but for internal ERP usually fine to show error.
            http_response_code(500);
            echo json_encode(["message" => "Error al enviar correo. Contacte al administrador."]);
        }
    } else {
        // User not found or inactive
        // Return same message to prevent enumeration
        echo json_encode(["message" => "Si el correo existe, recibirás instrucciones para restablecer tu contraseña."]);
    }

} elseif ($action === 'reset_password') {
    $token = $data['token'] ?? '';
    $newPassword = $data['password'] ?? '';
    
    if (empty($token) || empty($newPassword)) {
        http_response_code(400);
        echo json_encode(["message" => "Datos incompletos"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    $stmt = $conn->prepare("SELECT id FROM usuarios WHERE reset_token_hash = ? AND reset_token_expires_at > NOW()");
    $stmt->execute([$token]);
    $userId = $stmt->fetchColumn();

    if ($userId) {
        $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
        
        $updateStmt = $conn->prepare("UPDATE usuarios SET password = ?, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?");
        $updateStmt->execute([$hashedPassword, $userId]);
        
        echo json_encode(["message" => "Contraseña actualizada correctamente"]);
    } else {
        http_response_code(400);
        echo json_encode(["message" => "Token inválido o expirado"]);
    }

} else {
    http_response_code(400);
    echo json_encode(["message" => "Acción inválida"]);
}
if (isset($conn)) $conn = null;
?>
