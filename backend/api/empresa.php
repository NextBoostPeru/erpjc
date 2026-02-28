<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

// Disable error display in output to avoid breaking JSON
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (!isset($conn)) {
    http_response_code(500);
    echo json_encode(["message" => "Error de conexión a base de datos"]);
    exit;
}
$db = $conn;

// Enable error logging for debugging
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/php_error.log');

$method = $_SERVER['REQUEST_METHOD'];
$jwt = new JWTHandler();

// Validar Token (acepta Authorization o token por query string)
$token = $jwt->getBearerToken();
if (!$token && isset($_GET['token'])) {
    $token = $_GET['token'];
}
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

switch ($method) {
    case 'GET':
        try {
            $query = "SELECT * FROM empresa_datos LIMIT 1";
            $stmt = $db->prepare($query);
            $stmt->execute();
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($result) {
                // Decodificar JSON de config sunat si existe y es string
                if (isset($result['configuracion_sunat']) && is_string($result['configuracion_sunat'])) {
                    $decoded = json_decode($result['configuracion_sunat']);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $result['configuracion_sunat'] = $decoded;
                    } else {
                        // Fallback si no es JSON válido
                         $result['configuracion_sunat'] = null;
                    }
                }
                echo json_encode($result);
            } else {
                echo json_encode((object)[]); // Objeto vacío si no hay datos
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'POST':
        // Determine if content type is JSON or FormData
        $contentType = $_SERVER["CONTENT_TYPE"] ?? '';
        $isMultipart = strpos($contentType, 'multipart/form-data') !== false;

        if ($isMultipart) {
            $data = (object) $_POST;
            // Handle JSON string for sunat config coming from FormData
            if (isset($data->configuracion_sunat) && is_string($data->configuracion_sunat)) {
                // security.php applies htmlspecialchars, so we need to decode it back to valid JSON
                $jsonString = html_entity_decode($data->configuracion_sunat, ENT_QUOTES, 'UTF-8');
                $data->configuracion_sunat = json_decode($jsonString);
            }
        } else {
            $data = json_decode(file_get_contents("php://input"));
        }
        
        try {
            // Verificar si ya existe un registro
            $checkQuery = "SELECT id, logo FROM empresa_datos LIMIT 1";
            $checkStmt = $db->prepare($checkQuery);
            $checkStmt->execute();
            $exists = $checkStmt->fetch(PDO::FETCH_ASSOC);

            $logoPath = $exists['logo'] ?? null;

            // Handle File Upload
            if ($isMultipart && isset($_FILES['logo']) && $_FILES['logo']['error'] === UPLOAD_ERR_OK) {
                $uploadDir = __DIR__ . '/uploads/empresa/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0777, true);
                }
                
                $fileExt = strtolower(pathinfo($_FILES['logo']['name'], PATHINFO_EXTENSION));
                $allowed = ['jpg', 'jpeg', 'png', 'gif'];
                
                if (in_array($fileExt, $allowed)) {
                    $fileName = 'logo_' . time() . '.' . $fileExt;
                    $targetPath = $uploadDir . $fileName;
                    
                    if (move_uploaded_file($_FILES['logo']['tmp_name'], $targetPath)) {
                        // Delete old logo if exists
                        if ($logoPath && file_exists(__DIR__ . '/' . $logoPath)) {
                            unlink(__DIR__ . '/' . $logoPath);
                        }
                        $logoPath = 'uploads/empresa/' . $fileName;
                    }
                }
            }

            if ($exists) {
                // UPDATE
                $query = "UPDATE empresa_datos SET 
                          ruc = :ruc, 
                          razon_social = :razon_social, 
                          nombre_comercial = :nombre_comercial, 
                          domicilio_fiscal = :domicilio_fiscal,
                          moneda_principal = :moneda,
                          anio_fiscal = :anio,
                          configuracion_sunat = :sunat,
                          logo = :logo
                          WHERE id = :id";
                $stmt = $db->prepare($query);
                $stmt->bindParam(":id", $exists['id']);
            } else {
                // INSERT
                $query = "INSERT INTO empresa_datos (ruc, razon_social, nombre_comercial, domicilio_fiscal, moneda_principal, anio_fiscal, configuracion_sunat, logo) 
                          VALUES (:ruc, :razon_social, :nombre_comercial, :domicilio_fiscal, :moneda, :anio, :sunat, :logo)";
                $stmt = $db->prepare($query);
            }

            $ruc = $data->ruc ?? '';
            $razon_social = $data->razon_social ?? '';
            $nombre_comercial = $data->nombre_comercial ?? '';
            $domicilio_fiscal = $data->domicilio_fiscal ?? '';
            $moneda = $data->moneda_principal ?? 'PEN';
            $anio = $data->anio_fiscal ?? date('Y');
            
            // Handle JSON for sunat config
            $sunatConfig = isset($data->configuracion_sunat) ? json_encode($data->configuracion_sunat) : null;

            $stmt->bindParam(":ruc", $ruc);
            $stmt->bindParam(":razon_social", $razon_social);
            $stmt->bindParam(":nombre_comercial", $nombre_comercial);
            $stmt->bindParam(":domicilio_fiscal", $domicilio_fiscal);
            $stmt->bindParam(":moneda", $moneda);
            $stmt->bindParam(":anio", $anio);
            $stmt->bindParam(":sunat", $sunatConfig);
            $stmt->bindParam(":logo", $logoPath);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Datos de empresa guardados correctamente", "logo" => $logoPath]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "No se pudo guardar los datos"]);
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
