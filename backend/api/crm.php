<?php
// Headers first
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-API-KEY");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';

$action = $_GET['action'] ?? '';

// Public Endpoint for WordPress Webhook
if ($action === 'webhook_wordpress') {
    // Check for API Key (Simple security)
    $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';
    
    // Get valid key from DB
    $stmtKey = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'crm_wp_api_key'");
    $stmtKey->execute();
    $validKey = $stmtKey->fetchColumn();

    if (!$validKey) {
        // Fallback or init if somehow missing
        $validKey = 'wp_erp_secret_key_123';
    }

    if ($apiKey !== $validKey) {
        if (isset($conn)) $conn = null;
        http_response_code(403);
        echo json_encode(["message" => "Invalid API Key"]);
        exit;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    
    // Map fields from WP (assuming standard contact form 7 or similar)
    $nombre = $data['your-name'] ?? $data['nombre'] ?? 'Desconocido';
    $email = $data['your-email'] ?? $data['email'] ?? '';
    $telefono = $data['your-phone'] ?? $data['telefono'] ?? '';
    $mensaje = $data['your-message'] ?? $data['mensaje'] ?? '';
    $empresa = $data['your-company'] ?? $data['empresa'] ?? '';

    // Assign to NULL (Unassigned) initially
    
    try {
        $stmt = $conn->prepare("INSERT INTO crm_leads (nombre, email, telefono, empresa, mensaje, origen, estado) VALUES (?, ?, ?, ?, ?, 'WordPress', 'Nuevo')");
        $stmt->execute([$nombre, $email, $telefono, $empresa, $mensaje]);
        echo json_encode(["message" => "Lead received"]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["message" => "Error saving lead: " . $e->getMessage()]);
    }
    if (isset($conn)) $conn = null;
    exit;
}

// Protected Routes
$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    $conn = null;
    exit;
}

$userId = $userData->id;

// Check if user is admin
$isAdmin = false;
$stmtRole = $conn->prepare("SELECT nombre FROM roles WHERE id = ?");
$stmtRole->execute([$userData->rol_id]);
$roleName = $stmtRole->fetchColumn();
if ($roleName === 'admin' || $roleName === 'gerencia' || $roleName === 'gerente') {
    $isAdmin = true;
}

switch ($action) {
    case 'search_cotizaciones':
        $q = $_GET['q'] ?? '';
        $q = trim($q); // Clean whitespace
        
        if (strlen($q) < 2) {
            echo json_encode([]);
            exit;
        }
        
        try {
            // Modificado para buscar también por correlativo y serie concatenada (ej. COT-1000082)
            $sql = "SELECT id, serie, correlativo, cliente_razon_social, fecha_emision, moneda, total_importe, estado 
                    FROM cotizaciones 
                    WHERE id LIKE ? 
                    OR correlativo LIKE ? 
                    OR CONCAT(serie, '-', correlativo) LIKE ? 
                    OR cliente_razon_social LIKE ? 
                    OR total_importe LIKE ?
                    ORDER BY fecha_emision DESC 
                    LIMIT 20";
            $stmt = $conn->prepare($sql);
            $term = "%$q%";
            $stmt->execute([$term, $term, $term, $term, $term]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'list':
        try {
            if ($isAdmin) {
                $sql = "SELECT l.*, u.usuario as assigned_user_name 
                        FROM crm_leads l 
                        LEFT JOIN usuarios u ON l.assigned_to = u.id 
                        ORDER BY l.created_at DESC";
                $stmt = $conn->prepare($sql);
                $stmt->execute();
            } else {
                // Salesperson sees assigned leads OR leads created by them
                $sql = "SELECT l.*, u.usuario as assigned_user_name 
                        FROM crm_leads l 
                        LEFT JOIN usuarios u ON l.assigned_to = u.id 
                        WHERE l.assigned_to = ? OR l.created_by = ?
                        ORDER BY l.created_at DESC";
                $stmt = $conn->prepare($sql);
                $stmt->execute([$userId, $userId]);
            }
            
            $leads = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Fetch linked cotizaciones for each lead
            // Optimization: fetch all relations for these leads in one go if possible, but loop is simpler for now
            foreach ($leads as &$lead) {
                $stmtCot = $conn->prepare("
                    SELECT c.id, c.cliente_razon_social, c.moneda, c.total_importe, c.fecha_emision, c.estado 
                    FROM crm_leads_cotizaciones clc
                    JOIN cotizaciones c ON clc.cotizacion_id = c.id
                    WHERE clc.lead_id = ?
                ");
                $stmtCot->execute([$lead['id']]);
                $lead['cotizaciones'] = $stmtCot->fetchAll(PDO::FETCH_ASSOC);
            }
            unset($lead); // break reference

            echo json_encode($leads);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'create':
        $data = json_decode(file_get_contents("php://input"), true);
        
        $nombre = $data['nombre'];
        $email = $data['email'] ?? '';
        $telefono = $data['telefono'] ?? '';
        $empresa = $data['empresa'] ?? '';
        $mensaje = $data['mensaje'] ?? '';
        $origen = 'Manual';
        
        // New fields
        $valor = $data['valor'] ?? 0.00;
        $probabilidad = $data['probabilidad'] ?? 0;
        $fecha_cierre = !empty($data['fecha_cierre_esperada']) ? $data['fecha_cierre_esperada'] : null;
        $etiquetas = $data['etiquetas'] ?? '';
        
        // Linked Cotizaciones
        $cotizaciones = $data['cotizaciones'] ?? [];

        // If admin creates, they can specify assigned_to. If sales, assigned to self.
        $assigned_to = ($isAdmin && isset($data['assigned_to'])) ? $data['assigned_to'] : $userId;

        try {
            $conn->beginTransaction();

            $sql = "INSERT INTO crm_leads (nombre, email, telefono, empresa, mensaje, origen, estado, assigned_to, created_by, valor, probabilidad, fecha_cierre_esperada, etiquetas) VALUES (?, ?, ?, ?, ?, ?, 'Nuevo', ?, ?, ?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$nombre, $email, $telefono, $empresa, $mensaje, $origen, $assigned_to, $userId, $valor, $probabilidad, $fecha_cierre, $etiquetas]);
            $leadId = $conn->lastInsertId();

            // Insert Cotizaciones Relations
            if (!empty($cotizaciones)) {
                $sqlRel = "INSERT INTO crm_leads_cotizaciones (lead_id, cotizacion_id) VALUES (?, ?)";
                $stmtRel = $conn->prepare($sqlRel);
                foreach ($cotizaciones as $cot) {
                    $cotId = is_array($cot) ? $cot['id'] : $cot;
                    $stmtRel->execute([$leadId, $cotId]);
                }
            }
            
            $conn->commit();
            
            echo json_encode(["message" => "Lead creado exitosamente", "id" => $leadId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'update':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'];
        
        // Security check: can user edit this lead?
        if (!$isAdmin) {
            $stmtCheck = $conn->prepare("SELECT id FROM crm_leads WHERE id = ? AND (assigned_to = ? OR created_by = ?)");
            $stmtCheck->execute([$id, $userId, $userId]);
            if (!$stmtCheck->fetch()) {
                http_response_code(403);
                echo json_encode(["message" => "No tienes permiso para editar este lead"]);
                if (isset($conn)) $conn = null;
                exit;
            }
        }

        $fields = [];
        $params = [];

        if (isset($data['nombre'])) { $fields[] = "nombre = ?"; $params[] = $data['nombre']; }
        if (isset($data['email'])) { $fields[] = "email = ?"; $params[] = $data['email']; }
        if (isset($data['telefono'])) { $fields[] = "telefono = ?"; $params[] = $data['telefono']; }
        if (isset($data['empresa'])) { $fields[] = "empresa = ?"; $params[] = $data['empresa']; }
        if (isset($data['mensaje'])) { $fields[] = "mensaje = ?"; $params[] = $data['mensaje']; }
        if (isset($data['estado'])) { $fields[] = "estado = ?"; $params[] = $data['estado']; }
        if ($isAdmin && isset($data['assigned_to'])) { $fields[] = "assigned_to = ?"; $params[] = $data['assigned_to']; }
        
        // New fields updates
        if (isset($data['valor'])) { $fields[] = "valor = ?"; $params[] = $data['valor']; }
        if (isset($data['probabilidad'])) { $fields[] = "probabilidad = ?"; $params[] = $data['probabilidad']; }
        if (array_key_exists('fecha_cierre_esperada', $data)) { $fields[] = "fecha_cierre_esperada = ?"; $params[] = !empty($data['fecha_cierre_esperada']) ? $data['fecha_cierre_esperada'] : null; }
        if (isset($data['etiquetas'])) { $fields[] = "etiquetas = ?"; $params[] = $data['etiquetas']; }

        if (empty($fields)) {
            echo json_encode(["message" => "Nada que actualizar"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $params[] = $id;
        try {
            $conn->beginTransaction();

            $sql = "UPDATE crm_leads SET " . implode(", ", $fields) . " WHERE id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            
            // Sync Cotizaciones if provided
            if (isset($data['cotizaciones'])) {
                // Remove old relations
                $stmtDel = $conn->prepare("DELETE FROM crm_leads_cotizaciones WHERE lead_id = ?");
                $stmtDel->execute([$id]);
                
                // Add new relations
                $cotizaciones = $data['cotizaciones'];
                if (!empty($cotizaciones)) {
                    $sqlRel = "INSERT INTO crm_leads_cotizaciones (lead_id, cotizacion_id) VALUES (?, ?)";
                    $stmtRel = $conn->prepare($sqlRel);
                    foreach ($cotizaciones as $cot) {
                        $cotId = is_array($cot) ? $cot['id'] : $cot;
                        $stmtRel->execute([$id, $cotId]);
                    }
                }
            }
            
            $conn->commit();
            echo json_encode(["message" => "Lead actualizado"]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;
        
    case 'delete':
         $id = $_GET['id'] ?? null;
         
         if (!$id) {
             http_response_code(400);
             echo json_encode(["message" => "ID no proporcionado"]);
             if (isset($conn)) $conn = null;
             exit;
         }

         // Security check: can user delete this lead?
         if (!$isAdmin) {
             $stmtCheck = $conn->prepare("SELECT id, assigned_to, created_by FROM crm_leads WHERE id = ?");
             $stmtCheck->execute([$id]);
             $lead = $stmtCheck->fetch(PDO::FETCH_ASSOC);

             if (!$lead) {
                // Return 200 or 404. 200 is safer for idempotency if UI is out of sync.
                // But let's return 404 to be precise.
                http_response_code(404);
                echo json_encode(["message" => "Lead no encontrado"]);
                exit;
             }

             if ($lead['assigned_to'] != $userId && $lead['created_by'] != $userId) {
                http_response_code(403);
                echo json_encode(["message" => "No tienes permiso para eliminar este lead"]);
                exit;
             }
         }

         try {
             $stmt = $conn->prepare("DELETE FROM crm_leads WHERE id = ?");
             $stmt->execute([$id]);
             echo json_encode(["message" => "Lead eliminado"]);
         } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'get_users':
        if ($isAdmin) {
            $stmt = $conn->query("SELECT id, usuario, email FROM usuarios");
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } else {
            http_response_code(403);
            echo json_encode(["message" => "Acceso denegado"]);
        }
        break;

    case 'get_config':
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(["message" => "Acceso denegado"]);
            $conn = null;
            exit;
        }
        $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'crm_wp_api_key'");
        $stmt->execute();
        $apiKey = $stmt->fetchColumn();
        
        // Construct full endpoint URL
        $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
        $host = $_SERVER['HTTP_HOST'];
        $endpoint = "$protocol://$host/api/crm.php?action=webhook_wordpress";
        
        echo json_encode([
            "api_key" => $apiKey, 
            "endpoint" => $endpoint,
            "plugin_code_url" => "$protocol://$host/wordpress_integration_plugin.php" // Optional helper
        ]);
        break;

    case 'regenerate_key':
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(["message" => "Acceso denegado"]);
            exit;
        }
        $newKey = 'wp_erp_' . bin2hex(random_bytes(16));
        $stmt = $conn->prepare("UPDATE system_settings SET setting_value = ? WHERE setting_key = 'crm_wp_api_key'");
        $stmt->execute([$newKey]);
        echo json_encode(["api_key" => $newKey, "message" => "Clave regenerada correctamente"]);
        break;

    // Activity Logs
    case 'add_activity':
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['lead_id']) || empty($data['tipo'])) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        // Security check
        if (!$isAdmin) {
            $stmtCheck = $conn->prepare("SELECT id FROM crm_leads WHERE id = ? AND (assigned_to = ? OR created_by = ?)");
            $stmtCheck->execute([$data['lead_id'], $userId, $userId]);
            if (!$stmtCheck->fetch()) {
                http_response_code(403);
                echo json_encode(["message" => "Acceso denegado"]);
                $conn = null;
                exit;
            }
        }

        try {
            $sql = "INSERT INTO crm_actividades (lead_id, tipo, descripcion, usuario_id) VALUES (?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$data['lead_id'], $data['tipo'], $data['descripcion'] ?? '', $userId]);
            
            // Update last activity on lead
            $stmtUpdate = $conn->prepare("UPDATE crm_leads SET ultima_actividad = NOW() WHERE id = ?");
            $stmtUpdate->execute([$data['lead_id']]);

            echo json_encode(["message" => "Actividad registrada"]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'get_activities':
        $leadId = $_GET['lead_id'];
        
        // Security check
        if (!$isAdmin) {
            $stmtCheck = $conn->prepare("SELECT id FROM crm_leads WHERE id = ? AND (assigned_to = ? OR created_by = ?)");
            $stmtCheck->execute([$leadId, $userId, $userId]);
            if (!$stmtCheck->fetch()) {
                http_response_code(403);
                echo json_encode(["message" => "Acceso denegado"]);
                $conn = null;
                exit;
            }
        }

        try {
            $sql = "SELECT a.*, u.usuario as usuario_nombre 
                    FROM crm_actividades a 
                    LEFT JOIN usuarios u ON a.usuario_id = u.id 
                    WHERE a.lead_id = ? 
                    ORDER BY a.fecha DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$leadId]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;
}
$conn = null;
?>
