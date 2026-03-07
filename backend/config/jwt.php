<?php
// Manually include JWT library since composer is missing/broken
require_once __DIR__ . '/../api/helpers/jwt/src/BeforeValidException.php';
require_once __DIR__ . '/../api/helpers/jwt/src/ExpiredException.php';
require_once __DIR__ . '/../api/helpers/jwt/src/SignatureInvalidException.php';
require_once __DIR__ . '/../api/helpers/jwt/src/Key.php';
require_once __DIR__ . '/../api/helpers/jwt/src/JWT.php';

// Attempt to load composer autoloader, but don't crash if it fails deeply
if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
    try {
        @require_once __DIR__ . '/../vendor/autoload.php';
    } catch (Throwable $e) {
        // Ignorar errores de carga de composer si fallan dependencias específicas
    }
}
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JWTHandler {
    private $secret_key = "9f3e4b0c7d2a6e1f8b5c9d0a4e7f3c1b2a6d8e4f9c0b7a5d3e1f6c8b2a9d4e7f"; // En prod usar variable de entorno
    private $algorithm = 'HS256';

    public function generateToken($data) {
        $issuedAt = time();
        $expirationTime = $issuedAt + 3600; // Valido por 1 hora
        $payload = array(
            'iat' => $issuedAt,
            'exp' => $expirationTime,
            'data' => $data
        );

        return JWT::encode($payload, $this->secret_key, $this->algorithm);
    }

    public function validateToken($token) {
        if (!$token) return null;
        try {
            $decoded = JWT::decode($token, new Key($this->secret_key, $this->algorithm));
            
            // Registrar actividad
            $this->logActivity($decoded->data);
            
            return $decoded->data;
        } catch (Exception $e) {
            return null;
        } catch (Throwable $e) { // Capture TypeErrors and other throwables
            return null;
        }
    }

    private function logActivity($userData) {
        // global $conn; // Ya no usamos la BD para logs
        
        try {
            $uri = $_SERVER['REQUEST_URI'] ?? 'Unknown';
            $method = $_SERVER['REQUEST_METHOD'] ?? 'Unknown';
            
            // Ignorar logs de consultas de logs/stats para evitar ruido
            if (strpos($uri, 'logs.php') !== false) return;
            if ($method === 'OPTIONS') return;
            
            // OPTIMIZACIÓN: No registrar peticiones GET para evitar archivos gigantes
            // Solo registrar operaciones que modifican datos (POST, PUT, DELETE, PATCH)
            if ($method === 'GET') return;

            // Extraer módulo de la URL
            $modulo = 'API';
            if (preg_match('/\/api\/([^\.]+)\.php/', $uri, $matches)) {
                $modulo = strtoupper($matches[1]);
            }

            // Datos del log
            $logEntry = [
                'id' => uniqid('log_', true),
                'usuario_id' => $userData->id,
                'usuario_nombre' => $userData->usuario,
                'accion' => $method,
                'modulo' => $modulo,
                'descripcion' => "Consulta a $uri",
                'ip_address' => $_SERVER['REMOTE_ADDR'] ?? '',
                'fecha' => date('Y-m-d H:i:s')
            ];

            // Ruta del archivo de logs (un archivo por día)
            $logDir = __DIR__ . '/../logs';
            if (!is_dir($logDir)) {
                mkdir($logDir, 0777, true);
            }
            $logFile = $logDir . '/log_' . date('Y-m-d') . '.jsonl';

            // Escribir en formato JSON Lines (JSONL)
            file_put_contents($logFile, json_encode($logEntry) . PHP_EOL, FILE_APPEND);

        } catch (Exception $e) {
            // Silenciar errores de log para no afectar la operación principal
        }
    }

    public function getBearerToken() {
        $headers = null;
        if (isset($_SERVER['Authorization'])) {
            $headers = trim($_SERVER["Authorization"]);
        } else if (isset($_SERVER['HTTP_AUTHORIZATION'])) { //Nginx or fast CGI
            $headers = trim($_SERVER["HTTP_AUTHORIZATION"]);
        } elseif (function_exists('apache_request_headers')) {
            $requestHeaders = apache_request_headers();
            $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
            if (isset($requestHeaders['Authorization'])) {
                $headers = trim($requestHeaders['Authorization']);
            }
        }
        
        if (!empty($headers)) {
            if (preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
                return $matches[1];
            }
        }

        // Fallback: Check request parameters (para servidores que eliminan headers)
        if (isset($_REQUEST['token'])) {
            return $_REQUEST['token'];
        }

        return null;
    }
}

