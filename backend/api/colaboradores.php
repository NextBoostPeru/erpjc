<?php
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

// Headers
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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

try {
    $canFullRead = false;
    if ($method === 'GET') {
        try {
            rbac_ensure_roles_modulos_schema($conn);
            [, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
            $canFullRead = rbac_can($conn, (int)$rolId, (string)$rolNombre, 'colaboradores', 'lectura');
        } catch (Throwable $e) {
            $canFullRead = false;
        }
    } else {
        rbac_require($conn, $userData, 'colaboradores', $method);
    }

    switch ($method) {
        case 'GET':
            if ($canFullRead) {
                rbac_require($conn, $userData, 'colaboradores', $method);
            }

            // Pagination parameters
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = ($page - 1) * $limit;
            $search = isset($_GET['search']) ? $_GET['search'] : '';
            $area = isset($_GET['area']) ? $_GET['area'] : '';
            $status = isset($_GET['status']) ? $_GET['status'] : '';

            // Search Condition
            $whereSQL = "WHERE 1=1";
            $params = [];
            
            // Handle unique areas request
            if (isset($_GET['action']) && $_GET['action'] === 'areas') {
                $query = "SELECT DISTINCT area FROM colaboradores WHERE area IS NOT NULL AND area != '' ORDER BY area";
                $stmt = $conn->prepare($query);
                $stmt->execute();
                $areas = $stmt->fetchAll(PDO::FETCH_COLUMN);
                echo json_encode(["success" => true, "data" => $areas]);
                exit;
            }

            // Handle simple list for regularization (no joins, colaboradores activos o sin estado definido)
            if (isset($_GET['action']) && $_GET['action'] === 'simple_list') {
                $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 5000;
                $date = isset($_GET['date']) && $_GET['date'] !== '' ? $_GET['date'] : null;

                $query = "SELECT c.id, c.nombres, c.apellidos, c.documento_numero, c.estado, c.turno_id
                          FROM colaboradores c
                          LEFT JOIN (
                              SELECT colaborador_id, MAX(fecha_cese) AS fecha_cese
                              FROM ceses
                              GROUP BY colaborador_id
                          ) ce ON ce.colaborador_id = c.id
                          WHERE (
                              c.estado IS NULL OR c.estado = '' OR LOWER(c.estado) = 'activo'
                              OR (
                                  :date IS NOT NULL
                                  AND LOWER(c.estado) = 'cesado'
                                  AND ce.fecha_cese >= :date
                              )
                          )
                          ORDER BY c.apellidos, c.nombres
                          LIMIT :limit";
                $stmt = $conn->prepare($query);
                $stmt->bindValue(':date', $date, $date === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->execute();
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(["success" => true, "data" => $data]);
                exit;
            }

            if (isset($_GET['export']) && $_GET['export'] === 'true') {
                if (!$canFullRead) {
                    http_response_code(403);
                    echo json_encode([
                        "message" => "No tienes permiso para esta acción",
                        "forbidden" => true,
                        "modulo" => "colaboradores",
                        "permiso" => "lectura"
                    ]);
                    exit;
                }
                handleExport($conn);
                exit;
            }

            if (!empty($search)) {
                $whereSQL .= " AND (c.nombres LIKE :search OR c.apellidos LIKE :search OR c.documento_numero LIKE :search)";
                $params[':search'] = "%$search%";
            }

            if (!empty($area)) {
                $whereSQL .= " AND c.area = :area";
                $params[':area'] = $area;
            }

            if (!empty($status)) {
                $whereSQL .= " AND c.estado = :status";
                $params[':status'] = $status;
            }

            // 1. Get total count
            $countQuery = "SELECT COUNT(*) as total FROM colaboradores c $whereSQL";
            $countStmt = $conn->prepare($countQuery);
            $countStmt->execute($params);
            $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];
            $totalPages = ceil($total / $limit);

            if ($canFullRead) {
                $query = "SELECT c.*, u.usuario as usuario_linked, u.id as usuario_id, u.rol_id 
                          FROM colaboradores c 
                          LEFT JOIN usuarios u ON c.usuario_id = u.id 
                          $whereSQL 
                          ORDER BY c.apellidos, c.nombres 
                          LIMIT :limit OFFSET :offset";
            } else {
                $query = "SELECT c.id, c.nombres, c.apellidos, c.documento_numero, c.estado, c.area, c.cargo
                          FROM colaboradores c
                          $whereSQL
                          ORDER BY c.apellidos, c.nombres
                          LIMIT :limit OFFSET :offset";
            }
            $stmt = $conn->prepare($query);
            
            foreach ($params as $key => $val) {
                $stmt->bindValue($key, $val);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                "data" => $data,
                "pagination" => [
                    "total" => $total,
                    "page" => $page,
                    "limit" => $limit,
                    "totalPages" => $totalPages
                ]
            ]);
            break;

        case 'POST':
            if (isset($_GET['import']) && $_GET['import'] === 'true') {
                handleImport($conn);
                break;
            }

            if (isset($_GET['action']) && $_GET['action'] === 'create_user') {
                $data = json_decode(file_get_contents("php://input"));
                
                if (empty($data->id)) {
                    http_response_code(400);
                    echo json_encode(["message" => "ID de colaborador requerido"]);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                $stmtCol = $conn->prepare("SELECT * FROM colaboradores WHERE id = ?");
                $stmtCol->execute([$data->id]);
                $colab = $stmtCol->fetch(PDO::FETCH_ASSOC);

                if (!$colab) {
                    http_response_code(404);
                    echo json_encode(["message" => "Colaborador no encontrado"]);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                if (!empty($colab['usuario_id'])) {
                    echo json_encode(["success" => true, "message" => "El colaborador ya tiene usuario vinculado."]);
                    break;
                }

                if (empty($colab['email'])) {
                    http_response_code(400);
                    echo json_encode(["message" => "El colaborador no tiene email registrado. Edite el registro y agregue un email."]);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                $rol_id = isset($data->rol_id) ? (int)$data->rol_id : 4;

                $checkUser = $conn->prepare("SELECT id FROM usuarios WHERE email = ?");
                $checkUser->execute([$colab['email']]);
                $existingUser = $checkUser->fetch(PDO::FETCH_ASSOC);

                $user_id = null;
                if ($existingUser) {
                    $user_id = $existingUser['id'];
                } else {
                    $passwordHash = password_hash($colab['documento_numero'], PASSWORD_DEFAULT);
                    $username = $colab['email'];

                    $createUser = $conn->prepare("INSERT INTO usuarios (usuario, email, password, rol_id, status, created_at) VALUES (?, ?, ?, ?, 'activo', NOW())");
                    $createUser->execute([$username, $colab['email'], $passwordHash, $rol_id]);
                    $user_id = $conn->lastInsertId();
                }

                if ($user_id) {
                    $updateColab = $conn->prepare("UPDATE colaboradores SET usuario_id = ? WHERE id = ?");
                    $updateColab->execute([$user_id, $colab['id']]);
                }

                echo json_encode([
                    "success" => true,
                    "message" => "Usuario creado y vinculado correctamente.",
                    "usuario_id" => $user_id
                ]);
                break;
            }

            $data = json_decode(file_get_contents("php://input"));
            
            if (empty($data->nombres) || empty($data->apellidos) || empty($data->documento_numero)) {
                http_response_code(400);
                echo json_encode(["message" => "Datos requeridos faltantes."]);
                exit;
            }

            // Check Duplicate Document
            $check = $conn->prepare("SELECT id FROM colaboradores WHERE documento_numero = ?");
            $check->execute([$data->documento_numero]);
            if ($check->fetch()) {
                http_response_code(400);
                echo json_encode(["message" => "El número de documento ya existe."]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $sql = "INSERT INTO colaboradores (
                nombres, apellidos, fecha_nacimiento, documento_tipo, documento_numero, direccion, telefono, email, estado_civil,
                cargo, area, turno_id, fecha_ingreso, tipo_contrato, regimen_laboral, estado, asignacion_familiar
            ) VALUES (
                :nombres, :apellidos, :fecha_nacimiento, :documento_tipo, :documento_numero, :direccion, :telefono, :email, :estado_civil,
                :cargo, :area, :turno_id, :fecha_ingreso, :tipo_contrato, :regimen_laboral, :estado, :asignacion_familiar
            )";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':nombres' => $data->nombres,
                ':apellidos' => $data->apellidos,
                ':fecha_nacimiento' => !empty($data->fecha_nacimiento) ? $data->fecha_nacimiento : null,
                ':documento_tipo' => $data->documento_tipo ?? 'DNI',
                ':documento_numero' => $data->documento_numero,
                ':direccion' => $data->direccion ?? '',
                ':telefono' => $data->telefono ?? '',
                ':email' => $data->email ?? '',
                ':estado_civil' => $data->estado_civil ?? 'Soltero',
                ':cargo' => $data->cargo ?? '',
                ':area' => $data->area ?? '',
                ':turno_id' => !empty($data->turno_id) ? $data->turno_id : null,
                ':fecha_ingreso' => !empty($data->fecha_ingreso) ? $data->fecha_ingreso : null,
                ':tipo_contrato' => $data->tipo_contrato ?? '',
                ':regimen_laboral' => $data->regimen_laboral ?? '',
                ':estado' => $data->estado ?? 'Activo',
                ':asignacion_familiar' => !empty($data->asignacion_familiar) ? 1 : 0
            ]);

            $colab_id = $conn->lastInsertId();

            // Link or Create User
            if (!empty($data->email)) {
                $user_id = null;
                // Check if user exists by email
                $checkUser = $conn->prepare("SELECT id FROM usuarios WHERE email = ?");
                $checkUser->execute([$data->email]);
                $existingUser = $checkUser->fetch(PDO::FETCH_ASSOC);

                if ($existingUser) {
                    $user_id = $existingUser['id'];
                } else {
                    // Create new user
                    // Default password is the document number
                    $password = password_hash($data->documento_numero, PASSWORD_DEFAULT);
                    // Use email as username
                    $username = $data->email;
                    // Use provided role or default to 4 (Colaborador)
                    $rol_id = $data->rol_id ?? 4;
                    
                    try {
                        $createUser = $conn->prepare("INSERT INTO usuarios (usuario, email, password, rol_id, status, created_at) VALUES (?, ?, ?, ?, 'activo', NOW())");
                        $createUser->execute([$username, $data->email, $password, $rol_id]);
                        $user_id = $conn->lastInsertId();
                    } catch (Exception $e) {
                        // If user creation fails (e.g. username taken but email not?), log it but don't fail the whole request
                        // For now we just ignore linking if it fails
                    }
                }

                if ($user_id) {
                    $updateColab = $conn->prepare("UPDATE colaboradores SET usuario_id = ? WHERE id = ?");
                    $updateColab->execute([$user_id, $colab_id]);
                }
            }

            echo json_encode([
                "message" => "Colaborador registrado correctamente.",
                "id" => $colab_id
            ]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"));
            
            if (empty($data->id)) {
                http_response_code(400);
                echo json_encode(["message" => "ID requerido."]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $sql = "UPDATE colaboradores SET 
                nombres = :nombres,
                apellidos = :apellidos,
                fecha_nacimiento = :fecha_nacimiento,
                documento_tipo = :documento_tipo,
                documento_numero = :documento_numero,
                direccion = :direccion,
                telefono = :telefono,
                email = :email,
                estado_civil = :estado_civil,
                cargo = :cargo,
                area = :area,
                turno_id = :turno_id,
                fecha_ingreso = :fecha_ingreso,
                tipo_contrato = :tipo_contrato,
                regimen_laboral = :regimen_laboral,
                estado = :estado,
                asignacion_familiar = :asignacion_familiar
                WHERE id = :id";
            
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':nombres' => $data->nombres,
                ':apellidos' => $data->apellidos,
                ':fecha_nacimiento' => !empty($data->fecha_nacimiento) ? $data->fecha_nacimiento : null,
                ':documento_tipo' => $data->documento_tipo,
                ':documento_numero' => $data->documento_numero,
                ':direccion' => $data->direccion,
                ':telefono' => $data->telefono,
                ':email' => $data->email,
                ':estado_civil' => $data->estado_civil,
                ':cargo' => $data->cargo,
                ':area' => $data->area,
                ':turno_id' => !empty($data->turno_id) ? $data->turno_id : null,
                ':fecha_ingreso' => !empty($data->fecha_ingreso) ? $data->fecha_ingreso : null,
                ':tipo_contrato' => $data->tipo_contrato,
                ':regimen_laboral' => $data->regimen_laboral,
                ':estado' => $data->estado,
                ':asignacion_familiar' => !empty($data->asignacion_familiar) ? 1 : 0,
                ':id' => $data->id
            ]);

            // Update linked user role if provided
            if (!empty($data->rol_id)) {
                // First get the user_id linked to this colaborador if not provided in payload
                $userId = $data->usuario_id ?? null;
                
                if (!$userId) {
                    $getUserStmt = $conn->prepare("SELECT usuario_id FROM colaboradores WHERE id = ?");
                    $getUserStmt->execute([$data->id]);
                    $row = $getUserStmt->fetch(PDO::FETCH_ASSOC);
                    $userId = $row['usuario_id'] ?? null;
                }
                
                if ($userId) {
                    $updateUserStmt = $conn->prepare("UPDATE usuarios SET rol_id = ? WHERE id = ?");
                    $updateUserStmt->execute([$data->rol_id, $userId]);
                }
            }

            echo json_encode(["message" => "Colaborador actualizado."]);
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(["message" => "ID requerido."]);
                $conn = null;
                exit;
            }

            $stmt = $conn->prepare("DELETE FROM colaboradores WHERE id = ?");
            $stmt->execute([$id]);

            echo json_encode(["message" => "Colaborador eliminado."]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}

if (isset($conn)) $conn = null;

function handleExport($conn) {
    $sql = "SELECT c.*, u.usuario as usuario_linked 
            FROM colaboradores c 
            LEFT JOIN usuarios u ON c.usuario_id = u.id 
            ORDER BY c.apellidos, c.nombres";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(["data" => $data]);
}

function handleImport($conn) {
    $data = json_decode(file_get_contents("php://input"));
    $count = 0;
    $errors = 0;
    $updated = 0;

    foreach ($data as $row) {
        try {
            // Check if exists by DNI
            $stmt = $conn->prepare("SELECT id FROM colaboradores WHERE documento_numero = ?");
            $stmt->execute([$row->documento_numero]);
            $exists = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($exists) {
                // Update basic info
                $updateSql = "UPDATE colaboradores SET 
                    nombres = :nombres,
                    apellidos = :apellidos,
                    area = :area,
                    cargo = :cargo,
                    email = :email,
                    telefono = :telefono,
                    fecha_ingreso = :fi,
                    estado = :estado
                    WHERE id = :id";
                
                $updateStmt = $conn->prepare($updateSql);
                $updateStmt->execute([
                    ':nombres' => $row->nombres,
                    ':apellidos' => $row->apellidos,
                    ':area' => $row->area ?? '',
                    ':cargo' => $row->cargo ?? '',
                    ':email' => $row->email ?? '',
                    ':telefono' => $row->telefono ?? '',
                    ':fi' => !empty($row->fecha_ingreso) ? $row->fecha_ingreso : null,
                    ':estado' => $row->estado ?? 'Activo',
                    ':id' => $exists['id']
                ]);
                $updated++;
            } else {
                // Insert
                $insertSql = "INSERT INTO colaboradores (
                    nombres, apellidos, documento_tipo, documento_numero, 
                    area, cargo, email, telefono, fecha_ingreso, estado, fecha_nacimiento
                ) VALUES (
                    :nombres, :apellidos, :dtype, :dnum, 
                    :area, :cargo, :email, :tel, :fi, :estado, :fn
                )";
                
                $insertStmt = $conn->prepare($insertSql);
                $insertStmt->execute([
                    ':nombres' => $row->nombres,
                    ':apellidos' => $row->apellidos,
                    ':dtype' => $row->documento_tipo ?? 'DNI',
                    ':dnum' => $row->documento_numero,
                    ':area' => $row->area ?? '',
                    ':cargo' => $row->cargo ?? '',
                    ':email' => $row->email ?? '',
                    ':tel' => $row->telefono ?? '',
                    ':fi' => !empty($row->fecha_ingreso) ? $row->fecha_ingreso : null,
                    ':estado' => $row->estado ?? 'Activo',
                    ':fn' => !empty($row->fecha_nacimiento) ? $row->fecha_nacimiento : null
                ]);
                $count++;
            }
        } catch (Exception $e) {
            $errors++;
        }
    }

    echo json_encode([
        "message" => "Importación finalizada",
        "created" => $count,
        "updated" => $updated,
        "errors" => $errors
    ]);
}
?>
