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

rbac_require($db, $userData, 'centros_costos', $method);

$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'reporte') {
            // Reportes agrupados
            $groupBy = $_GET['group_by'] ?? 'centro_costo'; // centro_costo, servicio, responsable, periodo
            $fechaInicio = $_GET['fecha_inicio'] ?? date('Y-m-01');
            $fechaFin = $_GET['fecha_fin'] ?? date('Y-m-t');

            try {
                $sql = "";
                $params = [':fi' => $fechaInicio, ':ff' => $fechaFin];

                if ($groupBy === 'centro_costo') {
                    $sql = "SELECT cc.nombre as label, 
                            SUM(CASE WHEN mf.tipo = 'Ingreso' THEN mf.monto ELSE 0 END) as ingresos,
                            SUM(CASE WHEN mf.tipo = 'Egreso' THEN mf.monto ELSE 0 END) as egresos
                            FROM movimientos_financieros mf
                            JOIN centros_costos cc ON mf.centro_costo_id = cc.id
                            WHERE mf.fecha BETWEEN :fi AND :ff
                            GROUP BY cc.id, cc.nombre";
                } elseif ($groupBy === 'servicio') {
                    $sql = "SELECT s.nombre as label, 
                            SUM(CASE WHEN mf.tipo = 'Ingreso' THEN mf.monto ELSE 0 END) as ingresos,
                            SUM(CASE WHEN mf.tipo = 'Egreso' THEN mf.monto ELSE 0 END) as egresos
                            FROM movimientos_financieros mf
                            LEFT JOIN centros_costos_servicios s ON mf.servicio_id = s.id
                            WHERE mf.fecha BETWEEN :fi AND :ff
                            GROUP BY s.id, s.nombre";
                } elseif ($groupBy === 'responsable') {
                    $sql = "SELECT mf.responsable as label, 
                            SUM(CASE WHEN mf.tipo = 'Ingreso' THEN mf.monto ELSE 0 END) as ingresos,
                            SUM(CASE WHEN mf.tipo = 'Egreso' THEN mf.monto ELSE 0 END) as egresos
                            FROM movimientos_financieros mf
                            WHERE mf.fecha BETWEEN :fi AND :ff
                            GROUP BY mf.responsable";
                } elseif ($groupBy === 'periodo') {
                    $sql = "SELECT mf.periodo as label, 
                            SUM(CASE WHEN mf.tipo = 'Ingreso' THEN mf.monto ELSE 0 END) as ingresos,
                            SUM(CASE WHEN mf.tipo = 'Egreso' THEN mf.monto ELSE 0 END) as egresos
                            FROM movimientos_financieros mf
                            WHERE mf.fecha BETWEEN :fi AND :ff
                            GROUP BY mf.periodo";
                } elseif ($groupBy === 'area') {
                    $sql = "SELECT COALESCE(cc.area, 'Sin área') as label,
                            SUM(CASE WHEN mf.tipo = 'Ingreso' THEN mf.monto ELSE 0 END) as ingresos,
                            SUM(CASE WHEN mf.tipo = 'Egreso' THEN mf.monto ELSE 0 END) as egresos
                            FROM movimientos_financieros mf
                            JOIN centros_costos cc ON mf.centro_costo_id = cc.id
                            WHERE mf.fecha BETWEEN :fi AND :ff
                            GROUP BY cc.area";
                }

                if ($sql) {
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);
                    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    
                    // Calcular utilidad
                    foreach ($data as &$row) {
                        $row['utilidad'] = floatval($row['ingresos']) - floatval($row['egresos']);
                        $row['ingresos'] = floatval($row['ingresos']);
                        $row['egresos'] = floatval($row['egresos']);
                    }
                    
                    echo json_encode(["success" => true, "data" => $data]);
                } else {
                    echo json_encode(["success" => false, "message" => "Agrupación no válida"]);
                }
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
            }

        } else {
            // Listar movimientos con filtros
            $limit = $_GET['limit'] ?? 100;
            $offset = $_GET['offset'] ?? 0;
            $search = $_GET['search'] ?? '';
            
            try {
                $sql = "SELECT mf.*, cc.nombre as centro_costo_nombre, s.nombre as servicio_nombre 
                        FROM movimientos_financieros mf
                        JOIN centros_costos cc ON mf.centro_costo_id = cc.id
                        LEFT JOIN centros_costos_servicios s ON mf.servicio_id = s.id
                        WHERE (cc.nombre LIKE :s OR mf.descripcion LIKE :s OR mf.responsable LIKE :s OR mf.cliente_nombre LIKE :s OR mf.comprobante_referencia LIKE :s)";
                
                if (isset($_GET['fecha_inicio']) && isset($_GET['fecha_fin'])) {
                    $sql .= " AND mf.fecha BETWEEN :fi AND :ff";
                }
                
                $sql .= " ORDER BY mf.fecha DESC, mf.id DESC LIMIT :lim OFFSET :off";
                
                $stmt = $db->prepare($sql);
                $stmt->bindValue(':s', "%$search%");
                $stmt->bindValue(':lim', (int)$limit, PDO::PARAM_INT);
                $stmt->bindValue(':off', (int)$offset, PDO::PARAM_INT);
                
                if (isset($_GET['fecha_inicio']) && isset($_GET['fecha_fin'])) {
                    $stmt->bindValue(':fi', $_GET['fecha_inicio']);
                    $stmt->bindValue(':ff', $_GET['fecha_fin']);
                }
                
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
        
        // Validaciones
        if (!isset($data->fecha) || !isset($data->tipo) || !isset($data->centro_costo_id) || !isset($data->monto)) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Faltan campos obligatorios"]);
            exit;
        }

        if ($data->monto <= 0) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "El monto debe ser mayor a cero"]);
            exit;
        }

        // Validar servicio dependiente del centro
        if (!empty($data->servicio_id)) {
            $stmtCheck = $db->prepare("SELECT id FROM centros_costos_servicios WHERE id = ? AND centro_costo_id = ?");
            $stmtCheck->execute([$data->servicio_id, $data->centro_costo_id]);
            if (!$stmtCheck->fetch()) {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "El servicio seleccionado no pertenece al centro de costo"]);
                exit;
            }
        }

        try {
            $query = "INSERT INTO movimientos_financieros (fecha, tipo, centro_costo_id, servicio_id, monto, responsable, periodo, descripcion, cliente_id, cliente_nombre, comprobante_id, comprobante_referencia) 
                      VALUES (:fecha, :tipo, :cc, :serv, :monto, :resp, :per, :desc, :cli, :clinom, :comp, :compref)";
            $stmt = $db->prepare($query);
            $stmt->execute([
                ':fecha' => $data->fecha,
                ':tipo' => $data->tipo,
                ':cc' => $data->centro_costo_id,
                ':serv' => $data->servicio_id ?? null,
                ':monto' => $data->monto,
                ':resp' => $data->responsable ?? '',
                ':per' => $data->periodo ?? date('Y-m', strtotime($data->fecha)),
                ':desc' => $data->descripcion ?? '',
                ':cli' => $data->cliente_id ?? null,
                ':clinom' => $data->cliente_nombre ?? null,
                ':comp' => $data->comprobante_id ?? null,
                ':compref' => $data->comprobante_referencia ?? null
            ]);
            
            echo json_encode(["success" => true, "message" => "Movimiento registrado", "id" => $db->lastInsertId()]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"));
        
        if (!isset($data->id)) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Falta ID"]);
            exit;
        }

        // Validaciones (si se actualizan campos clave)
        if (isset($data->monto) && $data->monto <= 0) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "El monto debe ser mayor a cero"]);
            exit;
        }

        try {
            $fields = [];
            $params = [':id' => $data->id];
            
            $allowed = ['fecha', 'tipo', 'centro_costo_id', 'servicio_id', 'monto', 'responsable', 'periodo', 'descripcion', 'cliente_id', 'cliente_nombre', 'comprobante_id', 'comprobante_referencia'];
            
            foreach ($allowed as $field) {
                if (isset($data->$field)) {
                    $fields[] = "$field = :$field";
                    $params[":$field"] = $data->$field;
                }
            }
            
            if (empty($fields)) {
                echo json_encode(["success" => true, "message" => "Nada que actualizar"]);
                exit;
            }

            $query = "UPDATE movimientos_financieros SET " . implode(", ", $fields) . ", updated_at = NOW() WHERE id = :id";
            $stmt = $db->prepare($query);
            $stmt->execute($params);
            
            echo json_encode(["success" => true, "message" => "Movimiento actualizado"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
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
            $stmt = $db->prepare("DELETE FROM movimientos_financieros WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true, "message" => "Movimiento eliminado"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Error: " . $e->getMessage()]);
        }
        break;
}

if (isset($conn)) $conn = null;
?>
