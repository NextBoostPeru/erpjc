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

$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$user_data = $jwt->validateToken($token);

if (!$user_data) {
    http_response_code(401);
    echo json_encode(['error' => 'Token inválido']);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            // Reports vs List
            if (isset($_GET['report']) && $_GET['report'] === 'monthly') {
                handleMonthlyReport($conn);
            } else {
                handleList($conn);
            }
            break;

        case 'POST':
            if (isset($_GET['import']) && $_GET['import'] === 'true') {
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
    $query = "SELECT a.*, c.nombres, c.apellidos, c.documento_numero, u.usuario as validador_nombre
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

    $sql = "INSERT INTO asistencias (colaborador_id, fecha, hora_entrada, hora_salida, horas_trabajadas, horas_extras, metodo, estado, observaciones, turno_id) 
            VALUES (:cid, :fecha, :he, :hs, :ht, :hex, 'Manual', :estado, :obs, :turno_id)";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':cid' => $data->colaborador_id,
        ':fecha' => $data->fecha,
        ':he' => $hora_entrada,
        ':hs' => $hora_salida,
        ':ht' => $hours['worked'],
        ':hex' => $hours['overtime'],
        ':estado' => $estado,
        ':obs' => $data->observaciones ?? '',
        ':turno_id' => $turno_id
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
                COALESCE(SUM(a.horas_extras), 0) as total_extras,
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
    if (!$out) return ['worked' => 0, 'overtime' => 0];
    
    $t1 = strtotime($in);
    $t2 = strtotime($out);
    $diff = ($t2 - $t1) / 3600; // Hours
    
    if ($diff < 0) $diff = 0; // Error case

    // Deduct 1 hour for lunch if worked 9 hours or more
    // This assumes a standard 1 hour break is included in the span
    if ($diff >= 9) {
        $diff -= 1;
    }

    $worked = round($diff, 2);
    $overtime = 0;

    // Standard 8 hours
    if ($worked > 8) {
        $overtime = $worked - 8;
        $worked = 8; // Cap normal hours at 8
    }
    
    return ['worked' => $worked, 'overtime' => round($overtime, 2)];
}
?>
