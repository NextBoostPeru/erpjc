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
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
rbac_require($conn, $userData, 'precios_promociones', $method);

$action = $_GET['action'] ?? '';

switch ($action) {
    // --- LISTAS DE PRECIOS ---
    case 'listar_listas':
        $stmt = $conn->query("SELECT * FROM listas_precios ORDER BY created_at DESC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'guardar_lista':
        $data = json_decode(file_get_contents("php://input"), true);
        try {
            $conn->beginTransaction();
            
            if (empty($data['id'])) {
                $sql = "INSERT INTO listas_precios (nombre, descripcion, tipo, moneda, estado) 
                        VALUES (:nombre, :desc, :tipo, :moneda, 'activa')";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':nombre' => $data['nombre'],
                    ':desc' => $data['descripcion'] ?? '',
                    ':tipo' => $data['tipo'] ?? 'base',
                    ':moneda' => $data['moneda'] ?? 'PEN'
                ]);
                $id = $conn->lastInsertId();
            } else {
                $sql = "UPDATE listas_precios SET nombre = :nombre, descripcion = :desc, tipo = :tipo, moneda = :moneda, estado = :estado WHERE id = :id";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':nombre' => $data['nombre'],
                    ':desc' => $data['descripcion'] ?? '',
                    ':tipo' => $data['tipo'],
                    ':moneda' => $data['moneda'],
                    ':estado' => $data['estado'] ?? 'activa',
                    ':id' => $data['id']
                ]);
                $id = $data['id'];
            }

            // Handle items
            if (isset($data['items'])) {
                // Delete existing if update (simplified logic, better to diff)
                if (!empty($data['id'])) {
                    $stmt = $conn->prepare("DELETE FROM listas_precios_items WHERE lista_id = :id");
                    $stmt->execute([':id' => $id]);
                }
                
                // Batch Insert Optimization
                $values = [];
                $placeholders = [];
                
                foreach ($data['items'] as $item) {
                    $placeholders[] = "(?, ?, ?, ?)";
                    $values[] = $id;
                    $values[] = $item['producto_id'];
                    $values[] = $item['precio'];
                    $values[] = $item['min_cantidad'] ?? 1;
                }

                if (!empty($placeholders)) {
                    $sqlItem = "INSERT INTO listas_precios_items (lista_id, producto_id, precio, min_cantidad) VALUES " . implode(', ', $placeholders);
                    $stmtItem = $conn->prepare($sqlItem);
                    $stmtItem->execute($values);
                }
            }

            $conn->commit();
            echo json_encode(["message" => "Lista guardada", "id" => $id]);
        } catch (Exception $e) {
            $conn->rollBack();
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
            exit;
        }
        break;

    case 'obtener_lista':
        $id = $_GET['id'] ?? null;
        if (!$id) {
             http_response_code(400);
             echo json_encode(["message" => "ID requerido"]);
             if (isset($conn)) $conn = null;
             exit;
        }
        try {
            $stmt = $conn->prepare("SELECT * FROM listas_precios WHERE id = :id");
            $stmt->execute([':id' => $id]);
            $lista = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($lista) {
                $stmt = $conn->prepare("SELECT i.*, p.nombre as producto_nombre, p.codigo as producto_codigo 
                                        FROM listas_precios_items i 
                                        JOIN productos p ON i.producto_id = p.id 
                                        WHERE i.lista_id = :id");
                $stmt->execute([':id' => $id]);
                $lista['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
            echo json_encode($lista ?: []);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'eliminar_lista':
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['id'])) {
             http_response_code(400);
             echo json_encode(["message" => "ID requerido"]);
             if (isset($conn)) $conn = null;
             exit;
        }
        try {
            $stmt = $conn->prepare("DELETE FROM listas_precios WHERE id = :id");
            $stmt->execute([':id' => $data['id']]);
            echo json_encode(["message" => "Lista eliminada"]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
        }
        break;

    // --- PROMOCIONES ---
    case 'listar_promociones':
        $stmt = $conn->query("SELECT * FROM promociones ORDER BY fecha_inicio DESC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'guardar_promocion':
        $data = json_decode(file_get_contents("php://input"), true);
        try {
            $conn->beginTransaction();
            
            if (empty($data['id'])) {
                $sql = "INSERT INTO promociones (nombre, fecha_inicio, fecha_fin, tipo_descuento, valor, alcance, estado) 
                        VALUES (:nombre, :fi, :ff, :tipo, :val, :alcance, :estado)";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':nombre' => $data['nombre'],
                    ':fi' => $data['fecha_inicio'],
                    ':ff' => $data['fecha_fin'],
                    ':tipo' => $data['tipo_descuento'],
                    ':val' => $data['valor'],
                    ':alcance' => $data['alcance'],
                    ':estado' => $data['estado'] ?? 'programada'
                ]);
                $id = $conn->lastInsertId();
            } else {
                $sql = "UPDATE promociones SET nombre = :nombre, fecha_inicio = :fi, fecha_fin = :ff, 
                        tipo_descuento = :tipo, valor = :val, alcance = :alcance, estado = :estado WHERE id = :id";
                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':nombre' => $data['nombre'],
                    ':fi' => $data['fecha_inicio'],
                    ':ff' => $data['fecha_fin'],
                    ':tipo' => $data['tipo_descuento'],
                    ':val' => $data['valor'],
                    ':alcance' => $data['alcance'],
                    ':estado' => $data['estado'],
                    ':id' => $data['id']
                ]);
                $id = $data['id'];
            }

            if ($data['alcance'] === 'seleccion' && isset($data['items']) && is_array($data['items']) && !empty($data['items'])) {
                if (!empty($data['id'])) {
                    $stmt = $conn->prepare("DELETE FROM promociones_items WHERE promocion_id = :id");
                    $stmt->execute([':id' => $id]);
                }
                
                // Batch Insert Optimization
                $values = [];
                $placeholders = [];
                
                foreach ($data['items'] as $prodId) {
                    $placeholders[] = "(?, ?)";
                    $values[] = $id;
                    $values[] = $prodId;
                }

                if (!empty($placeholders)) {
                    $sqlItem = "INSERT INTO promociones_items (promocion_id, producto_id) VALUES " . implode(', ', $placeholders);
                    $stmtItem = $conn->prepare($sqlItem);
                    $stmtItem->execute($values);
                }
            }

            $conn->commit();
            echo json_encode(["message" => "Promoción guardada", "id" => $id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
            exit;
        }
        break;
        
    case 'eliminar_promocion':
        $data = json_decode(file_get_contents("php://input"), true);
        try {
            $stmt = $conn->prepare("DELETE FROM promociones WHERE id = :id");
            $stmt->execute([':id' => $data['id']]);
            echo json_encode(["message" => "Promoción eliminada"]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error: " . $e->getMessage()]);
            if (isset($conn)) $conn = null;
        }
        break;

    // --- CONFIGURACION (POLITICAS) ---
    case 'get_politicas':
        $stmt = $conn->query("SELECT * FROM politicas_comerciales WHERE rol_nombre = 'ventas'");
        echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
        break;

    case 'save_politicas':
        $data = json_decode(file_get_contents("php://input"), true);
        $sql = "UPDATE politicas_comerciales SET max_descuento_autorizado = :max, margen_minimo_alerta = :margen WHERE rol_nombre = 'ventas'";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':max' => $data['max_descuento_autorizado'],
            ':margen' => $data['margen_minimo_alerta']
        ]);
        echo json_encode(["message" => "Políticas actualizadas"]);
        break;
        
    // --- HELPER FOR PRODUCTS ---
    case 'buscar_productos':
        $q = $_GET['q'] ?? '';
        $sql = "SELECT id, nombre, codigo, precio_compra, precio FROM productos WHERE nombre LIKE :q OR codigo LIKE :q LIMIT 20";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':q' => "%$q%"]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    default:
        http_response_code(400);
        echo json_encode(["message" => "Acción no válida"]);
        break;
}
if (isset($conn)) $conn = null;
?>
