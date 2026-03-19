<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

header("Content-Type: application/json");

if (!isset($conn)) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Error de conexión a base de datos"]);
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
    echo json_encode(["success" => false, "message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$action = $_GET['action'] ?? '';

if ($method !== 'GET') {
    rbac_ensure_roles_modulos_schema($conn);
    [, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
    $required = rbac_required_perm_for_request($method);

    if (
        !rbac_can($conn, (int)$rolId, (string)$rolNombre, 'configuracion', $required)
        && !rbac_can($conn, (int)$rolId, (string)$rolNombre, 'centros_costo', $required)
    ) {
        http_response_code(403);
        echo json_encode([
            "message" => "No tienes permiso para esta acción",
            "forbidden" => true,
            "modulo" => "configuracion",
            "permiso" => $required
        ]);
        if (isset($conn)) $conn = null;
        exit;
    }
}

switch ($method) {
    case 'GET':
        if ($action === 'servicios') {
            // Listar servicios de un centro de costo
            $centroId = $_GET['centro_id'] ?? 0;
            try {
                $query = "SELECT * FROM centros_costo_servicios WHERE centro_costo_id = :cid AND estado = 'Activo' ORDER BY nombre ASC";
                $stmt = $db->prepare($query);
                $stmt->execute([':cid' => $centroId]);
                $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(["success" => true, "data" => $result]);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
            }
        } else {
            // Listar centros de costo
            try {
                // Return all active/inactive? Usually UI filters. 
                // Previous code: WHERE activo = 1.
                // New schema: has 'estado' column.
                $query = "SELECT * FROM centros_costo ORDER BY codigo ASC"; 
                $stmt = $db->prepare($query);
                $stmt->execute();
                $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(["success" => true, "data" => $result]);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
            }
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"));
        
        if ($action === 'servicio') {
            // Crear servicio
            if (!isset($data->centro_costo_id) || !isset($data->nombre)) {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "Datos incompletos"]);
                exit;
            }
            try {
                $query = "INSERT INTO centros_costo_servicios (centro_costo_id, nombre, descripcion, estado) VALUES (:cid, :nom, :desc, :est)";
                $stmt = $db->prepare($query);
                $stmt->execute([
                    ':cid' => $data->centro_costo_id,
                    ':nom' => $data->nombre,
                    ':desc' => $data->descripcion ?? '',
                    ':est' => $data->estado ?? 'Activo'
                ]);
                echo json_encode(["success" => true, "message" => "Servicio creado", "id" => $db->lastInsertId()]);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
            }
        } else {
            // Crear centro de costo
            if (!isset($data->codigo) || !isset($data->nombre)) {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "Datos incompletos"]);
                exit;
            }
            try {
                $query = "INSERT INTO centros_costo (codigo, nombre, tipo, area, presupuesto, responsable, estado, activo) VALUES (:codigo, :nombre, :tipo, :area, :presupuesto, :responsable, :estado, 1)";
                $stmt = $db->prepare($query);
                $stmt->execute([
                    ':codigo' => $data->codigo,
                    ':nombre' => $data->nombre,
                    ':tipo' => $data->tipo ?? 'Administrativo',
                    ':area' => $data->area ?? null,
                    ':presupuesto' => $data->presupuesto ?? 0,
                    ':responsable' => $data->responsable ?? '',
                    ':estado' => $data->estado ?? 'Activo'
                ]);
                echo json_encode(["success" => true, "message" => "Centro de costo creado", "id" => $db->lastInsertId()]);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
            }
        }
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"));
        
        if ($action === 'servicio') {
            // Editar servicio
            if (!isset($data->id)) {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "Falta ID"]);
                exit;
            }
            try {
                $query = "UPDATE centros_costo_servicios SET nombre = :nom, descripcion = :desc, estado = :est WHERE id = :id";
                $stmt = $db->prepare($query);
                $stmt->execute([
                    ':nom' => $data->nombre,
                    ':desc' => $data->descripcion ?? '',
                    ':est' => $data->estado ?? 'Activo',
                    ':id' => $data->id
                ]);
                echo json_encode(["success" => true, "message" => "Servicio actualizado"]);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
            }
        } else {
            // Editar centro de costo
            if (!isset($data->id)) {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "Falta ID"]);
                exit;
            }
            try {
                $activo = ($data->estado === 'Activo') ? 1 : 0;
                $query = "UPDATE centros_costo SET codigo = :codigo, nombre = :nombre, tipo = :tipo, area = :area, presupuesto = :pres, responsable = :resp, estado = :est, activo = :act WHERE id = :id";
                $stmt = $db->prepare($query);
                $stmt->execute([
                    ':codigo' => $data->codigo,
                    ':nombre' => $data->nombre,
                    ':tipo' => $data->tipo ?? 'Administrativo',
                    ':area' => $data->area ?? null,
                    ':pres' => $data->presupuesto ?? 0,
                    ':resp' => $data->responsable ?? '',
                    ':est' => $data->estado ?? 'Activo',
                    ':act' => $activo,
                    ':id' => $data->id
                ]);
                echo json_encode(["success" => true, "message" => "Actualizado correctamente"]);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
            }
        }
        break;

    case 'DELETE':
        $data = json_decode(file_get_contents("php://input"));
        $id = $data->id ?? $_GET['id'] ?? 0;
        
        if (!$id) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Falta ID"]);
            exit;
        }

        try {
            if ($action === 'servicio') {
                $query = "UPDATE centros_costo_servicios SET estado = 'Inactivo' WHERE id = :id";
                $stmt = $db->prepare($query);
                $stmt->execute([':id' => $id]);
                echo json_encode(["success" => true, "message" => "Servicio eliminado"]);
            } else {
                $query = "UPDATE centros_costo SET estado = 'Inactivo', activo = 0 WHERE id = :id";
                $stmt = $db->prepare($query);
                $stmt->execute([':id' => $id]);
                echo json_encode(["success" => true, "message" => "Eliminado correctamente"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
        }
        break;
}
if (isset($conn)) $conn = null;
?>
