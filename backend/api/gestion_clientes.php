<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    $userData = $jwtHandler->validateToken($token);
    if (!$userData) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    rbac_require($conn, $userData, 'gestion_clientes', $method);

    switch ($method) {
        case 'GET':
            if ($action === 'list') {
                $search = isset($_GET['search']) ? $_GET['search'] : '';
                
                // Optimization: Select specific columns
                $cols = "id, tipo_doc, num_doc, tipo_persona, razon_social, direccion, telefono, email, contacto_nombre, segmento, tipo_cliente, clasificacion, condicion_pago, estado";
                $sql = "SELECT $cols FROM clientes";
                
                $where = [];
                $params = [];
                
                if ($search) {
                    $where[] = "(razon_social LIKE :search OR num_doc LIKE :search OR contacto_nombre LIKE :search)";
                    $params[':search'] = "%$search%";
                }
                
                if (!empty($where)) {
                    $sql .= " WHERE " . implode(" AND ", $where);
                }
                
                $sql .= " ORDER BY created_at DESC LIMIT 500"; // Hard limit
                
                $stmt = $conn->prepare($sql);
                $stmt->execute($params);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

            } elseif ($action === 'history') {
                // Get sales history for a client by DNI/RUC (num_doc)
                $num_doc = $_GET['num_doc'];
                if (!$num_doc) {
                     $conn = null;
                     throw new Exception("Número de documento requerido");
                }

                $query = "SELECT tipo_comprobante, serie, correlativo, fecha_emision, total_importe, estado, moneda 
                          FROM comprobantes_electronicos 
                          WHERE cliente_num_doc = ? 
                          ORDER BY fecha_emision DESC LIMIT 50";
                $stmt = $conn->prepare($query);
                $stmt->execute([$num_doc]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
                
            } elseif ($action === 'validate_ruc') {
                $ruc = $_GET['ruc'];
                
                require_once __DIR__ . '/services/SunatService.php';

                // Obtener configuración desde DB
                $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
                $stmtConfig->execute();
                $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
                $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];
                
                $token = $sunatConfig['apiperu_token'] ?? ''; 
                $url = $sunatConfig['apiperu_url'] ?? 'https://apiperu.dev/api/';

                $sunatService = new SunatService($token, $url);
                $result = $sunatService->consultarRUC($ruc);
                
                if ($result['success']) {
                    echo json_encode([
                        'razonSocial' => $result['razon_social'],
                        'direccion' => $result['direccion'],
                        'estado' => $result['estado'],
                        'condicion' => $result['condicion']
                    ]);
                } else {
                    http_response_code(404);
                    echo json_encode(["message" => $result['message']]);
                }

            } elseif ($action === 'validate_dni') {
                $dni = $_GET['dni'];
                require_once __DIR__ . '/services/SunatService.php';

                // Obtener configuración desde DB
                $stmtConfig = $conn->prepare("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
                $stmtConfig->execute();
                $empresaConfig = $stmtConfig->fetch(PDO::FETCH_ASSOC);
                $sunatConfig = isset($empresaConfig['configuracion_sunat']) ? json_decode($empresaConfig['configuracion_sunat'], true) : [];
                
                $token = $sunatConfig['apiperu_token'] ?? ''; 
                $url = $sunatConfig['apiperu_url'] ?? 'https://apiperu.dev/api/';

                $sunatService = new SunatService($token, $url);
                $result = $sunatService->consultarDNI($dni);
                
                if ($result['success']) {
                    echo json_encode([
                        'razonSocial' => $result['razon_social'], // Map nombre_completo/nombres to razonSocial for consistency
                        'razon_social' => $result['razon_social'],
                        'nombre' => $result['razon_social'],
                        'direccion' => '', // DNI usually doesn't return address in public APIs or it varies
                        'estado' => 'Activo',
                        'condicion' => 'Habido'
                    ]);
                } else {
                    http_response_code(404);
                    echo json_encode(["message" => $result['message']]);
                }
            }
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"), true);
            
            if ($action === 'create') {
                // Check if exists
                $stmt = $conn->prepare("SELECT id, estado FROM clientes WHERE num_doc = ?");
                $stmt->execute([$data['num_doc']]);
                if ($existing = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    if (isset($existing['estado']) && $existing['estado'] === 'Inactivo') {
                        // AUTO-REACTIVACIÓN: Redirigir a lógica de UPDATE
                        $action = 'update';
                        $data['id'] = $existing['id'];
                        // No lanzamos excepción, dejamos que fluya (pero necesitamos ajustar el flujo porque create y update son bloques separados if/else)
                    } else {
                        throw new Exception("El cliente con documento {$data['num_doc']} ya existe.");
                    }
                }
                
                if ($action === 'create') { // Solo si sigue siendo create
                    $sql = "INSERT INTO clientes (
                        tipo_doc, num_doc, tipo_persona, razon_social, direccion, telefono, email, 
                        contacto_nombre, segmento, tipo_cliente, clasificacion, condicion_pago, estado
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )";
                    $stmt = $conn->prepare($sql);
                    $stmt->execute([
                        $data['tipo_doc'],
                        $data['num_doc'],
                        $data['tipo_persona'],
                        $data['razon_social'],
                        $data['direccion'],
                        $data['telefono'],
                        $data['email'],
                        $data['contacto_nombre'],
                        $data['segmento'],
                        $data['tipo_cliente'],
                        $data['clasificacion'] ?? 'Regular',
                        $data['condicion_pago'] ?? 'Contado',
                        $data['estado'] ?? 'Activo'
                    ]);
                    echo json_encode(['message' => 'Cliente registrado correctamente', 'id' => $conn->lastInsertId()]);
                }
            }

            // Nota: El bloque UPDATE está en otro IF separado en el código original, necesito asegurarme de que se ejecute si cambié action a 'update'.
            // Revisando el código original: if ($action === 'create') { ... } break; case 'PUT': ...
            // El código original usa métodos HTTP distintos (POST para create, PUT para update).
            // Si cambio $action a 'update' aquí dentro del POST, NO saltará mágicamente al bloque PUT.
            // Solución: Si es reactivación, ejecutar el UPDATE aquí mismo dentro del bloque POST/create.

            if ($action === 'update_reactivation' || (isset($existing['estado']) && $existing['estado'] === 'Inactivo')) {
                 $sql = "UPDATE clientes SET 
                    tipo_doc = ?, tipo_persona = ?, razon_social = ?, direccion = ?, 
                    telefono = ?, email = ?, contacto_nombre = ?, segmento = ?, 
                    tipo_cliente = ?, clasificacion = ?, condicion_pago = ?, estado = 'Activo',
                    created_at = NOW()
                    WHERE id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    $data['tipo_doc'],
                    $data['tipo_persona'],
                    $data['razon_social'],
                    $data['direccion'],
                    $data['telefono'],
                    $data['email'],
                    $data['contacto_nombre'],
                    $data['segmento'],
                    $data['tipo_cliente'],
                    $data['clasificacion'] ?? 'Regular',
                    $data['condicion_pago'] ?? 'Contado',
                    // estado forzado a Activo arriba, created_at actualizado
                    $data['id']
                ]);
                echo json_encode(['message' => 'Cliente reactivado y actualizado correctamente. Aparecerá al inicio de la lista.']);
            }
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"), true);
            
            if ($action === 'update') {
                $sql = "UPDATE clientes SET 
                    tipo_doc = ?, tipo_persona = ?, razon_social = ?, direccion = ?, 
                    telefono = ?, email = ?, contacto_nombre = ?, segmento = ?, 
                    tipo_cliente = ?, clasificacion = ?, condicion_pago = ?, estado = ?
                    WHERE id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    $data['tipo_doc'],
                    $data['tipo_persona'],
                    $data['razon_social'],
                    $data['direccion'],
                    $data['telefono'],
                    $data['email'],
                    $data['contacto_nombre'],
                    $data['segmento'],
                    $data['tipo_cliente'],
                    $data['clasificacion'],
                    $data['condicion_pago'],
                    $data['estado'],
                    $data['id']
                ]);
                echo json_encode(['message' => 'Cliente actualizado correctamente']);
            }
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['message' => $e->getMessage()]);
}

$conn = null;
$conn = null;

