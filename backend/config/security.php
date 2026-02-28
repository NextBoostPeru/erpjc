<?php
// Evitar acceso directo
if (basename(__FILE__) == basename($_SERVER['PHP_SELF'])) {
    http_response_code(403);
    die("Forbidden");
}

// Security Headers
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("X-XSS-Protection: 1; mode=block");
header("Referrer-Policy: strict-origin-when-cross-origin");
// Content-Security-Policy estricto para API (no permite cargar recursos externos, scripts, etc.)
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none';");

// Rate Limiting (Simple File-based)
function check_rate_limit($limit = 300, $time_window = 60) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $cache_dir = __DIR__ . '/../cache_store';
    
    if (!file_exists($cache_dir)) {
        if (!mkdir($cache_dir, 0755, true)) {
            return; // Si no se puede crear el directorio, saltar rate limiting
        }
    }

    $file = $cache_dir . '/rate_limit_' . md5($ip) . '.json';
    $current_time = time();
    $data = ['start_time' => $current_time, 'count' => 0];

    if (file_exists($file)) {
        $content = file_get_contents($file);
        $saved_data = json_decode($content, true);
        
        if ($saved_data && isset($saved_data['start_time'])) {
            if ($current_time - $saved_data['start_time'] < $time_window) {
                if ($saved_data['count'] >= $limit) {
                    http_response_code(429);
                    header('Retry-After: ' . ($time_window - ($current_time - $saved_data['start_time'])));
                    die(json_encode(['error' => 'Too many requests. Please try again later.']));
                }
                $data = $saved_data;
                $data['count']++;
            }
        }
    } else {
        $data['count'] = 1;
    }

    file_put_contents($file, json_encode($data));
}

// Ejecutar Rate Limiter
check_rate_limit();

// Input Sanitization Helper
function secure_clean_input($data) {
    if (is_array($data)) {
        return array_map('secure_clean_input', $data);
    }
    if (is_null($data)) return null;
    $data = trim($data);
    $data = stripslashes($data);
    // Convertir caracteres especiales a entidades HTML para prevenir XSS
    $data = htmlspecialchars($data, ENT_QUOTES, 'UTF-8');
    return $data;
}

// Sanitizar $_GET y $_POST automáticamente
$_GET = secure_clean_input($_GET);
$_POST = secure_clean_input($_POST);

// Para JSON body (común en APIs modernas)
$input_json = json_decode(file_get_contents('php://input'), true);
if (json_last_error() === JSON_ERROR_NONE && is_array($input_json)) {
    // No sobrescribimos php://input, pero podemos proveer una variable global segura
    $SECURE_JSON = secure_clean_input($input_json);
}
?>