<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

header("Content-Type: application/json");

if (!isset($conn)) {
    http_response_code(500);
    echo json_encode(["message" => "Error de conexión a base de datos"]);
    exit;
}
$db = $conn;

$method = $_SERVER['REQUEST_METHOD'];
$jwt = new JWTHandler();

// Validar Token
$headers = getallheaders();
$authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';
$token = str_replace('Bearer ', '', $authHeader);
$userData = $jwt->validateToken($token);

if (!$userData) {
    if (isset($conn)) $conn = null;
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    exit;
}

$action = $_GET['action'] ?? '';
if ($method !== 'GET') {
    rbac_ensure_roles_modulos_schema($conn);
    [, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
    $required = ($method === 'POST' && $action === 'sync_sunat') ? 'editar' : rbac_required_perm_for_request($method);

    if (
        !rbac_can($conn, (int)$rolId, (string)$rolNombre, 'configuracion', $required)
        && !rbac_can($conn, (int)$rolId, (string)$rolNombre, 'sedes', $required)
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

// TODO: Validar permisos específicos del rol si es necesario (rol_id 2 es contador)

switch ($method) {
    case 'GET':
        try {
            $query = "SELECT * FROM sedes WHERE activo = 1 ORDER BY id ASC";
            $stmt = $db->prepare($query);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($result);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error al obtener sedes: " . $e->getMessage()]);
            if (isset($db)) $db = null;
            if (isset($conn)) $conn = null;
        }
        break;

    case 'POST':
        if ($action === 'sync_sunat') {
            require_once __DIR__ . '/services/SunatService.php';
            
            // 1. Get Empresa Config
            $stmtEmp = $db->query("SELECT ruc, configuracion_sunat FROM empresa LIMIT 1");
            $emp = $stmtEmp->fetch(PDO::FETCH_ASSOC);
            
            if (!$emp) {
                http_response_code(400);
                echo json_encode(['message' => 'No hay datos de empresa configurados']);
                if (isset($db)) $db = null;
                if (isset($conn)) $conn = null;
                exit;
            }
            
            $config = json_decode($emp['configuracion_sunat'], true);
            $token = $config['apiperu_token'] ?? '';
            $ruc = $emp['ruc'];
            
            if (!$token || !$ruc) {
                http_response_code(400);
                echo json_encode(['message' => 'Falta configurar Token ApiPeruDev o RUC']);
                exit;
            }
            
            // 2. Call SunatService
            $service = new SunatService($token);
            $res = $service->consultarRUC($ruc);
            
            if (!$res['success']) {
                http_response_code(500);
                echo json_encode(['message' => 'Error consultando SUNAT: ' . ($res['message'] ?? 'Desconocido')]);
                exit;
            }
            
            $anexos = $res['anexos'] ?? [];
            $count = 0;
            
            foreach ($anexos as $anexo) {
                $codigo = $anexo['cod_sunat'] ?? $anexo['codigo'] ?? ''; 
                $direccion = $anexo['direccion'] ?? $anexo['direccion_completa'] ?? '';
                $nombre = $anexo['tipo_establecimiento'] ?? 'SUCURSAL'; 
                
                if (!$codigo) continue;

                // Check if exists by codigo_sunat
                $stmtCheck = $db->prepare("SELECT id FROM sedes WHERE codigo_sunat = :codigo");
                $stmtCheck->execute([':codigo' => $codigo]);
                $sede_id = null;

                if ($stmtCheck->rowCount() > 0) {
                    // Update
                    $row = $stmtCheck->fetch(PDO::FETCH_ASSOC);
                    $sede_id = $row['id'];
                    $stmtUpd = $db->prepare("UPDATE sedes SET direccion = :direccion, nombre = :nombre, activo = 1 WHERE id = :id");
                    $stmtUpd->execute([':direccion' => $direccion, ':nombre' => $nombre, ':id' => $sede_id]);
                } else {
                    // Insert
                    $stmtIns = $db->prepare("INSERT INTO sedes (codigo_sunat, nombre, direccion, es_principal, activo) VALUES (:codigo, :nombre, :direccion, 0, 1)");
                    $stmtIns->execute([':codigo' => $codigo, ':nombre' => $nombre, ':direccion' => $direccion]);
                    $sede_id = $db->lastInsertId();
                    $count++;
                }

                // --- AUTO-GENERATE SERIES IF MISSING ---
                if ($sede_id) {
                    // Define defaults based on cod_sunat
                    // Ensure suffix is 3 digits
                    $suffix = str_pad(substr($codigo, -3), 3, '0', STR_PAD_LEFT);
                    
                    $serieF = ($codigo === '0000') ? 'FFF1' : 'F' . $suffix;
                    $serieB = ($codigo === '0000') ? 'BBB1' : 'B' . $suffix;

                    // Check/Create Factura (01)
                    $stmtS = $db->prepare("SELECT id FROM series_comprobantes WHERE sede_id = :sid AND tipo_comprobante = '01'");
                    $stmtS->execute([':sid' => $sede_id]);
                    if ($stmtS->rowCount() === 0) {
                        $db->prepare("INSERT INTO series_comprobantes (sede_id, tipo_comprobante, serie, correlativo_actual, activo) VALUES (:sid, '01', :ser, 0, 1)")
                           ->execute([':sid' => $sede_id, ':ser' => $serieF]);
                    }

                    // Check/Create Boleta (03)
                    $stmtS = $db->prepare("SELECT id FROM series_comprobantes WHERE sede_id = :sid AND tipo_comprobante = '03'");
                    $stmtS->execute([':sid' => $sede_id]);
                    if ($stmtS->rowCount() === 0) {
                        $db->prepare("INSERT INTO series_comprobantes (sede_id, tipo_comprobante, serie, correlativo_actual, activo) VALUES (:sid, '03', :ser, 0, 1)")
                           ->execute([':sid' => $sede_id, ':ser' => $serieB]);
                    }
                }
                // ---------------------------------------
            }
            
            echo json_encode(['success' => true, 'message' => "Sincronización completada. $count nuevas sedes agregadas y series verificadas."]);
            if (isset($db)) $db = null;
            if (isset($conn)) $conn = null;
            exit;
        }

        $data = json_decode(file_get_contents("php://input"));
        
        if (!isset($data->nombre)) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            $query = "INSERT INTO sedes (codigo_sunat, nombre, direccion, es_principal) VALUES (:codigo, :nombre, :direccion, :principal)";
            $stmt = $db->prepare($query);
            
            $codigo = $data->codigo_sunat ?? '';
            $nombre = $data->nombre;
            $direccion = $data->direccion ?? '';
            $principal = isset($data->es_principal) && $data->es_principal ? 1 : 0;

            $stmt->bindParam(":codigo", $codigo);
            $stmt->bindParam(":nombre", $nombre);
            $stmt->bindParam(":direccion", $direccion);
            $stmt->bindParam(":principal", $principal);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Sede creada correctamente", "id" => $db->lastInsertId()]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "No se pudo crear la sede"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"));
        
        if (!isset($data->id) || !isset($data->nombre)) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            exit;
        }

        try {
            $query = "UPDATE sedes SET codigo_sunat = :codigo, nombre = :nombre, direccion = :direccion, es_principal = :principal WHERE id = :id";
            $stmt = $db->prepare($query);

            $id = $data->id;
            $codigo = $data->codigo_sunat ?? '';
            $nombre = $data->nombre;
            $direccion = $data->direccion ?? '';
            $principal = isset($data->es_principal) && $data->es_principal ? 1 : 0;

            $stmt->bindParam(":id", $id);
            $stmt->bindParam(":codigo", $codigo);
            $stmt->bindParam(":nombre", $nombre);
            $stmt->bindParam(":direccion", $direccion);
            $stmt->bindParam(":principal", $principal);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Sede actualizada correctamente"]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "No se pudo actualizar la sede"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
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
            // Soft delete
            $query = "UPDATE sedes SET activo = 0 WHERE id = :id";
            $stmt = $db->prepare($query);
            $stmt->bindParam(":id", $data->id);

            if ($stmt->execute()) {
                echo json_encode(["message" => "Sede eliminada correctamente"]);
            } else {
                http_response_code(503);
                echo json_encode(["message" => "No se pudo eliminar la sede"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;
}
?>
