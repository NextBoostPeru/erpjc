<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/rbac.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (isset($conn)) $conn = null;
    exit;
}

if (!isset($conn)) {
    http_response_code(500);
    echo json_encode(["message" => "Error de conexión a base de datos"]);
    exit;
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$action = isset($_GET['action']) ? strtolower(trim((string)$_GET['action'])) : '';

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);
if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

function ga4_get_setting(PDO $conn, string $key, string $default = ''): string {
    try {
        $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1");
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        return $val !== false ? (string)$val : $default;
    } catch (Throwable $e) {
        return $default;
    }
}

function ga4_set_setting(PDO $conn, string $key, string $value): void {
    $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    $stmt->execute([$key, $value]);
}

function ga4_read_json_body(): array {
    $raw = file_get_contents("php://input");
    if (!is_string($raw) || trim($raw) === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function ga4_base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function ga4_is_admin_or_manager(PDO $conn, $userData): bool {
    [, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
    return rbac_is_admin_or_manager((int)$rolId, (string)$rolNombre);
}

function ga4_ensure_module_seed(PDO $conn): int {
    $codigo = 'ga4_analytics';
    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ? LIMIT 1");
    $stmt->execute([$codigo]);
    $id = (int)($stmt->fetchColumn() ?: 0);
    if ($id > 0) return $id;

    $nombre = 'Analítica Web (GA4)';
    $ruta = '/ga4-analytics';
    $icono = 'BarChart3';
    $descripcion = 'Implementación Google Analytics 4';

    try {
        $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta, icono, descripcion) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$nombre, $codigo, $ruta, $icono, $descripcion]);
    } catch (Throwable $e1) {
        try {
            $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta, icono) VALUES (?, ?, ?, ?)");
            $stmt->execute([$nombre, $codigo, $ruta, $icono]);
        } catch (Throwable $e2) {
            $stmt = $conn->prepare("INSERT INTO modulos (nombre, codigo, ruta) VALUES (?, ?, ?)");
            $stmt->execute([$nombre, $codigo, $ruta]);
        }
    }

    $stmt = $conn->prepare("SELECT id FROM modulos WHERE codigo = ? LIMIT 1");
    $stmt->execute([$codigo]);
    return (int)($stmt->fetchColumn() ?: 0);
}

function ga4_ensure_admin_assignment(PDO $conn, int $rolId, string $rolNombre, int $moduloId): void {
    if ($moduloId <= 0) return;
    if (!rbac_is_admin_or_manager($rolId, $rolNombre)) return;

    try {
        $stmt = $conn->prepare("SELECT 1 FROM roles_modulos WHERE rol_id = ? AND modulo_id = ? LIMIT 1");
        $stmt->execute([$rolId, $moduloId]);
        if ($stmt->fetchColumn()) return;
    } catch (Throwable $e) {
        return;
    }

    try {
        $stmt = $conn->prepare("
            INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_crear, permiso_editar, permiso_escritura, permiso_eliminacion)
            VALUES (?, ?, 1, 1, 1, 1, 0)
        ");
        $stmt->execute([$rolId, $moduloId]);
    } catch (Throwable $e) {
        try {
            $stmt = $conn->prepare("
                INSERT INTO roles_modulos (rol_id, modulo_id, permiso_lectura, permiso_escritura, permiso_eliminacion)
                VALUES (?, ?, 1, 1, 0)
            ");
            $stmt->execute([$rolId, $moduloId]);
        } catch (Throwable $e2) {
        }
    }
}

function ga4_storage_dir(): string {
    return __DIR__ . '/../storage/ga4';
}

function ga4_cache_dir(): string {
    return ga4_storage_dir() . '/cache';
}

function ga4_ensure_sites_schema(PDO $conn): void {
    $conn->exec("
        CREATE TABLE IF NOT EXISTS analytics_sites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(190) NOT NULL,
            dominio VARCHAR(255) NULL,
            ga4_property_id VARCHAR(32) NULL,
            measurement_id VARCHAR(64) NULL,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS analytics_credentials (
            site_id INT PRIMARY KEY,
            file_path VARCHAR(500) NOT NULL,
            client_email VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_analytics_credentials_site
                FOREIGN KEY (site_id) REFERENCES analytics_sites(id)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

function ga4_site_credentials_relpath(int $siteId): string {
    return 'storage/ga4/site_' . $siteId . '.json';
}

function ga4_site_credentials_abspath(int $siteId): string {
    return ga4_storage_dir() . '/site_' . $siteId . '.json';
}

function ga4_site_credentials_info(PDO $conn, int $siteId): array {
    try {
        $stmt = $conn->prepare("SELECT file_path, client_email FROM analytics_credentials WHERE site_id = ? LIMIT 1");
        $stmt->execute([$siteId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return ['hasCredentials' => false];
        return [
            'hasCredentials' => true,
            'clientEmail' => (string)($row['client_email'] ?? ''),
            'filePath' => (string)($row['file_path'] ?? '')
        ];
    } catch (Throwable $e) {
        return ['hasCredentials' => false];
    }
}

function ga4_seed_default_site_from_legacy(PDO $conn, string $propertyId, string $measurementId, string $credentialsRaw): void {
    try {
        $stmt = $conn->query("SELECT COUNT(*) FROM analytics_sites");
        $count = (int)$stmt->fetchColumn();
        if ($count > 0) return;

        $stmt = $conn->prepare("INSERT INTO analytics_sites (nombre, dominio, ga4_property_id, measurement_id, activo) VALUES (?, ?, ?, ?, 1)");
        $stmt->execute(['Web Externa', null, ($propertyId !== '' ? $propertyId : null), ($measurementId !== '' ? $measurementId : null)]);
        $siteId = (int)$conn->lastInsertId();
        if ($siteId <= 0) return;

        if (trim($credentialsRaw) === '') return;
        $json = json_decode($credentialsRaw, true);
        if (!is_array($json)) return;
        $sa = ga4_extract_service_account($json);
        if (empty($sa['ok'])) return;

        $dir = ga4_storage_dir();
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $abs = ga4_site_credentials_abspath($siteId);
        @file_put_contents($abs, json_encode($json, JSON_UNESCAPED_UNICODE));

        $stmt = $conn->prepare("INSERT INTO analytics_credentials (site_id, file_path, client_email) VALUES (?, ?, ?)");
        $stmt->execute([$siteId, ga4_site_credentials_relpath($siteId), (string)$sa['client_email']]);
    } catch (Throwable $e) {
        return;
    }
}

function ga4_get_site(PDO $conn, int $siteId): ?array {
    $stmt = $conn->prepare("SELECT * FROM analytics_sites WHERE id = ? LIMIT 1");
    $stmt->execute([$siteId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function ga4_get_default_site(PDO $conn): ?array {
    $stmt = $conn->query("SELECT * FROM analytics_sites WHERE activo = 1 ORDER BY id ASC LIMIT 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function ga4_cache_key_to_path(string $key): string {
    $safe = preg_replace('/[^A-Za-z0-9_.-]+/', '_', $key);
    return ga4_cache_dir() . '/' . $safe . '.json';
}

function ga4_cache_get(string $key, int $ttlSeconds): ?array {
    $path = ga4_cache_key_to_path($key);
    if (!file_exists($path)) return null;
    $raw = @file_get_contents($path);
    if (!is_string($raw) || trim($raw) === '') return null;
    $json = json_decode($raw, true);
    if (!is_array($json)) return null;
    $ts = (int)($json['ts'] ?? 0);
    if ($ts <= 0) return null;
    if (time() - $ts > $ttlSeconds) return null;
    $data = $json['data'] ?? null;
    return is_array($data) ? $data : null;
}

function ga4_cache_put(string $key, array $data): void {
    $dir = ga4_cache_dir();
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $path = ga4_cache_key_to_path($key);
    @file_put_contents($path, json_encode(['ts' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE));
}

function ga4_extract_hostname(string $dominio): string {
    $dominio = trim($dominio);
    if ($dominio === '') return '';
    $u = $dominio;
    if (!preg_match('/^https?:\/\//i', $u)) {
        $u = 'https://' . $u;
    }
    $host = (string)(parse_url($u, PHP_URL_HOST) ?? '');
    return trim($host);
}

function ga4_dimension_filter_exact(string $fieldName, string $value): array {
    return [
        'filter' => [
            'fieldName' => $fieldName,
            'stringFilter' => [
                'matchType' => 'EXACT',
                'value' => $value
            ]
        ]
    ];
}

function ga4_extract_service_account(array $json): array {
    $type = isset($json['type']) ? (string)$json['type'] : '';
    $clientEmail = isset($json['client_email']) ? (string)$json['client_email'] : '';
    $privateKey = isset($json['private_key']) ? (string)$json['private_key'] : '';
    $tokenUri = isset($json['token_uri']) ? (string)$json['token_uri'] : 'https://oauth2.googleapis.com/token';
    $privateKeyId = isset($json['private_key_id']) ? (string)$json['private_key_id'] : '';

    if ($type !== 'service_account' || $clientEmail === '' || $privateKey === '') {
        return ['ok' => false, 'message' => 'JSON de Service Account inválido'];
    }
    if (!str_contains($privateKey, 'BEGIN PRIVATE KEY')) {
        return ['ok' => false, 'message' => 'private_key inválido en el JSON'];
    }

    return [
        'ok' => true,
        'client_email' => $clientEmail,
        'private_key' => $privateKey,
        'token_uri' => $tokenUri ?: 'https://oauth2.googleapis.com/token',
        'private_key_id' => $privateKeyId
    ];
}

function ga4_get_oauth_token(array $serviceAccount): array {
    $now = time();
    $header = ['alg' => 'RS256', 'typ' => 'JWT'];
    $claims = [
        'iss' => $serviceAccount['client_email'],
        'scope' => 'https://www.googleapis.com/auth/analytics.readonly',
        'aud' => $serviceAccount['token_uri'],
        'iat' => $now,
        'exp' => $now + 3600
    ];

    $jwtHeader = ga4_base64url_encode(json_encode($header));
    $jwtClaims = ga4_base64url_encode(json_encode($claims));
    $unsigned = $jwtHeader . '.' . $jwtClaims;

    $signature = '';
    $ok = openssl_sign($unsigned, $signature, $serviceAccount['private_key'], OPENSSL_ALGO_SHA256);
    if (!$ok) {
        return ['ok' => false, 'message' => 'No se pudo firmar JWT (openssl_sign)'];
    }
    $assertion = $unsigned . '.' . ga4_base64url_encode($signature);

    $post = http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $assertion
    ]);

    if (!function_exists('curl_init')) {
        return ['ok' => false, 'message' => 'cURL no disponible en el servidor'];
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $serviceAccount['token_uri']);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    $res = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if (!is_string($res) || $res === '') {
        return ['ok' => false, 'message' => 'Error consultando token OAuth', 'detail' => $err];
    }

    $payload = json_decode($res, true);
    if ($http !== 200 || !is_array($payload) || empty($payload['access_token'])) {
        return ['ok' => false, 'message' => 'No se pudo obtener access_token', 'http' => $http, 'response' => $payload];
    }

    return ['ok' => true, 'access_token' => (string)$payload['access_token'], 'expires_in' => (int)($payload['expires_in'] ?? 0)];
}

function ga4_run_report(string $propertyId, string $accessToken, array $body): array {
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'message' => 'cURL no disponible en el servidor'];
    }

    $url = "https://analyticsdata.googleapis.com/v1beta/properties/" . rawurlencode($propertyId) . ":runReport";
    $json = json_encode($body);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $accessToken
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    $res = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if (!is_string($res) || $res === '') {
        return ['ok' => false, 'message' => 'Error consultando GA4', 'detail' => $err];
    }

    $payload = json_decode($res, true);
    if ($http !== 200 || !is_array($payload)) {
        return ['ok' => false, 'message' => 'GA4 respondió con error', 'http' => $http, 'response' => $payload];
    }

    return ['ok' => true, 'data' => $payload];
}

function ga4_rows_to_table(array $ga4Response): array {
    $dims = [];
    $mets = [];
    if (!empty($ga4Response['dimensionHeaders']) && is_array($ga4Response['dimensionHeaders'])) {
        foreach ($ga4Response['dimensionHeaders'] as $h) {
            $dims[] = (string)($h['name'] ?? '');
        }
    }
    if (!empty($ga4Response['metricHeaders']) && is_array($ga4Response['metricHeaders'])) {
        foreach ($ga4Response['metricHeaders'] as $h) {
            $mets[] = (string)($h['name'] ?? '');
        }
    }

    $rows = [];
    $rawRows = isset($ga4Response['rows']) && is_array($ga4Response['rows']) ? $ga4Response['rows'] : [];
    foreach ($rawRows as $r) {
        $row = [];
        $dvs = isset($r['dimensionValues']) && is_array($r['dimensionValues']) ? $r['dimensionValues'] : [];
        $mvs = isset($r['metricValues']) && is_array($r['metricValues']) ? $r['metricValues'] : [];
        foreach ($dims as $i => $name) {
            $row[$name] = (string)($dvs[$i]['value'] ?? '');
        }
        foreach ($mets as $i => $name) {
            $v = (string)($mvs[$i]['value'] ?? '0');
            $row[$name] = is_numeric($v) ? 0 + $v : $v;
        }
        $rows[] = $row;
    }
    return ['dimensions' => $dims, 'metrics' => $mets, 'rows' => $rows];
}

rbac_ensure_roles_modulos_schema($conn);
[$userId, $rolId, $rolNombre] = rbac_get_user_role($conn, $userData);
$moduloId = ga4_ensure_module_seed($conn);
ga4_ensure_admin_assignment($conn, (int)$rolId, (string)$rolNombre, (int)$moduloId);

$readActions = ['config', 'sites', 'dashboard', 'report', 'all', 'test'];
$writeActions = ['save_config', 'upload_credentials', 'delete_credentials', 'sites_create', 'sites_update', 'sites_delete'];

if (in_array($action, $writeActions, true)) {
    rbac_require($conn, $userData, 'ga4_analytics', $method, 'escritura');
} else {
    rbac_require($conn, $userData, 'ga4_analytics', $method, 'lectura');
}

$legacyPropertyId = trim(ga4_get_setting($conn, 'ga4_property_id', ''));
$legacyCredentialsRaw = ga4_get_setting($conn, 'ga4_service_account_json', '');
$legacyMeasurementId = trim(ga4_get_setting($conn, 'ga4_measurement_id', ''));

ga4_ensure_sites_schema($conn);
ga4_seed_default_site_from_legacy($conn, $legacyPropertyId, $legacyMeasurementId, $legacyCredentialsRaw);

$siteId = (int)($_GET['site_id'] ?? 0);
$site = null;
if ($siteId > 0) {
    $site = ga4_get_site($conn, $siteId);
}
if (!$site) {
    $site = ga4_get_default_site($conn);
}

$sitePropertyId = trim((string)($site['ga4_property_id'] ?? ''));
$siteMeasurementId = trim((string)($site['measurement_id'] ?? ''));
$siteDomain = trim((string)($site['dominio'] ?? ''));
$siteHostname = ga4_extract_hostname($siteDomain);
$siteCredentialsRaw = '';
$siteCredentialsInfo = ['hasCredentials' => false];
if ($site && !empty($site['id'])) {
    $sid = (int)$site['id'];
    $siteCredentialsInfo = ga4_site_credentials_info($conn, $sid);
    if (!empty($siteCredentialsInfo['hasCredentials'])) {
        $abs = ga4_site_credentials_abspath($sid);
        if (file_exists($abs)) {
            $siteCredentialsRaw = (string)file_get_contents($abs);
        }
    }
}

function ga4_get_credentials_info(string $credentialsRaw): array {
    if (trim($credentialsRaw) === '') return ['hasCredentials' => false];
    $json = json_decode($credentialsRaw, true);
    if (!is_array($json)) return ['hasCredentials' => false];
    $clientEmail = isset($json['client_email']) ? (string)$json['client_email'] : '';
    return ['hasCredentials' => true, 'clientEmail' => $clientEmail];
}

if ($method === 'GET' && $action === 'sites') {
    try {
        $stmt = $conn->query("SELECT id, nombre, dominio, ga4_property_id, measurement_id, activo FROM analytics_sites ORDER BY id ASC");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $sid = (int)($r['id'] ?? 0);
            $cred = $sid > 0 ? ga4_site_credentials_info($conn, $sid) : ['hasCredentials' => false];
            $out[] = [
                'id' => $sid,
                'nombre' => (string)($r['nombre'] ?? ''),
                'dominio' => (string)($r['dominio'] ?? ''),
                'propertyId' => (string)($r['ga4_property_id'] ?? ''),
                'measurementId' => (string)($r['measurement_id'] ?? ''),
                'activo' => (int)($r['activo'] ?? 0),
                'hasCredentials' => (bool)($cred['hasCredentials'] ?? false),
                'clientEmail' => (string)($cred['clientEmail'] ?? '')
            ];
        }
        echo json_encode(['success' => true, 'sites' => $out]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['message' => 'No se pudo listar sitios']);
    }
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'POST' && $action === 'sites_create') {
    if (!ga4_is_admin_or_manager($conn, $userData)) {
        http_response_code(403);
        echo json_encode(['message' => 'No autorizado']);
        if (isset($conn)) $conn = null;
        exit;
    }
    $data = ga4_read_json_body();
    $nombre = trim((string)($data['nombre'] ?? ''));
    $dominio = trim((string)($data['dominio'] ?? ''));
    $prop = trim((string)($data['propertyId'] ?? ''));
    $meas = trim((string)($data['measurementId'] ?? ''));
    if ($nombre === '') {
        http_response_code(400);
        echo json_encode(['message' => 'Nombre requerido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    if ($prop !== '' && !preg_match('/^[0-9]+$/', $prop)) {
        http_response_code(400);
        echo json_encode(['message' => 'propertyId inválido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    try {
        $stmt = $conn->prepare("INSERT INTO analytics_sites (nombre, dominio, ga4_property_id, measurement_id, activo) VALUES (?, ?, ?, ?, 1)");
        $stmt->execute([$nombre, ($dominio !== '' ? $dominio : null), ($prop !== '' ? $prop : null), ($meas !== '' ? $meas : null)]);
        echo json_encode(['success' => true, 'id' => (int)$conn->lastInsertId()]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['message' => 'No se pudo crear sitio']);
    }
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'POST' && $action === 'sites_update') {
    if (!ga4_is_admin_or_manager($conn, $userData)) {
        http_response_code(403);
        echo json_encode(['message' => 'No autorizado']);
        if (isset($conn)) $conn = null;
        exit;
    }
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['message' => 'ID inválido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    $data = ga4_read_json_body();
    $nombre = trim((string)($data['nombre'] ?? ''));
    $dominio = trim((string)($data['dominio'] ?? ''));
    $prop = trim((string)($data['propertyId'] ?? ''));
    $meas = trim((string)($data['measurementId'] ?? ''));
    $activo = isset($data['activo']) ? (int)$data['activo'] : 1;
    if ($nombre === '') {
        http_response_code(400);
        echo json_encode(['message' => 'Nombre requerido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    if ($prop !== '' && !preg_match('/^[0-9]+$/', $prop)) {
        http_response_code(400);
        echo json_encode(['message' => 'propertyId inválido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    try {
        $stmt = $conn->prepare("UPDATE analytics_sites SET nombre = ?, dominio = ?, ga4_property_id = ?, measurement_id = ?, activo = ? WHERE id = ?");
        $stmt->execute([$nombre, ($dominio !== '' ? $dominio : null), ($prop !== '' ? $prop : null), ($meas !== '' ? $meas : null), ($activo ? 1 : 0), $id]);
        echo json_encode(['success' => true]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['message' => 'No se pudo actualizar sitio']);
    }
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'DELETE' && $action === 'sites_delete') {
    if (!ga4_is_admin_or_manager($conn, $userData)) {
        http_response_code(403);
        echo json_encode(['message' => 'No autorizado']);
        if (isset($conn)) $conn = null;
        exit;
    }
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['message' => 'ID inválido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    try {
        $stmt = $conn->prepare("UPDATE analytics_sites SET activo = 0 WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['message' => 'No se pudo desactivar sitio']);
    }
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'GET' && $action === 'config') {
    if ($siteId > 0) {
        $info = $siteCredentialsInfo;
        echo json_encode([
            'siteId' => (int)($site['id'] ?? 0),
            'nombre' => (string)($site['nombre'] ?? ''),
            'dominio' => (string)($site['dominio'] ?? ''),
            'propertyId' => $sitePropertyId,
            'measurementId' => $siteMeasurementId,
            'hasCredentials' => (bool)($info['hasCredentials'] ?? false),
            'clientEmail' => (string)($info['clientEmail'] ?? '')
        ]);
        if (isset($conn)) $conn = null;
        exit;
    }

    $info = ga4_get_credentials_info($legacyCredentialsRaw);
    echo json_encode([
        'propertyId' => $legacyPropertyId,
        'measurementId' => $legacyMeasurementId,
        'hasCredentials' => (bool)($info['hasCredentials'] ?? false),
        'clientEmail' => (string)($info['clientEmail'] ?? '')
    ]);
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'POST' && $action === 'save_config') {
    $sid = (int)($_GET['site_id'] ?? 0);
    $data = ga4_read_json_body();
    $nombre = trim((string)($data['nombre'] ?? ''));
    $dominio = trim((string)($data['dominio'] ?? ''));
    $prop = isset($data['propertyId']) ? trim((string)$data['propertyId']) : '';
    $meas = isset($data['measurementId']) ? trim((string)$data['measurementId']) : '';
    if ($prop !== '' && !preg_match('/^[0-9]+$/', $prop)) {
        http_response_code(400);
        echo json_encode(['message' => 'propertyId inválido']);
        if (isset($conn)) $conn = null;
        exit;
    }
    if ($sid > 0) {
        try {
            $stmt = $conn->prepare("UPDATE analytics_sites SET nombre = COALESCE(NULLIF(?, ''), nombre), dominio = ?, ga4_property_id = ?, measurement_id = ? WHERE id = ?");
            $stmt->execute([
                $nombre,
                ($dominio !== '' ? $dominio : null),
                ($prop !== '' ? $prop : null),
                ($meas !== '' ? $meas : null),
                $sid
            ]);
            echo json_encode(['success' => true, 'message' => 'Configuración guardada']);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['message' => 'Error guardando configuración']);
        }
        if (isset($conn)) $conn = null;
        exit;
    }
    try {
        $conn->beginTransaction();
        ga4_set_setting($conn, 'ga4_property_id', $prop);
        ga4_set_setting($conn, 'ga4_measurement_id', $meas);
        $conn->commit();
        echo json_encode(['success' => true, 'message' => 'Configuración GA4 guardada']);
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        http_response_code(500);
        echo json_encode(['message' => 'Error guardando configuración GA4']);
    }
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'POST' && $action === 'upload_credentials') {
    $sid = (int)($_GET['site_id'] ?? 0);
    $jsonRaw = '';

    if (isset($_FILES['service_account']) && isset($_FILES['service_account']['tmp_name'])) {
        $tmp = (string)$_FILES['service_account']['tmp_name'];
        if ($tmp !== '' && file_exists($tmp)) {
            $jsonRaw = (string)file_get_contents($tmp);
        }
    } else {
        $data = ga4_read_json_body();
        if (isset($data['serviceAccountJson'])) $jsonRaw = (string)$data['serviceAccountJson'];
    }

    $json = json_decode($jsonRaw, true);
    if (!is_array($json)) {
        http_response_code(400);
        echo json_encode(['message' => 'JSON inválido']);
        if (isset($conn)) $conn = null;
        exit;
    }

    $sa = ga4_extract_service_account($json);
    if (empty($sa['ok'])) {
        http_response_code(400);
        echo json_encode(['message' => (string)($sa['message'] ?? 'JSON inválido')]);
        if (isset($conn)) $conn = null;
        exit;
    }

    if ($sid > 0) {
        try {
            $siteRow = ga4_get_site($conn, $sid);
            if (!$siteRow) {
                http_response_code(404);
                echo json_encode(['message' => 'Sitio no encontrado']);
                if (isset($conn)) $conn = null;
                exit;
            }

            $dir = ga4_storage_dir();
            if (!is_dir($dir)) {
                if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
                    http_response_code(500);
                    echo json_encode(['message' => 'No se pudo crear directorio de credenciales']);
                    if (isset($conn)) $conn = null;
                    exit;
                }
            }

            $abs = ga4_site_credentials_abspath($sid);
            if (@file_put_contents($abs, json_encode($json, JSON_UNESCAPED_UNICODE)) === false) {
                http_response_code(500);
                echo json_encode(['message' => 'No se pudo guardar el archivo de credenciales']);
                if (isset($conn)) $conn = null;
                exit;
            }

            $stmt = $conn->prepare("REPLACE INTO analytics_credentials (site_id, file_path, client_email) VALUES (?, ?, ?)");
            $stmt->execute([$sid, ga4_site_credentials_relpath($sid), (string)$sa['client_email']]);

            echo json_encode(['success' => true, 'clientEmail' => (string)$sa['client_email']]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['message' => 'Error guardando credenciales']);
        }
        if (isset($conn)) $conn = null;
        exit;
    }

    try {
        ga4_set_setting($conn, 'ga4_service_account_json', json_encode($json, JSON_UNESCAPED_UNICODE));
        echo json_encode(['success' => true, 'clientEmail' => (string)$sa['client_email']]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['message' => 'Error guardando credenciales']);
    }
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'DELETE' && $action === 'delete_credentials') {
    $sid = (int)($_GET['site_id'] ?? 0);
    if ($sid > 0) {
        try {
            $abs = ga4_site_credentials_abspath($sid);
            if (file_exists($abs)) {
                @unlink($abs);
            }
            $stmt = $conn->prepare("DELETE FROM analytics_credentials WHERE site_id = ?");
            $stmt->execute([$sid]);
            echo json_encode(['success' => true, 'message' => 'Credenciales eliminadas']);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['message' => 'Error eliminando credenciales']);
        }
        if (isset($conn)) $conn = null;
        exit;
    }
    try {
        ga4_set_setting($conn, 'ga4_service_account_json', '');
        echo json_encode(['success' => true, 'message' => 'Credenciales eliminadas']);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['message' => 'Error eliminando credenciales']);
    }
    if (isset($conn)) $conn = null;
    exit;
}

function ga4_require_ready(string $propertyId, string $credentialsRaw): array {
    if ($propertyId === '') return ['ok' => false, 'message' => 'Configura el propertyId de GA4'];
    if (trim($credentialsRaw) === '') return ['ok' => false, 'message' => 'Sube el JSON de Service Account para GA4'];
    $json = json_decode($credentialsRaw, true);
    if (!is_array($json)) return ['ok' => false, 'message' => 'Credenciales guardadas inválidas'];
    $sa = ga4_extract_service_account($json);
    if (empty($sa['ok'])) return ['ok' => false, 'message' => (string)($sa['message'] ?? 'Credenciales inválidas')];
    return ['ok' => true, 'serviceAccount' => $sa];
}

function ga4_date_or_default(?string $v, string $default): string {
    $v = trim((string)$v);
    if ($v === '') return $default;
    if (!preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/', $v)) return $default;
    return $v;
}

function ga4_report_body(string $startDate, string $endDate, array $dimensions, array $metrics, int $limit = 10, array $orderBys = [], ?array $dimensionFilter = null): array {
    $dims = [];
    foreach ($dimensions as $d) $dims[] = ['name' => (string)$d];
    $mets = [];
    foreach ($metrics as $m) $mets[] = ['name' => (string)$m];
    $body = [
        'dateRanges' => [['startDate' => $startDate, 'endDate' => $endDate]],
        'dimensions' => $dims,
        'metrics' => $mets,
        'limit' => $limit
    ];
    if (!empty($orderBys)) $body['orderBys'] = $orderBys;
    if (is_array($dimensionFilter) && !empty($dimensionFilter)) $body['dimensionFilter'] = $dimensionFilter;
    return $body;
}

function ga4_fetch_all(string $propertyId, array $serviceAccount, string $startDate, string $endDate, string $hostname = ''): array {
    $tok = ga4_get_oauth_token($serviceAccount);
    if (empty($tok['ok'])) return ['ok' => false, 'message' => (string)($tok['message'] ?? 'Error obteniendo token'), 'detail' => $tok];
    $accessToken = (string)$tok['access_token'];

    $out = [];
    $warnings = [];
    $filter = null;
    if (trim($hostname) !== '') {
        $filter = ga4_dimension_filter_exact('hostName', $hostname);
    }

    $summaryBody = ga4_report_body($startDate, $endDate, [], ['totalUsers', 'newUsers', 'sessions', 'screenPageViews', 'averageSessionDuration', 'engagementRate'], 1, [], $filter);
    $summary = ga4_run_report($propertyId, $accessToken, $summaryBody);
    if (empty($summary['ok'])) return $summary;
    $summaryTable = ga4_rows_to_table((array)$summary['data']);
    $summaryRow = isset($summaryTable['rows'][0]) && is_array($summaryTable['rows'][0]) ? $summaryTable['rows'][0] : [];
    $out['summary'] = [
        'totalUsers' => (float)($summaryRow['totalUsers'] ?? 0),
        'newUsers' => (float)($summaryRow['newUsers'] ?? 0),
        'sessions' => (float)($summaryRow['sessions'] ?? 0),
        'pageViews' => (float)($summaryRow['screenPageViews'] ?? 0),
        'avgSessionDuration' => (float)($summaryRow['averageSessionDuration'] ?? 0),
        'engagementRate' => (float)($summaryRow['engagementRate'] ?? 0)
    ];

    $newVsBody = ga4_report_body($startDate, $endDate, ['newVsReturning'], ['totalUsers'], 10, [
        ['metric' => ['metricName' => 'totalUsers'], 'desc' => true]
    ], $filter);
    $newVs = ga4_run_report($propertyId, $accessToken, $newVsBody);
    if (empty($newVs['ok'])) return $newVs;
    $out['newVsReturning'] = ga4_rows_to_table((array)$newVs['data']);

    $ageBody = ga4_report_body($startDate, $endDate, ['userAgeBracket'], ['totalUsers'], 20, [
        ['metric' => ['metricName' => 'totalUsers'], 'desc' => true]
    ], $filter);
    $age = ga4_run_report($propertyId, $accessToken, $ageBody);
    if (empty($age['ok'])) return $age;
    $out['age'] = ga4_rows_to_table((array)$age['data']);

    $genderBody = ga4_report_body($startDate, $endDate, ['userGender'], ['totalUsers'], 10, [
        ['metric' => ['metricName' => 'totalUsers'], 'desc' => true]
    ], $filter);
    $gender = ga4_run_report($propertyId, $accessToken, $genderBody);
    if (empty($gender['ok'])) return $gender;
    $out['gender'] = ga4_rows_to_table((array)$gender['data']);

    $geoBody = ga4_report_body($startDate, $endDate, ['country', 'city'], ['totalUsers'], 50, [
        ['metric' => ['metricName' => 'totalUsers'], 'desc' => true]
    ], $filter);
    $geo = ga4_run_report($propertyId, $accessToken, $geoBody);
    if (empty($geo['ok'])) return $geo;
    $out['geo'] = ga4_rows_to_table((array)$geo['data']);

    $deviceBody = ga4_report_body($startDate, $endDate, ['deviceCategory'], ['totalUsers', 'sessions'], 10, [
        ['metric' => ['metricName' => 'sessions'], 'desc' => true]
    ], $filter);
    $device = ga4_run_report($propertyId, $accessToken, $deviceBody);
    if (empty($device['ok'])) return $device;
    $out['device'] = ga4_rows_to_table((array)$device['data']);

    $channelBody = ga4_report_body($startDate, $endDate, ['sessionDefaultChannelGroup'], ['sessions', 'totalUsers'], 20, [
        ['metric' => ['metricName' => 'sessions'], 'desc' => true]
    ], $filter);
    $channel = ga4_run_report($propertyId, $accessToken, $channelBody);
    if (empty($channel['ok'])) return $channel;
    $out['channel'] = ga4_rows_to_table((array)$channel['data']);

    $platformBody = ga4_report_body($startDate, $endDate, ['platform'], ['totalUsers', 'sessions'], 10, [
        ['metric' => ['metricName' => 'sessions'], 'desc' => true]
    ], $filter);
    $platform = ga4_run_report($propertyId, $accessToken, $platformBody);
    if (empty($platform['ok'])) return $platform;
    $out['platform'] = ga4_rows_to_table((array)$platform['data']);

    $eventsBody = ga4_report_body($startDate, $endDate, ['eventName'], ['eventCount', 'totalUsers'], 50, [
        ['metric' => ['metricName' => 'eventCount'], 'desc' => true]
    ], $filter);
    $events = ga4_run_report($propertyId, $accessToken, $eventsBody);
    if (!empty($events['ok'])) {
        $out['events'] = ga4_rows_to_table((array)$events['data']);
    } else {
        $out['events'] = ['dimensions' => [], 'metrics' => [], 'rows' => []];
        $warnings[] = 'No se pudo consultar eventos. Verifica que la propiedad tenga eventos y permisos.';
    }

    $formsStartExpressions = [ga4_dimension_filter_exact('eventName', 'form_start')];
    if ($filter) $formsStartExpressions[] = $filter;
    $formsStart = ga4_report_body($startDate, $endDate, ['customEvent:form_name'], ['eventCount'], 200, [
        ['metric' => ['metricName' => 'eventCount'], 'desc' => true]
    ], [
        'andGroup' => ['expressions' => $formsStartExpressions]
    ]);
    $fs = ga4_run_report($propertyId, $accessToken, $formsStart);
    if (!empty($fs['ok'])) {
        $out['formsStart'] = ga4_rows_to_table((array)$fs['data']);
    } else {
        $out['formsStart'] = ['dimensions' => [], 'metrics' => [], 'rows' => []];
    }

    $formsSubmitExpressions = [ga4_dimension_filter_exact('eventName', 'form_submit_success')];
    if ($filter) $formsSubmitExpressions[] = $filter;
    $formsSubmit = ga4_report_body($startDate, $endDate, ['customEvent:form_name'], ['eventCount'], 200, [
        ['metric' => ['metricName' => 'eventCount'], 'desc' => true]
    ], [
        'andGroup' => ['expressions' => $formsSubmitExpressions]
    ]);
    $fsub = ga4_run_report($propertyId, $accessToken, $formsSubmit);
    if (!empty($fsub['ok'])) {
        $out['formsSubmit'] = ga4_rows_to_table((array)$fsub['data']);
    } else {
        $out['formsSubmit'] = ['dimensions' => [], 'metrics' => [], 'rows' => []];
    }

    $pagesBody = ga4_report_body($startDate, $endDate, ['pageTitle', 'pagePathPlusQueryString'], ['screenPageViews', 'totalUsers'], 25, [
        ['metric' => ['metricName' => 'screenPageViews'], 'desc' => true]
    ], $filter);
    $pages = ga4_run_report($propertyId, $accessToken, $pagesBody);
    if (empty($pages['ok'])) return $pages;
    $out['pages'] = ga4_rows_to_table((array)$pages['data']);

    $flowBody = ga4_report_body($startDate, $endDate, ['pageReferrer', 'pagePathPlusQueryString'], ['totalUsers'], 50, [
        ['metric' => ['metricName' => 'totalUsers'], 'desc' => true]
    ], $filter);
    $flow = ga4_run_report($propertyId, $accessToken, $flowBody);
    if (empty($flow['ok'])) return $flow;
    $out['flow'] = ga4_rows_to_table((array)$flow['data']);

    if (!empty($warnings)) $out['warnings'] = $warnings;
    return ['ok' => true, 'data' => $out];
}

if ($method === 'GET' && $action === 'test') {
    $sid = (int)($_GET['site_id'] ?? 0);
    $prop = $sid > 0 ? $sitePropertyId : $legacyPropertyId;
    $creds = $sid > 0 ? $siteCredentialsRaw : $legacyCredentialsRaw;
    $host = $sid > 0 ? $siteHostname : '';
    $ready = ga4_require_ready($prop, $creds);
    if (empty($ready['ok'])) {
        http_response_code(400);
        echo json_encode(['message' => (string)($ready['message'] ?? 'Config incompleta')]);
        if (isset($conn)) $conn = null;
        exit;
    }

    $sa = $ready['serviceAccount'];
    $tok = ga4_get_oauth_token($sa);
    if (empty($tok['ok'])) {
        http_response_code(400);
        echo json_encode(['message' => (string)($tok['message'] ?? 'Error token'), 'detail' => $tok]);
        if (isset($conn)) $conn = null;
        exit;
    }

    $accessToken = (string)$tok['access_token'];
    $today = date('Y-m-d');
    $body = ga4_report_body($today, $today, [], ['activeUsers'], 1, [], ($host !== '' ? ga4_dimension_filter_exact('hostName', $host) : null));
    $res = ga4_run_report($prop, $accessToken, $body);
    if (empty($res['ok'])) {
        http_response_code(400);
        echo json_encode(['message' => 'No se pudo consultar GA4 con las credenciales actuales', 'detail' => $res]);
        if (isset($conn)) $conn = null;
        exit;
    }

    echo json_encode(['success' => true, 'message' => 'Conexión GA4 OK']);
    if (isset($conn)) $conn = null;
    exit;
}

if ($method === 'GET' && ($action === 'all' || $action === 'report' || $action === 'dashboard')) {
    $sid = (int)($_GET['site_id'] ?? 0);
    $prop = $sid > 0 ? $sitePropertyId : $legacyPropertyId;
    $creds = $sid > 0 ? $siteCredentialsRaw : $legacyCredentialsRaw;
    $host = $sid > 0 ? $siteHostname : '';
    $ready = ga4_require_ready($prop, $creds);
    if (empty($ready['ok'])) {
        http_response_code(400);
        echo json_encode(['message' => (string)($ready['message'] ?? 'Config incompleta')]);
        if (isset($conn)) $conn = null;
        exit;
    }

    $start = ga4_date_or_default($_GET['start'] ?? null, date('Y-m-d', strtotime('-30 days')));
    $end = ga4_date_or_default($_GET['end'] ?? null, date('Y-m-d'));
    $sa = $ready['serviceAccount'];

    $noCache = (string)($_GET['nocache'] ?? '') === '1';
    $hostKey = $host !== '' ? preg_replace('/[^a-zA-Z0-9._-]/', '_', $host) : 'none';
    $propKey = $prop !== '' ? preg_replace('/[^0-9]/', '', $prop) : 'none';
    $cacheKey = 'ga4_' . $action . '_' . ($sid > 0 ? 'site_' . $sid : 'legacy') . '_p_' . $propKey . '_h_' . $hostKey . '_' . $start . '_' . $end;
    if (!$noCache) {
        $cached = ga4_cache_get($cacheKey, 600);
        if (is_array($cached)) {
            echo json_encode([
                'success' => true,
                'siteId' => $sid > 0 ? $sid : null,
                'range' => ['start' => $start, 'end' => $end],
                'data' => $cached,
                'cached' => true
            ]);
            if (isset($conn)) $conn = null;
            exit;
        }
    }

    $all = ga4_fetch_all($prop, $sa, $start, $end, $host);
    if (empty($all['ok'])) {
        http_response_code(400);
        echo json_encode(['message' => (string)($all['message'] ?? 'Error GA4'), 'detail' => $all]);
        if (isset($conn)) $conn = null;
        exit;
    }

    if (!$noCache && is_array($all['data'] ?? null)) {
        ga4_cache_put($cacheKey, (array)$all['data']);
    }

    echo json_encode([
        'success' => true,
        'siteId' => $sid > 0 ? $sid : null,
        'range' => ['start' => $start, 'end' => $end],
        'data' => $all['data'],
        'cached' => false
    ]);
    if (isset($conn)) $conn = null;
    exit;
}

http_response_code(400);
echo json_encode(["message" => "Acción no válida"]);
if (isset($conn)) $conn = null;
exit;

