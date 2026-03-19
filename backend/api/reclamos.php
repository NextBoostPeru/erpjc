<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
rbac_require($conn, $userData, 'reclamos', $method);

// Ensure table exists
try {
    $conn->exec("CREATE TABLE IF NOT EXISTS reclamos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo_origen ENUM('venta', 'compra', 'otro') DEFAULT 'venta',
        cliente_nombre VARCHAR(255) NULL,
        cliente_contacto VARCHAR(255) NULL,
        fecha_reclamo DATE NOT NULL,
        asunto VARCHAR(255) NOT NULL,
        descripcion TEXT NULL,
        prioridad ENUM('baja', 'media', 'alta', 'urgente') DEFAULT 'media',
        estado ENUM('registrado', 'en_revision', 'procedente', 'improcedente', 'cerrado') DEFAULT 'registrado',
        resolucion TEXT NULL,
        fecha_resolucion DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Exception $e) {
    // Continue
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'listar':
        try {
            $sql = "SELECT * FROM reclamos ORDER BY fecha_reclamo DESC, prioridad DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute();
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'crear':
        $data = json_decode(file_get_contents("php://input"), true);
        try {
            $sql = "INSERT INTO reclamos (tipo_origen, cliente_nombre, cliente_contacto, fecha_reclamo, asunto, descripcion, prioridad, estado)
                    VALUES (:tipo, :nombre, :contacto, :fecha, :asunto, :desc, :prio, 'registrado')";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':tipo' => $data['tipo_origen'] ?? 'venta',
                ':nombre' => $data['cliente_nombre'],
                ':contacto' => $data['cliente_contacto'] ?? '',
                ':fecha' => date('Y-m-d'),
                ':asunto' => $data['asunto'],
                ':desc' => $data['descripcion'],
                ':prio' => $data['prioridad'] ?? 'media'
            ]);
            echo json_encode(["message" => "Reclamo registrado", "id" => $conn->lastInsertId()]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'actualizar':
        $data = json_decode(file_get_contents("php://input"), true);
        try {
            $sql = "UPDATE reclamos SET estado = :estado, resolucion = :resol, fecha_resolucion = :fecha WHERE id = :id";
            $params = [
                ':estado' => $data['estado'],
                ':resol' => $data['resolucion'] ?? '',
                ':id' => $data['id'],
                ':fecha' => ($data['estado'] == 'cerrado' || $data['estado'] == 'procedente') ? date('Y-m-d H:i:s') : null
            ];
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            echo json_encode(["message" => "Reclamo actualizado"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'editar':
        $data = json_decode(file_get_contents("php://input"), true);
        try {
            $sql = "UPDATE reclamos SET 
                asunto = :asunto, 
                descripcion = :desc, 
                prioridad = :prio 
                WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':asunto' => $data['asunto'],
                ':desc' => $data['descripcion'],
                ':prio' => $data['prioridad'] ?? 'media',
                ':id' => $data['id']
            ]);
            echo json_encode(["message" => "Reclamo editado"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'eliminar':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID requerido"]);
            $conn = null;
            exit;
        }
        try {
            $stmt = $conn->prepare("DELETE FROM reclamos WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["message" => "Reclamo eliminado"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;
}
$conn = null;
?>
