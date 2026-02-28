<?php
include_once __DIR__ . '/../config/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/../config/jwt.php';

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

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->usuario) && !empty($data->password)) {
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
                $permisos_query = "
                    SELECT m.codigo, m.nombre, m.ruta, m.icono, 
                           rm.permiso_lectura, rm.permiso_escritura, rm.permiso_eliminacion
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
                $fallback_query = "
                    SELECT m.codigo, m.nombre, m.ruta, m.icono,
                           rm.permiso_lectura, rm.permiso_escritura, rm.permiso_eliminacion
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
                'rol_id' => $row['rol_id'],
                'rol_nombre' => $row['rol_nombre'],
                'area' => $row['area']
            ];
            $jwt = $jwtHandler->generateToken($tokenData);

            // Limpiar datos sensibles
            unset($row['password']);
            
            http_response_code(200);
            echo json_encode([
                "message" => "Login exitoso",
                "user" => $row,
                "modulos" => $modulos,
                "token" => $jwt // Token JWT Real
            ]);
        } else {
            error_log("Login failed: Invalid password for user " . $usuario);
            http_response_code(401);
            echo json_encode(["message" => "Credenciales incorrectas."]);
        }
    } else {
        error_log("Login failed: User not found - " . $usuario);
        http_response_code(401);
        echo json_encode(["message" => "Credenciales incorrectas."]);
    }
} else {
    http_response_code(400);
    echo json_encode(["message" => "Datos incompletos."]);
}

$conn = null;
?>
