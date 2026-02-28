<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

header("Content-Type: application/json");

// Check DB connection
if (!isset($conn)) {
    http_response_code(500);
    echo json_encode(["message" => "Error de conexión a base de datos"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$jwt = new JWTHandler();

// Validar Token
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
        $sede_id = isset($_GET['sede_id']) ? $_GET['sede_id'] : null;
        try {
            if ($sede_id) {
                $query = "SELECT s.*, se.nombre as sede_nombre 
                          FROM series_comprobantes s
                          JOIN sedes se ON s.sede_id = se.id
                          WHERE s.sede_id = :sede_id AND s.activo = 1
                          ORDER BY s.tipo_comprobante ASC";
                $stmt = $conn->prepare($query);
                $stmt->bindParam(":sede_id", $sede_id);
            } else {
                $query = "SELECT s.*, se.nombre as sede_nombre 
                          FROM series_comprobantes s
                          JOIN sedes se ON s.sede_id = se.id
                          WHERE s.activo = 1
                          ORDER BY se.nombre, s.tipo_comprobante ASC";
                $stmt = $conn->prepare($query);
            }
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($result);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error al obtener series: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"));
        
        if (!isset($data->sede_id) || !isset($data->tipo_comprobante) || !isset($data->serie)) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $query = "INSERT INTO series_comprobantes (sede_id, tipo_comprobante, serie, correlativo_actual) 
                      VALUES (:sede_id, :tipo_comprobante, :serie, :correlativo)";
            $stmt = $conn->prepare($query);
            
            $sede_id = $data->sede_id;
            $tipo = $data->tipo_comprobante;
            $serie = $data->serie;
            $correlativo = isset($data->correlativo_actual) ? $data->correlativo_actual : 0;

            $stmt->bindParam(":sede_id", $sede_id);
            $stmt->bindParam(":tipo_comprobante", $tipo);
            $stmt->bindParam(":serie", $serie);
            $stmt->bindParam(":correlativo", $correlativo);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Serie creada correctamente", "id" => $conn->lastInsertId()]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "No se pudo crear la serie"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"));
        
        if (!isset($data->id)) {
            http_response_code(400);
            echo json_encode(["message" => "Falta ID"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $query = "UPDATE series_comprobantes SET 
                      serie = :serie, 
                      correlativo_actual = :correlativo 
                      WHERE id = :id";
            $stmt = $conn->prepare($query);

            $id = $data->id;
            $serie = $data->serie ?? null;
            $correlativo = $data->correlativo_actual ?? null;

            if ($serie === null || $correlativo === null) {
                 http_response_code(400);
                 echo json_encode(["message" => "Faltan datos para actualizar"]);
                 if (isset($conn)) $conn = null;
                 exit;
            }

            $stmt->bindParam(":id", $id);
            $stmt->bindParam(":serie", $serie);
            $stmt->bindParam(":correlativo", $correlativo);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Serie actualizada correctamente"]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "No se pudo actualizar la serie"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'DELETE':
        $data = json_decode(file_get_contents("php://input"));
        
        if (!isset($data->id)) {
            http_response_code(400);
            echo json_encode(["message" => "Falta ID"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $query = "UPDATE series_comprobantes SET activo = 0 WHERE id = :id";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(":id", $data->id);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Serie eliminada correctamente"]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "No se pudo eliminar la serie"]);
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