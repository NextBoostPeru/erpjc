<?php
class AuditLogger {
    private static $logDir = __DIR__ . '/../logs';

    private static function ensureDir($dir) {
        if (!file_exists($dir)) {
            mkdir($dir, 0777, true);
        }
    }

    public static function logChange($table, $recordId, $action, $oldValue, $newValue, $userId, $details = '') {
        self::ensureDir(self::$logDir . '/audit');
        
        $entry = [
            'id' => uniqid('audit_', true),
            'fecha_hora' => date('Y-m-d H:i:s'),
            'tabla_afectada' => $table,
            'registro_id' => $recordId,
            'accion' => $action,
            'valor_anterior' => $oldValue,
            'valor_nuevo' => $newValue,
            'usuario_id' => $userId,
            'detalles' => $details
        ];

        $file = self::$logDir . '/audit/audit_' . date('Y-m-d') . '.jsonl';
        file_put_contents($file, json_encode($entry) . PHP_EOL, FILE_APPEND);
    }

    public static function logAccess($userId, $action, $ip, $details = '') {
        self::ensureDir(self::$logDir . '/access');

        $entry = [
            'id' => uniqid('access_', true),
            'fecha_hora' => date('Y-m-d H:i:s'),
            'usuario_id' => $userId,
            'accion' => $action,
            'ip_address' => $ip,
            'detalles' => $details
        ];

        $file = self::$logDir . '/access/access_' . date('Y-m-d') . '.jsonl';
        file_put_contents($file, json_encode($entry) . PHP_EOL, FILE_APPEND);
    }

    // Helper to get logs (shared logic for reading JSONL)
    public static function getLogs($type, $limit = 100, $filters = []) {
        $subDir = $type === 'bitacora' ? 'audit' : 'access';
        $prefix = $type === 'bitacora' ? 'audit_' : 'access_';
        $dir = self::$logDir . '/' . $subDir;
        
        if (!file_exists($dir)) return [];

        $files = glob($dir . '/' . $prefix . '*.jsonl');
        rsort($files); // Newest files first

        $logs = [];
        $count = 0;

        foreach ($files as $file) {
            if ($count >= $limit) break;
            
            $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            $lines = array_reverse($lines); // Newest lines first

            foreach ($lines as $line) {
                if ($count >= $limit) break;
                
                $data = json_decode($line, true);
                if (!$data) continue;

                // Apply simple filters if needed (can be expanded)
                if (isset($filters['usuario_id']) && $data['usuario_id'] != $filters['usuario_id']) continue;
                
                $logs[] = $data;
                $count++;
            }
        }
        return $logs;
    }
}
?>
