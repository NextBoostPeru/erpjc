<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

// Configuración
$logDir = __DIR__ . '/../logs';
if (!is_dir($logDir)) {
    mkdir($logDir, 0777, true);
}

// Función auxiliar para leer logs
function getLogs($dir, $filters = [], $limit = 1000) {
    $files = glob($dir . '/log_*.jsonl');
    rsort($files); // Archivos más recientes primero

    $logs = [];
    $count = 0;

    foreach ($files as $file) {
        if ($count >= $limit) break;

        // Verificar filtro de fecha por nombre de archivo (optimización)
        if (isset($filters['fecha_inicio']) || isset($filters['fecha_fin'])) {
            if (preg_match('/log_(\d{4}-\d{2}-\d{2})\.jsonl/', basename($file), $matches)) {
                $fileDate = $matches[1];
                if (isset($filters['fecha_inicio']) && $fileDate < $filters['fecha_inicio']) continue; // Archivo muy viejo
                if (isset($filters['fecha_fin']) && $fileDate > $filters['fecha_fin']) continue; // Archivo muy nuevo
            }
        }

        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) continue;
        
        $lines = array_reverse($lines); // Leer desde el final (más recientes)

        foreach ($lines as $line) {
            if ($count >= $limit) break;

            $data = json_decode($line, true);
            if (!$data) continue;

            // Aplicar filtros
            if (isset($filters['fecha_inicio']) && substr($data['fecha'], 0, 10) < $filters['fecha_inicio']) continue;
            if (isset($filters['fecha_fin']) && substr($data['fecha'], 0, 10) > $filters['fecha_fin']) continue;
            if (isset($filters['usuario_id']) && $data['usuario_id'] != $filters['usuario_id']) continue;
            if (isset($filters['modulo']) && $data['modulo'] != $filters['modulo']) continue;

            // Normalizar datos para el frontend
            $data['usuario_real'] = $data['usuario_nombre'] ?? 'Desconocido';
            if (!isset($data['id'])) {
                $data['id'] = md5(json_encode($data)); // Generar ID si no existe
            }
            $logs[] = $data;
            $count++;
        }
    }
    return $logs;
}

$method = $_SERVER['REQUEST_METHOD'];

$jwtHandler = new JWTHandler();
$token = $jwtHandler->getBearerToken();
$userData = $jwtHandler->validateToken($token);
if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

rbac_require($conn, $userData, 'logs', $method);

if ($method === 'GET') {
    if (isset($_GET['stats'])) {
        // Estadísticas simplificadas basadas en archivos
        $dailyStats = [];
        $userStats = [];
        $totalToday = 0;

        $files = glob($logDir . '/log_*.jsonl');
        rsort($files);
        
        // Stats diarios (últimos 30 archivos)
        $processedFiles = 0;
        foreach ($files as $file) {
            if ($processedFiles >= 30) break;
            
            if (preg_match('/log_(\d{4}-\d{2}-\d{2})\.jsonl/', basename($file), $matches)) {
                $date = $matches[1];
                $lines = count(file($file, FILE_SKIP_EMPTY_LINES));
                $dailyStats[] = ['fecha' => $date, 'total' => $lines];
                
                // Stats de hoy
                if ($date === date('Y-m-d')) {
                    $totalToday = $lines;
                    // Procesar usuarios top de hoy
                    $linesContent = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                    $userCounts = [];
                    foreach ($linesContent as $line) {
                        $data = json_decode($line, true);
                        if ($data) {
                            $user = $data['usuario_nombre'] ?? 'Desconocido';
                            if (!isset($userCounts[$user])) $userCounts[$user] = 0;
                            $userCounts[$user]++;
                        }
                    }
                    arsort($userCounts);
                    foreach (array_slice($userCounts, 0, 5) as $user => $count) {
                        $userStats[] = ['usuario' => $user, 'total' => $count];
                    }
                }
            }
            $processedFiles++;
        }
        
        // Ordenar stats diarios cronológicamente para el gráfico
        usort($dailyStats, function($a, $b) {
            return strcmp($a['fecha'], $b['fecha']);
        });

        echo json_encode([
            'daily' => $dailyStats,
            'top_users' => $userStats,
            'total_today' => $totalToday
        ]);
        exit;
    }

    // Listado de logs con filtros
    $filters = [
        'fecha_inicio' => isset($_GET['fecha_inicio']) ? $_GET['fecha_inicio'] : null,
        'fecha_fin' => isset($_GET['fecha_fin']) ? $_GET['fecha_fin'] : null,
        'usuario_id' => isset($_GET['usuario_id']) ? $_GET['usuario_id'] : null,
        'modulo' => isset($_GET['modulo']) ? $_GET['modulo'] : null
    ];

    $logs = getLogs($logDir, $filters);
    echo json_encode($logs);

} elseif ($method === 'POST') {
    // Registrar log manual
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!empty($data['usuario_id']) && !empty($data['accion'])) {
        $logEntry = [
            'id' => uniqid('log_', true),
            'usuario_id' => $data['usuario_id'],
            'usuario_nombre' => $data['usuario_nombre'] ?? null,
            'accion' => $data['accion'],
            'modulo' => $data['modulo'] ?? 'GENERAL',
            'descripcion' => $data['descripcion'] ?? '',
            'ip_address' => $_SERVER['REMOTE_ADDR'],
            'fecha' => date('Y-m-d H:i:s')
        ];

        $logFile = $logDir . '/log_' . date('Y-m-d') . '.jsonl';
        file_put_contents($logFile, json_encode($logEntry) . PHP_EOL, FILE_APPEND);
        
        echo json_encode(['message' => 'Log registrado']);
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Datos incompletos']);
    }

} elseif ($method === 'DELETE') {
    // Eliminar logs antiguos
    $days = isset($_GET['days']) ? (int)$_GET['days'] : 60;
    if ($days < 7) $days = 7; 

    $cutoffDate = date('Y-m-d', strtotime("-$days days"));
    $files = glob($logDir . '/log_*.jsonl');
    $deletedCount = 0;

    foreach ($files as $file) {
        if (preg_match('/log_(\d{4}-\d{2}-\d{2})\.jsonl/', basename($file), $matches)) {
            $fileDate = $matches[1];
            if ($fileDate < $cutoffDate) {
                unlink($file);
                $deletedCount++;
            }
        }
    }
    
    echo json_encode(['message' => "$deletedCount archivos de logs eliminados (anteriores a $days días)"]);
}
?>
