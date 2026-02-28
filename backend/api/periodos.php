<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

header("Content-Type: application/json");

if (!isset($conn)) {
    http_response_code(500);
    echo json_encode(["message" => "Error de conexión a base de datos"]);
    exit;
}
$db = $conn;

$method = $_SERVER['REQUEST_METHOD'];
$jwt = new JWTHandler();

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
        $anio = $_GET['anio'] ?? date('Y');
        try {
            $query = "SELECT * FROM periodos_contables WHERE anio = :anio ORDER BY mes ASC";
            $stmt = $db->prepare($query);
            $stmt->bindParam(":anio", $anio);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($result);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'POST':
        // Generate periods for a year
        $data = json_decode(file_get_contents("php://input"));
        $anio = $data->anio ?? date('Y');

        try {
            // Check if periods exist
            $check = "SELECT COUNT(*) as total FROM periodos_contables WHERE anio = :anio";
            $stmt = $db->prepare($check);
            $stmt->bindParam(":anio", $anio);
            $stmt->execute();
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($row['total'] > 0) {
                http_response_code(400);
                echo json_encode(["message" => "Los periodos para el año $anio ya existen"]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $months = [
                1 => 'Enero', 2 => 'Febrero', 3 => 'Marzo', 4 => 'Abril', 
                5 => 'Mayo', 6 => 'Junio', 7 => 'Julio', 8 => 'Agosto', 
                9 => 'Septiembre', 10 => 'Octubre', 11 => 'Noviembre', 12 => 'Diciembre'
            ];

            $db->beginTransaction();
            
            // Insert Opening Period (optional, but standard usually month 0)
            // For now sticking to 1-12 as per simple requirement, or maybe user wants Opening (0) and Closing (13).
            // Let's stick to 1-12 for simplicity unless requested otherwise.

            $query = "INSERT INTO periodos_contables (anio, mes, nombre, estado) VALUES (:anio, :mes, :nombre, 'abierto')";
            $stmt = $db->prepare($query);

            foreach ($months as $num => $name) {
                $stmt->bindValue(":anio", $anio);
                $stmt->bindValue(":mes", $num);
                $stmt->bindValue(":nombre", $name);
                $stmt->execute();
            }

            $db->commit();
            echo json_encode(["message" => "Periodos generados exitosamente"]);

        } catch (PDOException $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    case 'PUT':
        // Toggle status
        $data = json_decode(file_get_contents("php://input"));
        
        if (!isset($data->id) || !isset($data->estado)) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $query = "UPDATE periodos_contables SET estado = :estado WHERE id = :id";
            $stmt = $db->prepare($query);
            $stmt->bindParam(":estado", $data->estado);
            $stmt->bindParam(":id", $data->id);
            
            if ($stmt->execute()) {
                echo json_encode(["message" => "Estado actualizado"]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "Error al actualizar"]);
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
