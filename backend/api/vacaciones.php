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

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['action']) && $_GET['action'] === 'approvers') {
                ensureApproverTable($conn);
                handleApproversList($conn);
            } elseif (isset($_GET['balance']) && isset($_GET['colaborador_id'])) {
                handleGetBalance($conn);
            } else {
                handleList($conn);
            }
            break;

        case 'POST':
            if (isset($_GET['action']) && $_GET['action'] === 'approvers') {
                ensureApproverTable($conn);
                handleApproverCreate($conn);
            } else {
                handleCreate($conn);
            }
            break;

        case 'PUT':
            handleUpdate($conn);
            break;

        case 'DELETE':
            if (isset($_GET['action']) && $_GET['action'] === 'approvers') {
                ensureApproverTable($conn);
                handleApproverDelete($conn);
            } else {
                handleDelete($conn);
            }
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}

$conn = null;

function handleList($conn) {
    $whereSQL = "WHERE 1=1";
    $params = [];

    if (isset($_GET['colaborador_id']) && $_GET['colaborador_id'] !== '') {
        $whereSQL .= " AND s.colaborador_id = :cid";
        $params[':cid'] = $_GET['colaborador_id'];
    }

    if (isset($_GET['status']) && $_GET['status'] !== '') {
        $whereSQL .= " AND s.estado = :status";
        $params[':status'] = $_GET['status'];
    }

    $sql = "SELECT s.*, c.nombres, c.apellidos, c.documento_numero, 
            u_rrhh.usuario as rrhh_nombre,
            u_gerente.usuario as gerente_nombre
            FROM solicitudes_permisos s
            JOIN colaboradores c ON s.colaborador_id = c.id
            LEFT JOIN usuarios u_rrhh ON s.aprobado_por_rrhh = u_rrhh.id
            LEFT JOIN usuarios u_gerente ON s.aprobado_por_gerente = u_gerente.id
            $whereSQL
            ORDER BY s.created_at DESC";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    echo json_encode(["data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function handleCreate($conn) {
    // Unified Input Handling (JSON or POST/FormData)
    $inputJSON = json_decode(file_get_contents("php://input"));
    if ($inputJSON) {
        $data = $inputJSON;
    } else {
        $data = (object)$_POST;
    }
    
    // Validate required fields
    if (empty($data->colaborador_id) || empty($data->tipo) || empty($data->fecha_inicio) || empty($data->fecha_fin)) {
        http_response_code(400);
        echo json_encode(["message" => "Faltan datos requeridos"]);
        return;
    }

    // Handle File Upload
    $documentoPath = null;
    if (isset($_FILES['documento']) && $_FILES['documento']['error'] === UPLOAD_ERR_OK) {
        $uploadDir = __DIR__ . '/uploads/vacaciones/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }
        $ext = pathinfo($_FILES['documento']['name'], PATHINFO_EXTENSION);
        $filename = 'doc_' . time() . '_' . uniqid() . '.' . $ext;
        if (move_uploaded_file($_FILES['documento']['tmp_name'], $uploadDir . $filename)) {
            $documentoPath = 'uploads/vacaciones/' . $filename;
        }
    }

    // Calculate days difference
    $start = new DateTime($data->fecha_inicio);
    $end = new DateTime($data->fecha_fin);
    $diff = $start->diff($end);
    $dias = $diff->days + 1; // Inclusive

    if ($dias <= 0) {
        http_response_code(400);
        echo json_encode(["message" => "Fechas inválidas"]);
        return;
    }

    // Check balance if it's vacations
    if ($data->tipo === 'Vacaciones') {
        $balance = calculateBalance($conn, $data->colaborador_id);
        if ($balance['disponibles'] < $dias) {
            http_response_code(400);
            echo json_encode(["message" => "Días insuficientes. Disponibles: " . $balance['disponibles']]);
            return;
        }
    }

    $sql = "INSERT INTO solicitudes_permisos (colaborador_id, tipo, fecha_inicio, fecha_fin, dias, motivo, documento, estado)
            VALUES (:cid, :tipo, :fi, :ff, :dias, :motivo, :doc, 'Pendiente')";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':cid' => $data->colaborador_id,
        ':tipo' => $data->tipo,
        ':fi' => $data->fecha_inicio,
        ':ff' => $data->fecha_fin,
        ':dias' => $dias,
        ':motivo' => $data->motivo ?? '',
        ':doc' => $documentoPath
    ]);

    echo json_encode(["message" => "Solicitud creada exitosamente"]);
}

function handleUpdate($conn) {
    $data = json_decode(file_get_contents("php://input"));
    
    if (empty($data->id)) {
        http_response_code(400);
        echo json_encode(["message" => "Faltan datos (ID)"]);
        return;
    }

    $id = $data->id;

    // SCENARIO 1: Status Update (Approve/Reject)
    if (isset($data->action) && in_array($data->action, ['approve_rrhh', 'approve_gerente', 'reject'])) {
        if (empty($data->user_id)) {
            http_response_code(400);
            echo json_encode(["message" => "Falta User ID"]);
            return;
        }
        $uid = $data->user_id;
        $action = $data->action;

        try {
            // Permission check
            if ($action === 'approve_rrhh') {
                if (!hasApprovalRight($conn, $uid, 'RRHH')) {
                    http_response_code(403);
                    echo json_encode(["message" => "No autorizado para aprobar como RRHH"]);
                    return;
                }
            } elseif ($action === 'approve_gerente') {
                if (!hasApprovalRight($conn, $uid, 'Gerente')) {
                    http_response_code(403);
                    echo json_encode(["message" => "No autorizado para aprobación final"]);
                    return;
                }
            } elseif ($action === 'reject') {
                // Allow reject if user has either RRHH or Gerente rights
                if (!hasApprovalRight($conn, $uid, 'RRHH') && !hasApprovalRight($conn, $uid, 'Gerente')) {
                    http_response_code(403);
                    echo json_encode(["message" => "No autorizado para rechazar"]);
                    return;
                }
            }

            if ($action === 'approve_rrhh') {
                $sql = "UPDATE solicitudes_permisos 
                        SET estado = 'Aprobado RRHH', 
                            aprobado_por_rrhh = :uid, 
                            fecha_aprobacion_rrhh = NOW() 
                        WHERE id = :id";
                $msg = "Aprobado por RRHH";
            } elseif ($action === 'approve_gerente') {
                $sql = "UPDATE solicitudes_permisos 
                        SET estado = 'Aprobado', 
                            aprobado_por_gerente = :uid, 
                            fecha_aprobacion_gerente = NOW() 
                        WHERE id = :id";
                $msg = "Aprobado Final (Gerencia)";
            } elseif ($action === 'reject') {
                $sql = "UPDATE solicitudes_permisos SET estado = 'Rechazado' WHERE id = :id";
                $msg = "Solicitud rechazada";
            }

            $stmt = $conn->prepare($sql);
            if ($action === 'reject') {
                $stmt->execute([':id' => $id]);
            } else {
                $stmt->execute([':id' => $id, ':uid' => $uid]);
            }

            echo json_encode(["message" => $msg]);

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["message" => "Error DB: " . $e->getMessage()]);
        }
        return;
    }

    // SCENARIO 2: Content Edit (Info Update)
    if (empty($data->tipo) || empty($data->fecha_inicio) || empty($data->fecha_fin) || empty($data->colaborador_id)) {
        http_response_code(400);
        echo json_encode(["message" => "Faltan datos para editar"]);
        return;
    }

    // Calculate days
    $start = new DateTime($data->fecha_inicio);
    $end = new DateTime($data->fecha_fin);
    $diff = $start->diff($end);
    $dias = $diff->days + 1;

    if ($dias <= 0) {
        http_response_code(400); echo json_encode(["message" => "Fechas inválidas"]); return;
    }

    // Balance Check
     if ($data->tipo === 'Vacaciones') {
          // Get current days for this record to adjust balance check
          $stmt = $conn->prepare("SELECT dias, tipo FROM solicitudes_permisos WHERE id = ?");
          $stmt->execute([$id]);
          $current = $stmt->fetch(PDO::FETCH_ASSOC);
          
          $old_days = 0;
          if ($current && $current['tipo'] === 'Vacaciones') {
              $old_days = $current['dias'];
          }
          
          $balance = calculateBalance($conn, $data->colaborador_id);
          $real_available = $balance['disponibles'] + $old_days; // Add back old days ONLY if it was Vacaciones
          
          if ($real_available < $dias) {
              http_response_code(400);
              echo json_encode(["message" => "Días insuficientes. Disponibles: " . $real_available]);
              return;
          }
     }

    try {
        $sql = "UPDATE solicitudes_permisos 
                SET tipo = :tipo, 
                    fecha_inicio = :fi, 
                    fecha_fin = :ff, 
                    dias = :dias, 
                    motivo = :motivo 
                WHERE id = :id AND estado = 'Pendiente'"; // Restrict to Pending

        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':tipo' => $data->tipo,
            ':fi' => $data->fecha_inicio,
            ':ff' => $data->fecha_fin,
            ':dias' => $dias,
            ':motivo' => $data->motivo ?? '',
            ':id' => $id
        ]);

        if ($stmt->rowCount() > 0) {
            echo json_encode(["message" => "Solicitud actualizada correctamente"]);
        } else {
            // Could be because nothing changed OR it wasn't Pending OR ID not found
            // Check if it exists
            $check = $conn->prepare("SELECT estado FROM solicitudes_permisos WHERE id = ?");
            $check->execute([$id]);
            $res = $check->fetch();
            if ($res && $res['estado'] !== 'Pendiente') {
                http_response_code(400);
                echo json_encode(["message" => "No se puede editar: La solicitud ya no está pendiente"]);
            } else {
                echo json_encode(["message" => "Solicitud actualizada (Sin cambios o ID no encontrado)"]);
            }
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["message" => "Error DB: " . $e->getMessage()]);
    }
}

function handleDelete($conn) {
    // Support JSON body or GET param
    $data = json_decode(file_get_contents("php://input"));
    $id = $data->id ?? ($_GET['id'] ?? null);

    if (!$id) {
        http_response_code(400);
        echo json_encode(["message" => "Falta ID"]);
        return;
    }

    try {
        // Only delete Pending
        $sql = "DELETE FROM solicitudes_permisos WHERE id = :id AND estado = 'Pendiente'";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':id' => $id]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode(["message" => "Solicitud eliminada"]);
        } else {
            http_response_code(400);
            echo json_encode(["message" => "No se puede eliminar: No existe o no está pendiente"]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["message" => "Error DB: " . $e->getMessage()]);
    }
}

function handleGetBalance($conn) {
    $cid = $_GET['colaborador_id'];
    $balance = calculateBalance($conn, $cid);
    echo json_encode($balance);
}

function calculateBalance($conn, $colaborador_id) {
    // 1. Get Start Date
    $stmt = $conn->prepare("SELECT fecha_ingreso FROM colaboradores WHERE id = ?");
    $stmt->execute([$colaborador_id]);
    $colab = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$colab || !$colab['fecha_ingreso']) {
        return ['ganados' => 0, 'usados' => 0, 'disponibles' => 0];
    }

    // 2. Calculate Accrued Days (30 days per year)
    $start = new DateTime($colab['fecha_ingreso']);
    $now = new DateTime();
    $diff = $start->diff($now);
    
    // Total months worked
    $months = ($diff->y * 12) + $diff->m;
    
    // 2.5 days per month = 30 days per year
    $ganados = floor($months * 2.5);

    // 3. Calculate Used Days (Approved Vacations)
    // Note: Count all non-rejected requests to prevent over-booking
    $stmt = $conn->prepare("SELECT SUM(dias) as usados FROM solicitudes_permisos WHERE colaborador_id = ? AND tipo = 'Vacaciones' AND estado != 'Rechazado'");
    $stmt->execute([$colaborador_id]);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    $usados = $res['usados'] ?? 0;

    return [
        'ganados' => $ganados,
        'usados' => (int)$usados,
        'disponibles' => $ganados - $usados
    ];
}

// =========================
// Approvers Configuration
// =========================
function ensureApproverTable($conn) {
    $conn->exec("CREATE TABLE IF NOT EXISTS vacaciones_aprobadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nivel ENUM('RRHH','Gerente') NOT NULL,
        rol_id INT NULL,
        usuario_id INT NULL,
        activo TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_nivel (nivel),
        INDEX idx_rol (rol_id),
        INDEX idx_usuario (usuario_id)
    )");
}

function handleApproversList($conn) {
    $sql = "SELECT va.*, r.nombre AS rol_nombre, u.usuario AS usuario_nombre
            FROM vacaciones_aprobadores va
            LEFT JOIN roles r ON va.rol_id = r.id
            LEFT JOIN usuarios u ON va.usuario_id = u.id
            WHERE va.activo = 1
            ORDER BY va.nivel ASC, va.id DESC";
    $stmt = $conn->query($sql);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(["data" => $items]);
}

function handleApproverCreate($conn) {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(["message" => "Formato inválido"]);
        return;
    }
    $nivel = $data['nivel'] ?? '';
    $tipo = strtolower($data['tipo'] ?? '');
    $rol_id = null;
    $usuario_id = null;
    if ($tipo === 'rol') {
        $rol_id = $data['rol_id'] ?? null;
    } elseif ($tipo === 'usuario') {
        $usuario_id = $data['usuario_id'] ?? null;
    } else {
        http_response_code(400);
        echo json_encode(["message" => "Tipo inválido"]);
        return;
    }
    if (!in_array($nivel, ['RRHH','Gerente'])) {
        http_response_code(400);
        echo json_encode(["message" => "Nivel inválido"]);
        return;
    }
    // Prevent duplicates
    $check = $conn->prepare("SELECT id FROM vacaciones_aprobadores WHERE nivel = :n AND IFNULL(rol_id,0) = IFNULL(:r,0) AND IFNULL(usuario_id,0) = IFNULL(:u,0)");
    $check->execute([':n' => $nivel, ':r' => $rol_id, ':u' => $usuario_id]);
    if ($check->fetch()) {
        http_response_code(400);
        echo json_encode(["message" => "Ya existe"]);
        return;
    }
    $stmt = $conn->prepare("INSERT INTO vacaciones_aprobadores (nivel, rol_id, usuario_id, activo) VALUES (:n, :r, :u, 1)");
    $stmt->execute([':n' => $nivel, ':r' => $rol_id, ':u' => $usuario_id]);
    echo json_encode(["message" => "Aprobador agregado"]);
}

function handleApproverDelete($conn) {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(["message" => "ID requerido"]);
        return;
    }
    $stmt = $conn->prepare("DELETE FROM vacaciones_aprobadores WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(["message" => "Aprobador eliminado"]);
}

function hasApprovalRight($conn, $usuario_id, $nivel) {
    $q = $conn->prepare("SELECT r.nombre AS rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.id = ?");
    $q->execute([$usuario_id]);
    $u = $q->fetch(PDO::FETCH_ASSOC);
    $rolNombre = strtolower($u['rol_nombre'] ?? '');
    if ($nivel === 'RRHH') {
        return $rolNombre === 'rrhh';
    } elseif ($nivel === 'Gerente') {
        return $rolNombre === 'gerente' || $rolNombre === 'gerencia';
    }
    return false;
}
?>
