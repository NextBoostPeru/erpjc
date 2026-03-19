<?php
include_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user = $jwt->validateToken($token);

if (!$user) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

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

rbac_ensure_roles_modulos_schema($conn);

try {
    $rolId = isset($user->rol_id) ? (int)$user->rol_id : 0;
    $modulos = [];
    if ($rolId <= 0 && isset($user->id)) {
        try {
            $stmt = $conn->prepare("SELECT rol_id FROM usuarios WHERE id = ? LIMIT 1");
            $stmt->execute([(int)$user->id]);
            $rolId = (int)($stmt->fetchColumn() ?: 0);
        } catch (Throwable $e) {
        }
    }
    if ($rolId > 0) {
        $sql = "
            SELECT 
                m.codigo,
                MIN(m.nombre) as nombre,
                MIN(m.ruta) as ruta,
                MIN(m.icono) as icono,
                MAX(COALESCE(rm.permiso_lectura, 0)) as permiso_lectura,
                MAX(COALESCE(rm.permiso_crear, 0)) as permiso_crear,
                MAX(COALESCE(rm.permiso_editar, 0)) as permiso_editar,
                MAX(COALESCE(rm.permiso_escritura, 0)) as permiso_escritura,
                MAX(COALESCE(rm.permiso_eliminacion, 0)) as permiso_eliminacion
            FROM roles_modulos rm
            JOIN modulos m ON rm.modulo_id = m.id
            WHERE rm.rol_id = :rol_id
            GROUP BY m.codigo
            HAVING MAX(COALESCE(rm.permiso_lectura, 0)) = 1
            ORDER BY nombre
        ";
        $stmt = $conn->prepare($sql);
        $stmt->bindParam(':rol_id', $rolId, PDO::PARAM_INT);
        $stmt->execute();
        $modulos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    echo json_encode($modulos);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}
if (isset($conn)) $conn = null;
