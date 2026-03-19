<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header('Content-Type: application/json');

include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

// Debug logging to file
$logData = date('Y-m-d H:i:s') . " - Action: " . ($_GET['action'] ?? 'none') . "\n";
$logData .= "Token: " . ($token ? substr($token, 0, 10) . "..." : "MISSING") . "\n";
$logData .= "Auth Header: " . ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['Authorization'] ?? 'NOT FOUND') . "\n";
$logData .= "UserData: " . ($userData ? "VALID" : "INVALID") . "\n";
file_put_contents(__DIR__ . '/../logs/debug_clients.log', $logData . "\n", FILE_APPEND);

// Debug logging
if (!$userData) {
    error_log("Auth failed. Token: " . ($token ? "Provided" : "Missing"));
}

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
rbac_require($conn, $userData, 'clientes_proveedores', $method);

$action = $_GET['action'] ?? 'listar';
$type = $_GET['type'] ?? 'clientes'; // clientes, proveedores

// Sanitizar type para evitar inyección en nombre de tabla
if (!in_array($type, ['clientes', 'proveedores'])) {
    $type = 'clientes';
}

switch ($action) {
    case 'listar':
        $table = $type;
        $search = $_GET['search'] ?? '';
        $estado = $_GET['estado'] ?? 'Activo'; // Activo, Inactivo, Todos
        
        $page = isset($_GET['page']) ? (int)$_GET['page'] : null;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;

        $where = [];
        $params = [];
        
        if ($estado !== 'Todos') {
            $where[] = "estado = :estado";
            $params[':estado'] = $estado;
        }
        
        if ($search) {
            $where[] = "(razon_social LIKE :search OR num_doc LIKE :search OR email LIKE :search)";
            $params[':search'] = "%$search%";
        }
        
        $whereSql = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
        
        if ($page) {
            $offset = ($page - 1) * $limit;
            
            // Count
            $countSql = "SELECT COUNT(*) FROM $table $whereSql";
            $stmtCount = $conn->prepare($countSql);
            $stmtCount->execute($params);
            $total = $stmtCount->fetchColumn();
            
            // Data
            // Optimization: Select * to avoid schema mismatch issues
            $sql = "SELECT * FROM $table $whereSql ORDER BY razon_social ASC LIMIT :limit OFFSET :offset";
            $stmt = $conn->prepare($sql);
            foreach ($params as $k => $v) {
                $stmt->bindValue($k, $v);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            
            echo json_encode([
                'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
                'pagination' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => ceil($total / $limit)
                ]
            ]);
        } else {
            // Optimization: Limit non-paginated requests to prevent DB saturation
            $sql = "SELECT * FROM $table";
            if (!empty($where)) {
                $sql .= " WHERE " . implode(" AND ", $where);
            }
            $sql .= " ORDER BY razon_social ASC LIMIT 500"; // Hard limit for safety
            
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        }
        break;

    case 'guardar':
        $data = json_decode(file_get_contents("php://input"), true);
        $table = $type;
        
        // Validation
        if (empty($data['num_doc']) || empty($data['razon_social'])) {
            http_response_code(400);
            echo json_encode(["message" => "Documento y Razón Social son obligatorios"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        if ($data['tipo_doc'] === '1' && strlen($data['num_doc']) !== 8) {
            http_response_code(400);
            echo json_encode(["message" => "El DNI debe tener 8 dígitos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        if ($data['tipo_doc'] === '6' && strlen($data['num_doc']) !== 11) {
            http_response_code(400);
            echo json_encode(["message" => "El RUC debe tener 11 dígitos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        try {
            // Check if exists (unique constraint on num_doc)
            $sqlCheck = "SELECT id, estado FROM $table WHERE num_doc = :num_doc AND estado != 'Eliminado'";
            $paramsCheck = [':num_doc' => $data['num_doc']];
            
            if (!empty($data['id'])) {
                $sqlCheck .= " AND id != :id";
                $paramsCheck[':id'] = $data['id'];
            }
            
            $stmt = $conn->prepare($sqlCheck);
            $stmt->execute($paramsCheck);
            if ($existing = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (isset($existing['estado']) && $existing['estado'] === 'Inactivo') {
                    // AUTO-REACTIVACIÓN: Si existe y está inactivo, lo actualizamos y reactivamos
                    $data['id'] = $existing['id']; // Forzamos el ID existente para hacer UPDATE en lugar de INSERT
                    // Continuará al bloque de UPDATE más abajo...
                } else {
                    throw new Exception("El documento ya está registrado");
                }
            }

            if (empty($data['id'])) {
                // Create

                $sql = "INSERT INTO $table (tipo_doc, num_doc, razon_social, direccion, telefono, email, contacto_nombre, clasificacion, condicion_pago, estado) 
                        VALUES (:tipo, :num, :razon, :dir, :tel, :email, :contact, :clas, :cond, 'Activo')";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':tipo' => $data['tipo_doc'] ?? '6',
                    ':num' => $data['num_doc'],
                    ':razon' => $data['razon_social'],
                    ':dir' => $data['direccion'] ?? '',
                    ':tel' => $data['telefono'] ?? '',
                    ':email' => $data['email'] ?? '',
                    ':contact' => $data['contacto_nombre'] ?? '',
                    ':clas' => $data['clasificacion'] ?? 'Regular',
                    ':cond' => $data['condicion_pago'] ?? 'Contado'
                ]);
                echo json_encode(["message" => "Registrado correctamente", "id" => $conn->lastInsertId()]);
            } else {
                // Update
                $sql = "UPDATE $table SET 
                        tipo_doc = :tipo, 
                        num_doc = :num, 
                        razon_social = :razon, 
                        direccion = :dir, 
                        telefono = :tel, 
                        email = :email, 
                        contacto_nombre = :contact,
                        clasificacion = :clas, 
                        condicion_pago = :cond,
                        estado = 'Activo'
                        WHERE id = :id";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':tipo' => $data['tipo_doc'] ?? '6',
                    ':num' => $data['num_doc'],
                    ':razon' => $data['razon_social'],
                    ':dir' => $data['direccion'] ?? '',
                    ':tel' => $data['telefono'] ?? '',
                    ':email' => $data['email'] ?? '',
                    ':contact' => $data['contacto_nombre'] ?? '',
                    ':clas' => $data['clasificacion'] ?? 'Regular',
                    ':cond' => $data['condicion_pago'] ?? 'Contado',
                    ':id' => $data['id']
                ]);
                echo json_encode(["message" => "Actualizado correctamente"]);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'eliminar':
        $id = $_GET['id'] ?? 0;
        $table = $type;
        
        try {
            $stmt = $conn->prepare("UPDATE $table SET estado = 'Inactivo' WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["message" => "Eliminado correctamente"]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'consulta_ruc': // Backward compatibility
    case 'consulta_doc':
        $doc = $_GET['doc'] ?? $_GET['ruc'] ?? '';
        
        require_once __DIR__ . '/services/SunatService.php';

        // Obtener configuración desde DB
        $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
        $stmtConfig->execute();
        $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
        $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];
        
        $token = $sunatConfig['apiperu_token'] ?? ''; 
        $url = $sunatConfig['apiperu_url'] ?? 'https://apiperu.dev/api/';

        $sunatService = new SunatService($token, $url);
        
        $result = ['success' => false, 'message' => 'Documento inválido'];

        if (strlen($doc) == 11) {
            $result = $sunatService->consultarRUC($doc);
        } elseif (strlen($doc) == 8) {
            $result = $sunatService->consultarDNI($doc);
        }

        if ($result['success']) {
            echo json_encode($result);
        } else {
            http_response_code(404);
            echo json_encode(["message" => $result['message']]);
        }
        break;

    case 'historial':
        $num_doc = $_GET['num_doc'] ?? '';
        
        if ($type === 'clientes') {
            $sql = "SELECT id, fecha_emision as fecha, CONCAT(serie, '-', correlativo) as documento, total_importe as monto, estado 
                    FROM comprobantes_electronicos 
                    WHERE cliente_num_doc = :num 
                    ORDER BY fecha_emision DESC LIMIT 20";
        } else {
            $sql = "SELECT id, fecha_emision as fecha, CONCAT(serie, '-', numero) as documento, importe_total as monto, estado 
                    FROM comprobantes_compra 
                    WHERE proveedor_num_doc = :num 
                    ORDER BY fecha_emision DESC LIMIT 20";
        }
        
        $stmt = $conn->prepare($sql);
        $stmt->execute([':num' => $num_doc]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'upload_archivo':
        $proveedor_id = $_POST['proveedor_id'] ?? '';
        
        if (empty($proveedor_id) || empty($_FILES['archivo'])) {
            http_response_code(400);
            echo json_encode(["message" => "Faltan datos (ID proveedor o archivo)"]);
            exit;
        }

        $uploadDir = __DIR__ . '/uploads/proveedores/';
        if (!file_exists($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $file = $_FILES['archivo'];
        $fileName = time() . '_' . preg_replace('/[^a-zA-Z0-9_.-]/', '_', $file['name']);
        $targetPath = $uploadDir . $fileName;
        $fileType = strtolower(pathinfo($targetPath, PATHINFO_EXTENSION));

        // Validar tipo de archivo
        $allowedTypes = ['pdf', 'jpg', 'jpeg', 'png'];
        if (!in_array($fileType, $allowedTypes)) {
            http_response_code(400);
            echo json_encode(["message" => "Tipo de archivo no permitido. Solo PDF y JPG/PNG."]);
            exit;
        }

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            try {
                $sql = "INSERT INTO proveedores_archivos (proveedor_id, nombre_archivo, ruta_archivo, tipo_archivo) 
                        VALUES (:pid, :nombre, :ruta, :tipo)";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':pid' => $proveedor_id,
                    ':nombre' => $file['name'], // Nombre original
                    ':ruta' => $fileName,       // Nombre en disco
                    ':tipo' => $fileType
                ]);
                echo json_encode(["message" => "Archivo subido correctamente", "id" => $conn->lastInsertId()]);
            } catch (Exception $e) {
                // Si falla la BD, borrar el archivo
                unlink($targetPath);
                http_response_code(500);
                echo json_encode(["message" => "Error al guardar en BD: " . $e->getMessage()]);
            }
        } else {
            http_response_code(500);
            echo json_encode(["message" => "Error al mover el archivo al servidor"]);
        }
        break;

    case 'listar_archivos':
        $proveedor_id = $_GET['proveedor_id'] ?? 0;
        try {
            $stmt = $conn->prepare("SELECT * FROM proveedores_archivos WHERE proveedor_id = :pid ORDER BY fecha_subida DESC");
            $stmt->execute([':pid' => $proveedor_id]);
            $files = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Agregar URL relativa para el frontend
            foreach ($files as &$file) {
                $file['url'] = 'uploads/proveedores/' . $file['ruta_archivo'];
            }
            
            echo json_encode($files);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error al listar archivos: " . $e->getMessage()]);
        }
        break;

    case 'eliminar_archivo':
        $id = $_GET['id'] ?? 0;
        try {
            // Obtener ruta antes de borrar
            $stmt = $conn->prepare("SELECT ruta_archivo FROM proveedores_archivos WHERE id = :id");
            $stmt->execute([':id' => $id]);
            $file = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($file) {
                $filePath = __DIR__ . '/uploads/proveedores/' . $file['ruta_archivo'];
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
                
                $stmt = $conn->prepare("DELETE FROM proveedores_archivos WHERE id = :id");
                $stmt->execute([':id' => $id]);
                echo json_encode(["message" => "Archivo eliminado correctamente"]);
            } else {
                http_response_code(404);
                echo json_encode(["message" => "Archivo no encontrado"]);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error al eliminar archivo: " . $e->getMessage()]);
        }
        break;

        
    default:
        http_response_code(400);
        echo json_encode(["message" => "Acción no válida"]);
        break;
}
if (isset($conn)) $conn = null;
?>
