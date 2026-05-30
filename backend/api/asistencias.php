<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';

// --- Kiosk key validation (bypass JWT for marcador kiosk) ---
$isKiosk = isset($_GET['kiosk']) && $_GET['kiosk'] === '1';
$kioskKeyValid = false;
if ($isKiosk) {
    $cfgStmt = $conn->query("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
    $cfgRow = $cfgStmt->fetch(PDO::FETCH_ASSOC);
    $cfg = [];
    if ($cfgRow && !empty($cfgRow['configuracion_sunat'])) {
        $cfg = json_decode($cfgRow['configuracion_sunat'], true);
        if (json_last_error() !== JSON_ERROR_NONE) $cfg = [];
    }
    $storedKey = isset($cfg['kiosk_key']) ? trim((string)$cfg['kiosk_key']) : '';
    $headerKey = isset($_SERVER['HTTP_X_KIOSK_KEY']) ? trim($_SERVER['HTTP_X_KIOSK_KEY']) : '';
    $kioskKeyValid = $storedKey !== '' && $headerKey !== '' && hash_equals($storedKey, $headerKey);
}

if (!$kioskKeyValid) {
    $jwt = new JWTHandler();
    $token = $jwt->getBearerToken();
    $user_data = $jwt->validateToken($token);

    if (!$user_data) {
        http_response_code(401);
        echo json_encode(['error' => 'Token inválido']);
        if (isset($conn)) $conn = null;
        exit;
    }
}

// --- Ensure geo columns exist (lat, lng, accuracy, device_id) ---
try {
    $conn->exec("ALTER TABLE asistencias ADD COLUMN lat DECIMAL(10,7) DEFAULT NULL");
} catch (Exception $e) { /* column already exists */ }
try {
    $conn->exec("ALTER TABLE asistencias ADD COLUMN lng DECIMAL(10,7) DEFAULT NULL");
} catch (Exception $e) { /* column already exists */ }
try {
    $conn->exec("ALTER TABLE asistencias ADD COLUMN accuracy DECIMAL(10,2) DEFAULT NULL");
} catch (Exception $e) { /* column already exists */ }
try {
    $conn->exec("ALTER TABLE asistencias ADD COLUMN device_id VARCHAR(100) DEFAULT NULL");
} catch (Exception $e) { /* column already exists */ }

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            if ($isKiosk && isset($_GET['action']) && $_GET['action'] === 'lookup') {
                handleKioskLookup($conn);
            } elseif (isset($_GET['report']) && $_GET['report'] === 'monthly') {
                handleMonthlyReport($conn);
            } else {
                handleList($conn);
            }
            break;

        case 'POST':
            if ($isKiosk && isset($_GET['action']) && $_GET['action'] === 'marcar') {
                handleKioskMarcar($conn);
            } elseif (isset($_GET['import']) && $_GET['import'] === 'true') {
                handleImport($conn);
            } elseif (isset($_GET['bulk']) && $_GET['bulk'] === 'true') {
                handleBulkSave($conn);
            } elseif (isset($_GET['reset']) && $_GET['reset'] === 'true') {
                handleReset($conn);
            } else {
                handleCreate($conn);
            }
            break;

        case 'PUT':
            handleUpdate($conn);
            break;

        case 'DELETE':
            handleDelete($conn);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}

$conn = null;

function handleList($conn) {
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
    $offset = ($page - 1) * $limit;
    $search = isset($_GET['search']) ? $_GET['search'] : '';
    $date = isset($_GET['date']) ? $_GET['date'] : '';
    $area = isset($_GET['area']) ? $_GET['area'] : '';
    $status = isset($_GET['status']) ? $_GET['status'] : '';

    $whereSQL = "WHERE 1=1";
    $params = [];

    if (!empty($search)) {
        $whereSQL .= " AND (c.nombres LIKE :search OR c.apellidos LIKE :search OR c.documento_numero LIKE :search)";
        $params[':search'] = "%$search%";
    }
    
    if (!empty($date)) {
        $whereSQL .= " AND a.fecha = :date";
        $params[':date'] = $date;
    }

    if (!empty($area)) {
        $whereSQL .= " AND c.area = :area";
        $params[':area'] = $area;
    }

    if (!empty($status)) {
        $whereSQL .= " AND a.estado = :status";
        $params[':status'] = $status;
    }

    // Total
    $countQuery = "SELECT COUNT(*) as total FROM asistencias a 
                   JOIN colaboradores c ON a.colaborador_id = c.id 
                   $whereSQL";
    $countStmt = $conn->prepare($countQuery);
    $countStmt->execute($params);
    $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];
    $totalPages = ceil($total / $limit);

    // Data
    $query = "SELECT 
                a.*,
                c.nombres, c.apellidos, c.documento_numero,
                u.usuario as validador_nombre,
                CASE
                    WHEN a.horas_extras IS NULL THEN 0
                    WHEN a.horas_extras <= 16 THEN a.horas_extras
                    WHEN a.horas_extras BETWEEN 100 AND 2359 AND MOD(a.horas_extras, 100) < 60
                        THEN ROUND(LEAST((FLOOR(a.horas_extras / 100) + (MOD(a.horas_extras, 100) / 60)), 16), 2)
                    WHEN a.horas_extras BETWEEN 60 AND 1440
                        THEN ROUND(LEAST((a.horas_extras / 60), 16), 2)
                    ELSE 16
                END as horas_extras
              FROM asistencias a 
              JOIN colaboradores c ON a.colaborador_id = c.id 
              LEFT JOIN usuarios u ON a.validado_por = u.id
              $whereSQL 
              ORDER BY a.fecha DESC, a.hora_entrada ASC 
              LIMIT :limit OFFSET :offset";
    
    $stmt = $conn->prepare($query);
    foreach ($params as $key => $val) {
        $stmt->bindValue($key, $val);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    echo json_encode([
        "data" => $stmt->fetchAll(PDO::FETCH_ASSOC),
        "pagination" => [
            "total" => $total,
            "page" => $page,
            "totalPages" => $totalPages
        ]
    ]);
}

function handleCreate($conn) {
    $data = json_decode(file_get_contents("php://input"));
    
    $estado = $data->estado ?? 'Pendiente'; // Default to Pendiente if not sent (or if it's normal attendance)
    
    // If specific non-attendance status
    if (in_array($estado, ['Falta', 'Licencia', 'Vacaciones'])) {
        $hora_entrada = null;
        $hora_salida = null;
        $hours = ['worked' => 0, 'overtime' => 0];
    } else {
        // Normal attendance
        $hora_entrada = $data->hora_entrada;
        $hora_salida = $data->hora_salida;
        $hours = calculateHours($hora_entrada, $hora_salida);
        $estado = 'Pendiente'; // Force Pendiente for normal attendance entries until validated
    }

    // Get Turno ID
    $turno_id = null;
    $stmtTurno = $conn->prepare("SELECT turno_id FROM colaboradores WHERE id = ?");
    $stmtTurno->execute([$data->colaborador_id]);
    $colab = $stmtTurno->fetch(PDO::FETCH_ASSOC);
    if ($colab) {
        $turno_id = $colab['turno_id'];
    }

    $lat = isset($data->lat) ? (float)$data->lat : null;
    $lng = isset($data->lng) ? (float)$data->lng : null;
    $accuracy = isset($data->accuracy) ? (float)$data->accuracy : null;
    $deviceId = isset($data->device_id) ? trim($data->device_id) : null;
    $metodo = isset($data->metodo) ? $data->metodo : 'Manual';

    $sql = "INSERT INTO asistencias (colaborador_id, fecha, hora_entrada, hora_salida, horas_trabajadas, horas_extras, metodo, estado, observaciones, turno_id, lat, lng, accuracy, device_id) 
            VALUES (:cid, :fecha, :he, :hs, :ht, :hex, :metodo, :estado, :obs, :turno_id, :lat, :lng, :acc, :dev)";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':cid' => $data->colaborador_id,
        ':fecha' => $data->fecha,
        ':he' => $hora_entrada,
        ':hs' => $hora_salida,
        ':ht' => $hours['worked'],
        ':hex' => $hours['overtime'],
        ':metodo' => $metodo,
        ':estado' => $estado,
        ':obs' => $data->observaciones ?? '',
        ':turno_id' => $turno_id,
        ':lat' => $lat,
        ':lng' => $lng,
        ':acc' => $accuracy,
        ':dev' => $deviceId
    ]);

    echo json_encode(["message" => "Asistencia registrada"]);
}

function handleUpdate($conn) {
    $data = json_decode(file_get_contents("php://input"));
    
    if (isset($data->validate) && $data->validate) {
        // Validate
        $sql = "UPDATE asistencias SET estado = :estado, validado_por = :uid WHERE id = :id";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':estado' => $data->estado, // Validado / Observado
            ':uid' => $data->user_id ?? 1,
            ':id' => $data->id
        ]);
    } else {
        // Edit
        $estado = $data->estado ?? 'Pendiente';
        if ($estado === 'Asistencia') {
            $estado = 'Pendiente';
        }
        
        if (in_array($estado, ['Falta', 'Licencia', 'Vacaciones'])) {
             $hora_entrada = null;
             $hora_salida = null;
             $hours = ['worked' => 0, 'overtime' => 0];
        } else {
             $hora_entrada = $data->hora_entrada;
             $hora_salida = $data->hora_salida;
             $hours = calculateHours($hora_entrada, $hora_salida);
             // If editing back to attendance, we might want to reset to Pendiente or keep current if valid?
             // Let's assume editing implies re-verification if it was valid, but let's stick to updating values.
             // But if we are switching FROM Falta TO Asistencia, we need to ensure state is handled.
             // For simplicity, if we provide hours, we treat it as attendance.
        }

        $overrideOvertime = (isset($data->horas_extras) && is_numeric($data->horas_extras)) ? (float)$data->horas_extras : null;
        if ($overrideOvertime !== null) {
            if ($overrideOvertime < 0 || $overrideOvertime > 16) {
                http_response_code(400);
                echo json_encode(["message" => "Horas extras fuera de rango (0 a 16)"]);
                if (isset($conn)) $conn = null;
                exit;
            }
            $hours['overtime'] = $overrideOvertime;
        }

        $sql = "UPDATE asistencias SET hora_entrada = :he, hora_salida = :hs, horas_trabajadas = :ht, horas_extras = :hex, observaciones = :obs, estado = :estado WHERE id = :id";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':he' => $hora_entrada,
            ':hs' => $hora_salida,
            ':ht' => $hours['worked'],
            ':hex' => $hours['overtime'],
            ':obs' => $data->observaciones ?? '',
            ':estado' => $estado,
            ':id' => $data->id
        ]);
    }

    echo json_encode(["message" => "Asistencia actualizada"]);
}

function handleDelete($conn) {
    $id = $_GET['id'];
    $stmt = $conn->prepare("DELETE FROM asistencias WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(["message" => "Asistencia eliminada"]);
}

function handleReset($conn) {
    $data = json_decode(file_get_contents("php://input"));
    $date = $data->date ?? '';
    $area = $data->area ?? '';
    if (empty($date)) {
        throw new Exception("Fecha requerida");
    }
    $sql = "UPDATE asistencias a 
            JOIN colaboradores c ON a.colaborador_id = c.id
            SET a.hora_entrada = NULL, a.hora_salida = NULL, a.horas_trabajadas = 0, a.horas_extras = 0, a.observaciones = '', a.estado = 'Pendiente', a.validado_por = NULL
            WHERE a.fecha = :date";
    $params = [':date' => $date];
    if (!empty($area)) {
        $sql .= " AND c.area = :area";
        $params[':area'] = $area;
    }
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    echo json_encode(["message" => "Día reseteado", "count" => $stmt->rowCount()]);
}

function handleImport($conn) {
    // Expecting JSON array of objects
    $data = json_decode(file_get_contents("php://input"));
    $count = 0;
    $errors = 0;

    if (empty($data)) {
        echo json_encode(["message" => "No data to import", "imported" => 0, "errors" => 0]);
        return;
    }

    // 1. Pre-fetch collaborators to avoid N+1 queries
    $documentos = [];
    foreach ($data as $row) {
        if (!isset($row->colaborador_id) && isset($row->documento_numero)) {
            $documentos[] = $row->documento_numero;
        }
    }
    
    $colabMap = [];
    if (!empty($documentos)) {
        $documentos = array_unique($documentos);
        $placeholders = implode(',', array_fill(0, count($documentos), '?'));
        $stmt = $conn->prepare("SELECT documento_numero, id FROM colaboradores WHERE documento_numero IN ($placeholders)");
        $stmt->execute(array_values($documentos));
        while ($c = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $colabMap[$c['documento_numero']] = $c['id'];
        }
    }

    try {
        $conn->beginTransaction();

        $stmt = $conn->prepare("INSERT INTO asistencias (colaborador_id, fecha, hora_entrada, hora_salida, horas_trabajadas, horas_extras, metodo, estado) 
                                VALUES (:cid, :fecha, :he, :hs, :ht, :hex, 'Importacion', 'Pendiente')
                                ON DUPLICATE KEY UPDATE 
                                hora_entrada = VALUES(hora_entrada), 
                                hora_salida = VALUES(hora_salida), 
                                horas_trabajadas = VALUES(horas_trabajadas),
                                horas_extras = VALUES(horas_extras)");

        foreach ($data as $row) {
            try {
                // Resolve ID
                if (!isset($row->colaborador_id) && isset($row->documento_numero)) {
                    if (isset($colabMap[$row->documento_numero])) {
                        $row->colaborador_id = $colabMap[$row->documento_numero];
                    } else {
                        $errors++;
                        continue; // Skip if not found
                    }
                }

                $hours = calculateHours($row->hora_entrada, $row->hora_salida);

                $stmt->execute([
                    ':cid' => $row->colaborador_id,
                    ':fecha' => $row->fecha,
                    ':he' => $row->hora_entrada,
                    ':hs' => $row->hora_salida,
                    ':ht' => $hours['worked'],
                    ':hex' => $hours['overtime']
                ]);
                $count++;
            } catch (Exception $e) {
                $errors++;
            }
        }
        
        $conn->commit();
    } catch (Exception $e) {
        $conn->rollBack();
        throw $e;
    }

    echo json_encode(["message" => "Importación completada", "imported" => $count, "errors" => $errors]);
}

function handleBulkSave($conn) {
    $data = json_decode(file_get_contents("php://input"));
    $count = 0;
    
    if (empty($data)) {
        echo json_encode(["message" => "No data to save", "count" => 0]);
        return;
    }

    try {
        $conn->beginTransaction();

        // Use INSERT ... ON DUPLICATE KEY UPDATE to handle both insert and update efficiently
        $sql = "INSERT INTO asistencias (id, colaborador_id, fecha, hora_entrada, hora_salida, horas_trabajadas, horas_extras, metodo, estado, observaciones) 
                VALUES (:id, :cid, :fecha, :he, :hs, :ht, :hex, 'Manual', :estado, :obs)
                ON DUPLICATE KEY UPDATE 
                hora_entrada = VALUES(hora_entrada),
                hora_salida = VALUES(hora_salida),
                horas_trabajadas = VALUES(horas_trabajadas),
                horas_extras = VALUES(horas_extras),
                estado = VALUES(estado),
                observaciones = VALUES(observaciones)";
        
        $stmt = $conn->prepare($sql);

        foreach ($data as $row) {
            $estado = $row->estado ?? 'Pendiente';
            if ($estado === 'Asistencia') {
                $estado = 'Pendiente';
            }
            
            if (in_array($estado, ['Falta', 'Licencia', 'Vacaciones'])) {
                $hora_entrada = null;
                $hora_salida = null;
                $hours = ['worked' => 0, 'overtime' => 0];
            } else {
                $hora_entrada = !empty($row->hora_entrada) ? $row->hora_entrada : null;
                $hora_salida = !empty($row->hora_salida) ? $row->hora_salida : null;
                $hours = calculateHours($hora_entrada, $hora_salida);
            }

            // We need to know if we are updating an existing ID or inserting new
            // If row has ID, use it. If not, we rely on unique key (colaborador_id + fecha) if it exists?
            // The table likely has a unique index on (colaborador_id, fecha).
            // If not, ON DUPLICATE KEY UPDATE only works on PRIMARY or UNIQUE keys.
            // Let's assume there is a unique constraint on (colaborador_id, fecha) or we are passing ID.
            
            // If we don't have ID, we pass NULL for auto-increment.
            // But if we want ON DUPLICATE KEY to work on (colaborador_id, fecha), we need that constraint.
            // If the constraint doesn't exist, we might duplicate.
            // Given the previous code checked for existence, let's replicate that logic but safer.
            // Actually, previous code did `SELECT id FROM ...`. 
            
            // Optimization: Pre-check existence for all items is complex. 
            // Better approach: Try to fetch IDs for all (colaborador_id, fecha) pairs first.
            
            // However, to keep it simple and optimized:
            // 1. Try to use the ID if provided.
            // 2. If no ID, but we want to update by (colaborador, fecha), we need the ID.
            
            $id = $row->id ?? null;
            
            if (!$id) {
                // Try to find ID
                $check = $conn->prepare("SELECT id FROM asistencias WHERE colaborador_id = :cid AND fecha = :fecha");
                $check->execute([':cid' => $row->colaborador_id, ':fecha' => $row->fecha]);
                $exists = $check->fetch(PDO::FETCH_ASSOC);
                if ($exists) $id = $exists['id'];
            }

            $stmt->execute([
                ':id' => $id, // If null, auto-increment (insert). If set, tries to insert with that ID (duplicate key -> update)
                ':cid' => $row->colaborador_id,
                ':fecha' => $row->fecha,
                ':he' => $hora_entrada,
                ':hs' => $hora_salida,
                ':ht' => $hours['worked'],
                ':hex' => $hours['overtime'],
                ':estado' => $estado,
                ':obs' => $row->observaciones ?? ''
            ]);
            
            $count++;
        }
        
        $conn->commit();
    } catch (Exception $e) {
        $conn->rollBack();
        throw $e;
    }
    
    echo json_encode(["message" => "Registros procesados", "count" => $count]);
}

function handleMonthlyReport($conn) {
    $month = $_GET['month'] ?? date('m');
    $year = $_GET['year'] ?? date('Y');

    $sql = "SELECT 
                c.id, c.nombres, c.apellidos, c.documento_numero,
                COALESCE(SUM(CASE WHEN a.hora_entrada IS NOT NULL AND a.estado NOT IN ('Falta','Licencia','Vacaciones') THEN 1 ELSE 0 END), 0) as dias_trabajados,
                COALESCE(SUM(a.horas_trabajadas), 0) as total_horas,
                COALESCE(SUM(
                    CASE
                        WHEN a.horas_extras IS NULL THEN 0
                        WHEN a.horas_extras <= 16 THEN a.horas_extras
                        WHEN a.horas_extras BETWEEN 100 AND 2359 AND MOD(a.horas_extras, 100) < 60
                            THEN LEAST((FLOOR(a.horas_extras / 100) + (MOD(a.horas_extras, 100) / 60)), 16)
                        WHEN a.horas_extras BETWEEN 60 AND 1440
                            THEN LEAST((a.horas_extras / 60), 16)
                        ELSE 16
                    END
                ), 0) as total_extras,
                COALESCE(SUM(CASE WHEN a.hora_entrada > '09:15:00' THEN 1 ELSE 0 END), 0) as tardanzas,
                COALESCE(SUM(CASE WHEN a.hora_entrada IS NOT NULL AND DAYOFWEEK(a.fecha) = 1 AND a.estado NOT IN ('Falta','Licencia','Vacaciones') THEN 1 ELSE 0 END), 0) as dominicales
            FROM colaboradores c
            LEFT JOIN asistencias a ON c.id = a.colaborador_id AND MONTH(a.fecha) = :m AND YEAR(a.fecha) = :y
            GROUP BY c.id
            ORDER BY c.apellidos";

    $stmt = $conn->prepare($sql);
    $stmt->execute([':m' => $month, ':y' => $year]);
    
    echo json_encode(["data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function calculateHours($in, $out) {
    if (!$in || !$out) return ['worked' => 0, 'overtime' => 0];

    $t1 = strtotime($in);
    $t2 = strtotime($out);
    if ($t1 === false || $t2 === false) return ['worked' => 0, 'overtime' => 0];

    $diffSecs = $t2 - $t1;
    if ($diffSecs < 0) $diffSecs += 24 * 3600;
    if ($diffSecs <= 0 || $diffSecs > 18 * 3600) return ['worked' => 0, 'overtime' => 0];

    $diff = $diffSecs / 3600.0;

    if ($diff >= 9) {
        $diff -= 1;
    }

    $worked = round($diff, 2);
    $overtime = 0.0;

    if ($worked > 8) {
        $overtime = $worked - 8;
        $worked = 8;
    }

    if ($overtime < 0) $overtime = 0.0;
    if ($overtime > 16) $overtime = 16.0;

    return ['worked' => $worked, 'overtime' => round($overtime, 2)];
}

function handleKioskLookup($conn) {
    $dni = isset($_GET['dni']) ? trim($_GET['dni']) : '';
    if (!preg_match('/^\d{8}$/', $dni)) {
        echo json_encode(['colaborador' => null, 'message' => 'DNI inválido']);
        return;
    }
    $stmt = $conn->prepare("SELECT id, nombres, apellidos, documento_numero FROM colaboradores WHERE documento_numero = ? AND estado = 'Activo' LIMIT 1");
    $stmt->execute([$dni]);
    $colab = $stmt->fetch(PDO::FETCH_ASSOC);
    echo json_encode(['colaborador' => $colab ?: null]);
}

function handleKioskMarcar($conn) {
    $data = json_decode(file_get_contents("php://input"));
    if (!$data || empty($data->dni)) {
        http_response_code(400);
        echo json_encode(['message' => 'DNI requerido']);
        return;
    }
    $dni = trim($data->dni);
    if (!preg_match('/^\d{8}$/', $dni)) {
        http_response_code(400);
        echo json_encode(['message' => 'DNI inválido']);
        return;
    }

    $stmt = $conn->prepare("SELECT id, nombres, apellidos FROM colaboradores WHERE documento_numero = ? AND estado = 'Activo' LIMIT 1");
    $stmt->execute([$dni]);
    $colab = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$colab) {
        http_response_code(404);
        echo json_encode(['message' => 'Colaborador no encontrado']);
        return;
    }
    $colabId = (int)$colab['id'];

    $today = date('Y-m-d');
    $nowTime = date('H:i:s');

    // Check if there's already an entrada without salida today
    $stmtCheck = $conn->prepare("SELECT id, hora_entrada, hora_salida FROM asistencias WHERE colaborador_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1");
    $stmtCheck->execute([$colabId, $today]);
    $existing = $stmtCheck->fetch(PDO::FETCH_ASSOC);

    $lat = isset($data->lat) ? (float)$data->lat : null;
    $lng = isset($data->lng) ? (float)$data->lng : null;
    $accuracy = isset($data->accuracy) ? (float)$data->accuracy : null;
    $deviceId = isset($data->device_id) ? trim($data->device_id) : null;

    if ($existing && empty($existing['hora_salida'])) {
        // Already clocked in but no clock-out → registrar salida
        $hours = calculateHours($existing['hora_entrada'], $nowTime);
        $stmtUpd = $conn->prepare("UPDATE asistencias SET hora_salida = :hs, horas_trabajadas = :ht, horas_extras = :hex, metodo = 'Kiosk', lat = :lat, lng = :lng, accuracy = :acc, device_id = :dev WHERE id = :id");
        $stmtUpd->execute([
            ':hs' => $nowTime,
            ':ht' => $hours['worked'],
            ':hex' => $hours['overtime'],
            ':lat' => $lat,
            ':lng' => $lng,
            ':acc' => $accuracy,
            ':dev' => $deviceId,
            ':id' => $existing['id']
        ]);
        echo json_encode(['tipo' => 'Salida', 'fecha' => $today, 'hora' => $nowTime, 'message' => 'Salida registrada correctamente.']);
    } else {
        // No clock-in today or already has clock-out → registrar nueva entrada
        $stmtIns = $conn->prepare("INSERT INTO asistencias (colaborador_id, fecha, hora_entrada, horas_trabajadas, metodo, estado, lat, lng, accuracy, device_id) VALUES (:cid, :fecha, :he, 0, 'Kiosk', 'Pendiente', :lat, :lng, :acc, :dev)");
        $stmtIns->execute([
            ':cid' => $colabId,
            ':fecha' => $today,
            ':he' => $nowTime,
            ':lat' => $lat,
            ':lng' => $lng,
            ':acc' => $accuracy,
            ':dev' => $deviceId
        ]);
        echo json_encode(['tipo' => 'Entrada', 'fecha' => $today, 'hora' => $nowTime, 'message' => 'Entrada registrada correctamente.']);
    }
}
?>
