<?php
include_once __DIR__ . '/../config/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/../config/jwt.php';

// Disable display_errors in production to prevent HTML output breaking JSON
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

function handle_fatal_error() {
    $error = error_get_last();
    if ($error && ($error['type'] === E_ERROR || $error['type'] === E_PARSE || $error['type'] === E_COMPILE_ERROR)) {
        http_response_code(500);
        echo json_encode(["message" => "Critical Server Error: " . $error['message']]);
        exit;
    }
}
register_shutdown_function('handle_fatal_error');

function rbac_column_exists(PDO $conn, string $table, string $column): bool {
    $stmt = $conn->prepare("
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :t
          AND COLUMN_NAME = :c
        LIMIT 1
    ");
    $stmt->execute([':t' => $table, ':c' => $column]);
    return (bool)$stmt->fetchColumn();
}

function rbac_ensure_roles_modulos_schema(PDO $conn): void {
    try {
        if (!rbac_column_exists($conn, 'roles_modulos', 'permiso_crear')) {
            $conn->exec("ALTER TABLE roles_modulos ADD COLUMN permiso_crear TINYINT(1) NOT NULL DEFAULT 0");
            try { $conn->exec("UPDATE roles_modulos SET permiso_crear = COALESCE(permiso_escritura, 0)"); } catch (Throwable $e) {}
        }
        if (!rbac_column_exists($conn, 'roles_modulos', 'permiso_editar')) {
            $conn->exec("ALTER TABLE roles_modulos ADD COLUMN permiso_editar TINYINT(1) NOT NULL DEFAULT 0");
            try { $conn->exec("UPDATE roles_modulos SET permiso_editar = COALESCE(permiso_escritura, 0)"); } catch (Throwable $e) {}
        }
    } catch (Throwable $e) {
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["message" => "Method not allowed"]);
    if (isset($conn)) $conn = null;
    exit;
}

$raw_input = file_get_contents("php://input");
$data = json_decode($raw_input);

// Si php://input ya fue consumido por security.php, intentamos usar la variable global
if (empty($data) && isset($SECURE_JSON)) {
    $data = (object)$SECURE_JSON;
}

try {
    if ($data && !empty($data->usuario) && !empty($data->password)) {
        $usuario = $data->usuario;
        $password = $data->password;

        $query = "SELECT u.id, u.usuario, u.password, u.status, u.email, u.area, u.rol_id, r.nombre as rol_nombre 
                  FROM usuarios u 
                  LEFT JOIN roles r ON u.rol_id = r.id 
                  WHERE u.usuario = :usuario OR u.email = :usuario LIMIT 1";
        
        $stmt = $conn->prepare($query);
        $stmt->bindParam(":usuario", $usuario);
        $stmt->execute();

        if ($stmt->rowCount() > 0) {
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (password_verify($password, $row['password'])) {
                if ($row['status'] !== 'activo') {
                    error_log("Login failed: User inactive - " . $usuario);
                    http_response_code(401);
                    echo json_encode(["message" => "Usuario inactivo o bloqueado."]);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                // Actualizar ultimo acceso
                $update_query = "UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = :id";
                $update_stmt = $conn->prepare($update_query);
                $update_stmt->bindParam(":id", $row['id']);
                $update_stmt->execute();

                // Registrar en historial_accesos (JSON Log)
                require_once __DIR__ . '/../config/AuditLogger.php';
                try {
                    $ip = $_SERVER['REMOTE_ADDR'] ?? 'UNKNOWN';
                    AuditLogger::logAccess($row['id'], 'LOGIN', $ip, 'Acceso exitoso');
                } catch (Exception $e) {
                    // Silently fail logging to not block login
                    error_log("Audit Log Error: " . $e->getMessage());
                }

                $modulos = [];
                if (!empty($row['rol_id'])) {
                    rbac_ensure_roles_modulos_schema($conn);
                    $permisos_query = "
                        SELECT m.codigo, m.nombre, m.ruta, m.icono, 
                               rm.permiso_lectura, rm.permiso_crear, rm.permiso_editar, rm.permiso_escritura, rm.permiso_eliminacion
                        FROM roles_modulos rm
                        JOIN modulos m ON rm.modulo_id = m.id
                        WHERE rm.rol_id = :rol_id AND rm.permiso_lectura = 1
                    ";
                    $permisos_stmt = $conn->prepare($permisos_query);
                    $permisos_stmt->bindParam(":rol_id", $row['rol_id']);
                    $permisos_stmt->execute();
                    $modulos = $permisos_stmt->fetchAll(PDO::FETCH_ASSOC);
                }
                if (empty($modulos) && !empty($row['rol_nombre'])) {
                    rbac_ensure_roles_modulos_schema($conn);
                    $fallback_query = "
                        SELECT m.codigo, m.nombre, m.ruta, m.icono,
                               rm.permiso_lectura, rm.permiso_crear, rm.permiso_editar, rm.permiso_escritura, rm.permiso_eliminacion
                        FROM roles_modulos rm
                        JOIN modulos m ON rm.modulo_id = m.id
                        JOIN roles r ON rm.rol_id = r.id
                        WHERE LOWER(r.nombre) = LOWER(:rol_nombre) AND rm.permiso_lectura = 1
                    ";
                    $fb_stmt = $conn->prepare($fallback_query);
                    $fb_stmt->bindParam(":rol_nombre", $row['rol_nombre']);
                    $fb_stmt->execute();
                    $modulos = $fb_stmt->fetchAll(PDO::FETCH_ASSOC);
                }

                // Generar JWT Real
                $jwtHandler = new JWTHandler();
                $tokenData = [
                    'id' => $row['id'],
                    'usuario' => $row['usuario'],
                    'rol' => $row['rol_nombre'], // Agregar nombre del rol al token
                    'area' => $row['area']
                ];
                $jwt = $jwtHandler->generateToken($tokenData);

                // Limpiar datos sensibles
                unset($row['password']);

                http_response_code(200);
                echo json_encode([
                    "message" => "Login exitoso",
                    "token" => $jwt,
                    "user" => $row,
                    "modulos" => $modulos
                ]);
            } else {
                http_response_code(401);
                echo json_encode(["message" => "Contraseña incorrecta."]);
            }
        } else {
            http_response_code(401);
            echo json_encode(["message" => "Usuario no encontrado."]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["message" => "Datos incompletos."]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error interno del servidor: " . $e->getMessage()]);
}

$conn = null;
?>
