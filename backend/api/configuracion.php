<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
rbac_require($conn, $userData, 'configuracion', $method);

$action = $_GET['action'] ?? '';

// Ensure system_settings table exists
try {
    $conn->exec("CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(50) NOT NULL UNIQUE,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
} catch (Exception $e) {}

switch ($action) {
    case 'get_smtp':
        try {
            $smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_email', 'smtp_from_name'];
            $settings = [];
            
            $placeholders = implode(',', array_fill(0, count($smtpKeys), '?'));
            $stmt = $conn->prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ($placeholders)");
            $stmt->execute($smtpKeys);
            $rows = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
            
            foreach ($smtpKeys as $key) {
                $settings[$key] = $rows[$key] ?? '';
            }
            
            echo json_encode($settings);
        } catch (Exception $e) {
            echo json_encode(['smtp_host' => '', 'smtp_port' => '587', 'smtp_user' => '', 'smtp_pass' => '', 'smtp_secure' => 'tls', 'smtp_from_email' => '', 'smtp_from_name' => '']);
        }
        break;

    case 'save_smtp':
        $data = json_decode(file_get_contents("php://input"), true);
        
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?");
            
            $smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_email', 'smtp_from_name'];
            
            foreach ($smtpKeys as $key) {
                if (isset($data[$key])) {
                    $stmt->execute([$key, $data[$key], $data[$key]]);
                }
            }
            
            $conn->commit();
            echo json_encode(["message" => "Configuración SMTP guardada correctamente"]);
        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error al guardar configuración: " . $e->getMessage()]);
        }
        break;
        
    case 'test_smtp':
        $data = json_decode(file_get_contents("php://input"), true);
        $testEmail = $data['test_email'] ?? '';
        
        if (empty($testEmail)) {
            http_response_code(400);
            echo json_encode(["message" => "Email de prueba requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        
        // Retrieve current settings from DB
        $smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_email', 'smtp_from_name'];
        $stmt = $conn->prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('" . implode("','", $smtpKeys) . "')");
        $stmt->execute();
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        require '../vendor/autoload.php';
        // Note: Using PHPMailer
        // Since I cannot import it directly here without namespaces properly setup if I was in a class, 
        // but this is a script.
        
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);

        try {
            //Server settings
            $mail->isSMTP();
            $mail->Host       = $settings['smtp_host'];
            $mail->SMTPAuth   = true;
            $mail->Username   = $settings['smtp_user'];
            $mail->Password   = $settings['smtp_pass'];
            $mail->SMTPSecure = $settings['smtp_secure']; // 'tls' or 'ssl'
            $mail->Port       = $settings['smtp_port'];

            //Recipients
            $fromEmail = $settings['smtp_from_email'] ?: 'noreply@erp.com';
            $fromName = $settings['smtp_from_name'] ?: 'ERP System';
            
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress($testEmail);

            //Content
            $mail->isHTML(true);
            $mail->Subject = 'Prueba de SMTP - ERP';
            $mail->Body    = 'Esta es una prueba de configuración de correo desde el ERP.';

            $mail->send();
            echo json_encode(["message" => "Correo de prueba enviado correctamente"]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error al enviar correo: {$mail->ErrorInfo}"]);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(["message" => "Acción inválida"]);
        break;
}
if (isset($conn)) $conn = null;
?>
