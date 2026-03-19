<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

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

$method = $_SERVER['REQUEST_METHOD'];
$jwt = new JWTHandler();

// Validar Token
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

rbac_require($conn, $userData, 'acreditaciones', $method);

switch ($method) {
    case 'GET':
        try {
            $onlyActive = isset($_GET['active']) && $_GET['active'] === 'true';
            
            $query = "SELECT * FROM acreditaciones";
            if ($onlyActive) {
                $query .= " WHERE estado = 'activo'";
            }
            $query .= " ORDER BY created_at DESC";
            
            $stmt = $db->prepare($query);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode($result);
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
            try {
                $titulo = $_POST['titulo'] ?? '';
                $estado = $_POST['estado'] ?? 'activo';

                if (empty($titulo)) {
                    http_response_code(400);
                    echo json_encode(["message" => "El título es obligatorio"]);
                    exit;
                }

                $imagenPath = '';

                // Handle File Upload
                if (isset($_FILES['imagen']) && $_FILES['imagen']['error'] === UPLOAD_ERR_OK) {
                    $uploadDir = __DIR__ . '/uploads/acreditaciones/';
                    if (!is_dir($uploadDir)) {
                        mkdir($uploadDir, 0777, true);
                    }
                    
                    $fileExt = strtolower(pathinfo($_FILES['imagen']['name'], PATHINFO_EXTENSION));
                    $allowed = ['jpg', 'jpeg', 'png', 'gif'];
                    
                    if (in_array($fileExt, $allowed)) {
                        $fileName = 'acred_' . time() . '_' . rand(1000, 9999) . '.' . $fileExt;
                        $targetPath = $uploadDir . $fileName;
                        
                        if (move_uploaded_file($_FILES['imagen']['tmp_name'], $targetPath)) {
                            $imagenPath = 'uploads/acreditaciones/' . $fileName;
                        } else {
                            throw new Exception("Error al mover el archivo subido");
                        }
                    } else {
                        http_response_code(400);
                        echo json_encode(["message" => "Formato de archivo no permitido. Use JPG, PNG o GIF."]);
                        exit;
                    }
                } else {
                    http_response_code(400);
                    echo json_encode(["message" => "La imagen es obligatoria"]);
                    exit;
                }

                $query = "INSERT INTO acreditaciones (titulo, imagen_path, estado) VALUES (:titulo, :imagen_path, :estado)";
                $stmt = $db->prepare($query);
                $stmt->bindParam(':titulo', $titulo);
                $stmt->bindParam(':imagen_path', $imagenPath);
                $stmt->bindParam(':estado', $estado);
                
                if ($stmt->execute()) {
                    echo json_encode(["message" => "Acreditación creada exitosamente", "id" => $db->lastInsertId()]);
                } else {
                    throw new Exception("Error al insertar en la base de datos");
                }

            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(["message" => "Error: " . $e->getMessage()]);
            }
        } else {
            // Handle JSON for updates (e.g. status toggle) if implemented via POST
             http_response_code(400);
             echo json_encode(["message" => "Solicitud inválida"]);
        }
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"));
        
        if (isset($data->id) && isset($data->estado)) {
            try {
                $query = "UPDATE acreditaciones SET estado = :estado WHERE id = :id";
                $stmt = $db->prepare($query);
                $stmt->bindParam(':estado', $data->estado);
                $stmt->bindParam(':id', $data->id);
                
                if ($stmt->execute()) {
                    echo json_encode(["message" => "Estado actualizado exitosamente"]);
                } else {
                    http_response_code(500);
                    echo json_encode(["message" => "Error al actualizar estado"]);
                }
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["message" => "Error: " . $e->getMessage()]);
            }
        } else {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
        }
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        
        if ($id) {
            try {
                // Get image path first to delete file
                $query = "SELECT imagen_path FROM acreditaciones WHERE id = :id";
                $stmt = $db->prepare($query);
                $stmt->bindParam(':id', $id);
                $stmt->execute();
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($row) {
                    // Delete record
                    $deleteQuery = "DELETE FROM acreditaciones WHERE id = :id";
                    $deleteStmt = $db->prepare($deleteQuery);
                    $deleteStmt->bindParam(':id', $id);
                    
                    if ($deleteStmt->execute()) {
                        // Delete file if exists
                        if (!empty($row['imagen_path'])) {
                            $filePath = __DIR__ . '/' . $row['imagen_path'];
                            if (file_exists($filePath)) {
                                unlink($filePath);
                            }
                        }
                        echo json_encode(["message" => "Acreditación eliminada exitosamente"]);
                    } else {
                        http_response_code(500);
                        echo json_encode(["message" => "Error al eliminar registro"]);
                    }
                } else {
                    http_response_code(404);
                    echo json_encode(["message" => "Acreditación no encontrada"]);
                }
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["message" => "Error: " . $e->getMessage()]);
            }
        } else {
            http_response_code(400);
            echo json_encode(["message" => "ID es obligatorio"]);
        }
        break;
}

if (isset($conn)) {
    $conn = null;
}
?>
