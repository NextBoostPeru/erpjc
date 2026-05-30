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
require_once '../config/rbac.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $jwtHandler = new JWTHandler();
    $token = $jwtHandler->getBearerToken();
    $userData = $jwtHandler->validateToken($token);
    if (!$userData) {
        http_response_code(401);
        echo json_encode(["message" => "Acceso no autorizado"]);
        if (isset($conn)) $conn = null;
        exit;
    }

    $usuario_id = $userData->id ?? 1;
    ensureTables($conn);
    ensureColaboradorColumn($conn);

    switch ($method) {
        case 'GET':
            rbac_require($conn, $userData, 'planillas_secundarias', 'GET', 'lectura');
            if (isset($_GET['action']) && $_GET['action'] === 'historial_pagos') {
                handleHistorialPagos($conn);
            } elseif (isset($_GET['action']) && $_GET['action'] === 'check_colaboradores') {
                handleCheckColaboradores($conn);
            } elseif (isset($_GET['id'])) {
                handleGetDetails($conn);
            } else {
                handleList($conn);
            }
            break;

        case 'POST':
            $action = $_GET['action'] ?? '';
            if ($action === 'generate') {
                rbac_require($conn, $userData, 'planillas_secundarias', 'POST', 'crear');
                handleGenerate($conn);
            } elseif ($action === 'registrar_pago') {
                rbac_require($conn, $userData, 'planillas_secundarias', 'POST', 'editar');
                handleRegistrarPago($conn, $usuario_id);
            } else {
                rbac_require($conn, $userData, 'planillas_secundarias', 'POST', 'editar');
                handleUpdateDetail($conn);
            }
            break;

        case 'PUT':
            rbac_require($conn, $userData, 'planillas_secundarias', 'PUT', 'editar');
            handleUpdateStatus($conn);
            break;

        case 'DELETE':
            rbac_require($conn, $userData, 'planillas_secundarias', 'DELETE', 'eliminacion');
            handleDelete($conn);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}

$conn = null;

function ensureTables($conn) {
    $conn->exec("CREATE TABLE IF NOT EXISTS planillas_secundarias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        anio INT NOT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        concepto VARCHAR(100) NOT NULL DEFAULT 'Pago Semanal',
        estado ENUM('Borrador','Cerrado','Enviado') NOT NULL DEFAULT 'Borrador',
        total_ingresos DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_neto DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_semana (fecha_inicio, concepto)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $conn->exec("CREATE TABLE IF NOT EXISTS planilla_secundaria_detalles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        planilla_secundaria_id INT NOT NULL,
        colaborador_id INT NOT NULL,
        sueldo_secundario DECIMAL(10,2) NOT NULL DEFAULT 0,
        dias_trabajados INT NOT NULL DEFAULT 0,
        total_bruto DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_descuentos DECIMAL(10,2) NOT NULL DEFAULT 0,
        neto_pagar DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_planilla_secundaria (planilla_secundaria_id),
        INDEX idx_colaborador (colaborador_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $conn->exec("CREATE TABLE IF NOT EXISTS pagos_planilla_secundaria (
        id INT AUTO_INCREMENT PRIMARY KEY,
        planilla_secundaria_detalle_id INT NOT NULL,
        planilla_secundaria_id INT NOT NULL,
        colaborador_id INT NOT NULL,
        periodo VARCHAR(7) NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        medio_pago VARCHAR(30) DEFAULT NULL,
        referencia VARCHAR(100) DEFAULT NULL,
        origen_id INT DEFAULT NULL,
        observaciones TEXT DEFAULT NULL,
        usuario_id INT NOT NULL,
        archivo_constancia VARCHAR(255) DEFAULT NULL,
        fecha DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_planilla_sec_detalle_id (planilla_secundaria_detalle_id),
        INDEX idx_planilla_secundaria_id (planilla_secundaria_id),
        INDEX idx_colaborador_id (colaborador_id),
        INDEX idx_periodo (periodo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migrar columnas nuevas si tabla vieja sin fecha_inicio/fecha_fin/dias_trabajados
    try {
        $col = $conn->query("SHOW COLUMNS FROM planillas_secundarias LIKE 'fecha_inicio'");
        if ($col->rowCount() === 0) {
            $conn->exec("ALTER TABLE planillas_secundarias ADD COLUMN fecha_inicio DATE NOT NULL AFTER anio");
        }
    } catch (Exception $e) {}
    try {
        $col = $conn->query("SHOW COLUMNS FROM planillas_secundarias LIKE 'fecha_fin'");
        if ($col->rowCount() === 0) {
            $conn->exec("ALTER TABLE planillas_secundarias ADD COLUMN fecha_fin DATE NOT NULL AFTER fecha_inicio");
        }
    } catch (Exception $e) {}
    try {
        $col = $conn->query("SHOW COLUMNS FROM planilla_secundaria_detalles LIKE 'dias_trabajados'");
        if ($col->rowCount() === 0) {
            $conn->exec("ALTER TABLE planilla_secundaria_detalles ADD COLUMN dias_trabajados INT NOT NULL DEFAULT 0 AFTER sueldo_secundario");
        }
    } catch (Exception $e) {}
}

function ensureColaboradorColumn($conn) {
    // Verificar si la columna ya existe intentando leerla
    try {
        $conn->query("SELECT sueldo_secundario FROM colaboradores LIMIT 1");
        return;
    } catch (Exception $e) {}

    // Columna no existe, intentar crearla
    try {
        $conn->exec("ALTER TABLE colaboradores ADD COLUMN sueldo_secundario DECIMAL(10,2) NOT NULL DEFAULT 0");
    } catch (Exception $e2) {}
}

function contarDiasAsistidos($conn, $colabId, $fechaInicio, $fechaFin) {
    $excluidos = ['Falta', 'Licencia', 'Vacaciones', 'Cesado', 'Permiso sin goce'];
    $ph = implode(',', array_fill(0, count($excluidos), '?'));
    $sql = "SELECT COUNT(DISTINCT fecha)
            FROM asistencias
            WHERE colaborador_id = ?
              AND fecha >= ?
              AND fecha <= ?
              AND estado NOT IN ($ph)
              AND hora_entrada IS NOT NULL";
    $stmt = $conn->prepare($sql);
    $stmt->execute(array_merge([$colabId, $fechaInicio, $fechaFin], $excluidos));
    return (int)($stmt->fetchColumn() ?? 0);
}

function handleList($conn) {
    $year = $_GET['year'] ?? date('Y');
    $sql = "SELECT * FROM planillas_secundarias WHERE anio = :year ORDER BY fecha_inicio DESC, created_at DESC";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':year' => $year]);
    echo json_encode(["data" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function handleGetDetails($conn) {
    $id = $_GET['id'];
    $stmt = $conn->prepare("SELECT * FROM planillas_secundarias WHERE id = ?");
    $stmt->execute([$id]);
    $header = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$header) {
        http_response_code(404);
        echo json_encode(["message" => "Planilla secundaria no encontrada"]);
        return;
    }

    $sql = "SELECT d.*, c.nombres, c.apellidos, c.documento_numero, c.cargo
            FROM planilla_secundaria_detalles d
            JOIN colaboradores c ON d.colaborador_id = c.id
            WHERE d.planilla_secundaria_id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$id]);
    $details = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $fechaInicio = $header['fecha_inicio'];
    $fechaFin = $header['fecha_fin'];

    foreach ($details as &$d) {
        $detId = (int)$d['id'];
        $stmtPag = $conn->prepare("SELECT IFNULL(SUM(monto), 0) FROM pagos_planilla_secundaria WHERE planilla_secundaria_detalle_id = ?");
        $stmtPag->execute([$detId]);
        $d['pagado'] = (float)($stmtPag->fetchColumn() ?? 0);
        $d['pendiente'] = round((float)$d['neto_pagar'] - $d['pagado'], 2);
        if ($d['pendiente'] < 0) $d['pendiente'] = 0;

        // Recalcular asistencia en tiempo real
        $diasActuales = contarDiasAsistidos($conn, (int)$d['colaborador_id'], $fechaInicio, $fechaFin);
        $d['asistencia_detectada'] = $diasActuales;
    }
    unset($d);

    echo json_encode(["header" => $header, "details" => $details]);
}

function handleGenerate($conn) {
    $data = json_decode(file_get_contents("php://input"));
    $fechaInicio = trim((string)($data->fecha_inicio ?? ''));
    $fechaFin = trim((string)($data->fecha_fin ?? ''));
    $concepto = trim((string)($data->concepto ?? 'Pago Semanal'));
    if (empty($concepto)) $concepto = 'Pago Semanal';

    if (empty($fechaInicio) || empty($fechaFin)) {
        http_response_code(400);
        echo json_encode(["message" => "Fecha de inicio y fin son requeridas"]);
        return;
    }
    if (strtotime($fechaInicio) > strtotime($fechaFin)) {
        http_response_code(400);
        echo json_encode(["message" => "La fecha de inicio debe ser anterior o igual a la fecha fin"]);
        return;
    }

    $anio = (int)date('Y', strtotime($fechaInicio));
    $diasPeriodo = (int)floor((strtotime($fechaFin) - strtotime($fechaInicio)) / 86400) + 1;
    if ($diasPeriodo <= 0) $diasPeriodo = 7;

    $check = $conn->prepare("SELECT id FROM planillas_secundarias WHERE fecha_inicio = ? AND concepto = ?");
    $check->execute([$fechaInicio, $concepto]);
    if ($check->fetch()) {
        http_response_code(400);
        echo json_encode(["message" => "Ya existe una planilla secundaria con concepto '$concepto' para la semana del $fechaInicio"]);
        return;
    }

    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("INSERT INTO planillas_secundarias (anio, fecha_inicio, fecha_fin, concepto, estado) VALUES (?, ?, ?, ?, 'Borrador')");
        $stmt->execute([$anio, $fechaInicio, $fechaFin, $concepto]);
        $planillaId = $conn->lastInsertId();

        $colabs = $conn->query("SELECT * FROM colaboradores WHERE (estado IS NULL OR estado = '' OR LOWER(estado) = 'activo') ORDER BY apellidos, nombres")->fetchAll(PDO::FETCH_ASSOC);

        $totalIngresos = 0;
        $totalNeto = 0;

        $sqlDetail = "INSERT INTO planilla_secundaria_detalles (planilla_secundaria_id, colaborador_id, sueldo_secundario, dias_trabajados, total_bruto, total_descuentos, neto_pagar)
                      VALUES (:pid, :cid, :sueldo, :dias, :bruto, 0, :neto)";
        $stmtDetail = $conn->prepare($sqlDetail);

        $totalColabs = count($colabs);
        $withSalary = 0;
        foreach ($colabs as $c) {
            $sueldoSemanal = (float)($c['sueldo_secundario'] ?? 0);
            if ($sueldoSemanal > 0) $withSalary++;
        }

        if ($withSalary === 0) {
            $conn->rollBack();
            http_response_code(400);
            echo json_encode(["message" => "Ningun colaborador tiene sueldo secundario asignado ($totalColabs colaboradores activos encontrados). Edite cada colaborador y asigne un Sueldo Secundario (Semanal) en Gestion de Colaboradores."]);
            return;
        }

        foreach ($colabs as $c) {
            $sueldoSemanal = (float)($c['sueldo_secundario'] ?? 0);
            if ($sueldoSemanal <= 0) continue;

            $diasTrabajados = contarDiasAsistidos($conn, (int)$c['id'], $fechaInicio, $fechaFin);
            if ($diasTrabajados < 0) $diasTrabajados = 0;
            if ($diasTrabajados > $diasPeriodo) $diasTrabajados = $diasPeriodo;

            $tasaDiaria = ($sueldoSemanal > 0 && $diasPeriodo > 0) ? ($sueldoSemanal / (float)$diasPeriodo) : 0;
            $bruto = round($tasaDiaria * $diasTrabajados, 2);
            $neto = $bruto;

            $stmtDetail->execute([
                ':pid' => $planillaId,
                ':cid' => $c['id'],
                ':sueldo' => $sueldoSemanal,
                ':dias' => $diasTrabajados,
                ':bruto' => $bruto,
                ':neto' => $neto
            ]);

            $totalIngresos += $bruto;
            $totalNeto += $neto;
        }

        $updateH = $conn->prepare("UPDATE planillas_secundarias SET total_ingresos = ?, total_neto = ? WHERE id = ?");
        $updateH->execute([$totalIngresos, $totalNeto, $planillaId]);

        $conn->commit();
        echo json_encode(["message" => "Planilla semanal generada exitosamente", "id" => $planillaId]);

    } catch (Exception $e) {
        $conn->rollBack();
        throw $e;
    }
}

function handleUpdateDetail($conn) {
    $data = json_decode(file_get_contents("php://input"));
    if (!isset($data->id)) {
        http_response_code(400);
        echo json_encode(["message" => "Faltan datos"]);
        return;
    }

    $sueldoSec = (float)($data->sueldo_secundario ?? 0);
    $dias = (int)($data->dias_trabajados ?? 0);
    if ($dias < 0) $dias = 0;

    $diasPeriodo = 7;
    $planillaId = isset($data->planilla_secundaria_id) ? (int)$data->planilla_secundaria_id : 0;
    if ($planillaId > 0) {
        try {
            $stmtP = $conn->prepare("SELECT fecha_inicio, fecha_fin FROM planillas_secundarias WHERE id = ? LIMIT 1");
            $stmtP->execute([$planillaId]);
            $p = $stmtP->fetch(PDO::FETCH_ASSOC);
            if ($p && !empty($p['fecha_inicio']) && !empty($p['fecha_fin'])) {
                $calc = (int)floor((strtotime($p['fecha_fin']) - strtotime($p['fecha_inicio'])) / 86400) + 1;
                if ($calc > 0) $diasPeriodo = $calc;
            }
        } catch (Throwable $e) {
        }
    }
    if ($diasPeriodo <= 0) $diasPeriodo = 7;
    if ($dias > $diasPeriodo) $dias = $diasPeriodo;

    $tasaDiaria = ($sueldoSec > 0 && $diasPeriodo > 0) ? ($sueldoSec / (float)$diasPeriodo) : 0;
    $bruto = round($tasaDiaria * $dias, 2);
    $descuentos = (float)($data->total_descuentos ?? 0);
    $neto = $bruto - $descuentos;
    if ($neto < 0) $neto = 0;

    $sql = "UPDATE planilla_secundaria_detalles SET
            sueldo_secundario = :sueldo,
            dias_trabajados = :dias,
            total_bruto = :bruto,
            total_descuentos = :desc,
            neto_pagar = :neto
            WHERE id = :id";
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':sueldo' => $sueldoSec,
        ':dias' => $dias,
        ':bruto' => $bruto,
        ':desc' => $descuentos,
        ':neto' => $neto,
        ':id' => $data->id
    ]);

    updateHeaderTotals($conn, $data->planilla_secundaria_id);
    echo json_encode(["message" => "Detalle actualizado"]);
}

function updateHeaderTotals($conn, $planillaId) {
    $stmt = $conn->prepare("SELECT SUM(total_bruto) as total_bruto, SUM(neto_pagar) as total_neto FROM planilla_secundaria_detalles WHERE planilla_secundaria_id = ?");
    $stmt->execute([$planillaId]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    $conn->prepare("UPDATE planillas_secundarias SET total_ingresos = ?, total_neto = ? WHERE id = ?")
        ->execute([$r['total_bruto'] ?? 0, $r['total_neto'] ?? 0, $planillaId]);
}

function handleUpdateStatus($conn) {
    $data = json_decode(file_get_contents("php://input"));
    if (!isset($data->id) || !isset($data->estado)) {
        http_response_code(400);
        echo json_encode(["message" => "Faltan datos"]);
        return;
    }
    $estadosValidos = ['Borrador', 'Cerrado', 'Enviado'];
    if (!in_array($data->estado, $estadosValidos)) {
        http_response_code(400);
        echo json_encode(["message" => "Estado no valido"]);
        return;
    }
    $stmt = $conn->prepare("UPDATE planillas_secundarias SET estado = ? WHERE id = ?");
    $stmt->execute([$data->estado, $data->id]);
    echo json_encode(["message" => "Estado actualizado"]);
}

function handleDelete($conn) {
    $id = $_GET['id'];
    $id = (int)$id;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(["message" => "ID inválido"]);
        return;
    }

    $conn->beginTransaction();
    try {
        $conn->prepare("DELETE FROM pagos_planilla_secundaria WHERE planilla_secundaria_id = ?")->execute([$id]);
        $conn->prepare("DELETE FROM planilla_secundaria_detalles WHERE planilla_secundaria_id = ?")->execute([$id]);
        $conn->prepare("DELETE FROM planillas_secundarias WHERE id = ?")->execute([$id]);
        $conn->commit();
        echo json_encode(["message" => "Planilla secundaria eliminada"]);
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        http_response_code(500);
        echo json_encode(["message" => "Error al eliminar: " . $e->getMessage()]);
    }
}

function handleRegistrarPago($conn, $usuario_id = 1) {
    $data = json_decode(file_get_contents("php://input"));
    $detalleId = (int)($data->planilla_secundaria_detalle_id ?? 0);
    if ($detalleId <= 0) {
        http_response_code(400);
        echo json_encode(["message" => "ID de detalle requerido"]);
        return;
    }
    $monto = (float)($data->monto ?? 0);
    if ($monto <= 0) {
        http_response_code(400);
        echo json_encode(["message" => "Monto invalido"]);
        return;
    }

    $conn->beginTransaction();
    try {
        $stmtDet = $conn->prepare("SELECT d.*, p.fecha_inicio, p.fecha_fin FROM planilla_secundaria_detalles d JOIN planillas_secundarias p ON p.id = d.planilla_secundaria_id WHERE d.id = ? FOR UPDATE");
        $stmtDet->execute([$detalleId]);
        $det = $stmtDet->fetch(PDO::FETCH_ASSOC);
        if (!$det) {
            throw new Exception("Detalle no encontrado");
        }

        $stmtSum = $conn->prepare("SELECT IFNULL(SUM(monto), 0) FROM pagos_planilla_secundaria WHERE planilla_secundaria_detalle_id = ?");
        $stmtSum->execute([$detalleId]);
        $pagado = (float)($stmtSum->fetchColumn() ?? 0);
        $pendiente = round(((float)$det['neto_pagar']) - $pagado, 2);
        if ($pendiente < 0) $pendiente = 0;
        if ($monto > $pendiente) {
            throw new Exception("El monto excede el pendiente ({$pendiente})");
        }

        $periodo = date('Y-m', strtotime($det['fecha_inicio']));

        $stmt = $conn->prepare("INSERT INTO pagos_planilla_secundaria (planilla_secundaria_detalle_id, planilla_secundaria_id, colaborador_id, periodo, monto, medio_pago, referencia, origen_id, observaciones, usuario_id, fecha)
            VALUES (:did, :pid, :cid, :per, :monto, :medio, :ref, :origen, :obs, :uid, CURDATE())");
        $stmt->execute([
            ':did' => $detalleId,
            ':pid' => (int)$det['planilla_secundaria_id'],
            ':cid' => (int)$det['colaborador_id'],
            ':per' => $periodo,
            ':monto' => $monto,
            ':medio' => $data->medio_pago ?? null,
            ':ref' => $data->referencia ?? '',
            ':origen' => $data->origen_id ?? null,
            ':obs' => $data->observaciones ?? '',
            ':uid' => $usuario_id
        ]);

        $conn->commit();
        echo json_encode(["message" => "Pago registrado correctamente"]);
    } catch (Exception $e) {
        $conn->rollBack();
        http_response_code(400);
        echo json_encode(["message" => $e->getMessage()]);
    }
}

function handleHistorialPagos($conn) {
    $detalleId = (int)($_GET['id'] ?? 0);
    if ($detalleId <= 0) {
        echo json_encode([]);
        return;
    }
    $sql = "SELECT p.*, u.usuario FROM pagos_planilla_secundaria p LEFT JOIN usuarios u ON p.usuario_id = u.id WHERE p.planilla_secundaria_detalle_id = ? ORDER BY p.fecha DESC, p.id DESC";
    $stmt = $conn->prepare($sql);
    $stmt->execute([$detalleId]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function handleCheckColaboradores($conn) {
    $colExists = false;
    try {
        $check = $conn->query("SHOW COLUMNS FROM colaboradores LIKE 'sueldo_secundario'");
        $colExists = $check->rowCount() > 0;
    } catch (Exception $e) {}

    $total = 0;
    $withSalary = 0;
    $salaries = [];

    try {
        $rows = $conn->query("SELECT id, apellidos, nombres, documento_numero, sueldo_secundario, estado FROM colaboradores WHERE (estado IS NULL OR estado = '' OR LOWER(estado) = 'activo') ORDER BY apellidos, nombres")->fetchAll(PDO::FETCH_ASSOC);
        $total = count($rows);
        foreach ($rows as $r) {
            $val = $r['sueldo_secundario'] ?? null;
            $salaries[] = [
                'id' => (int)$r['id'],
                'nombre' => trim(($r['apellidos'] ?? '') . ' ' . ($r['nombres'] ?? '')),
                'documento' => $r['documento_numero'],
                'sueldo_secundario_raw' => $val,
                'sueldo_secundario' => is_numeric($val) ? (float)$val : 0,
                'estado' => $r['estado']
            ];
            if ($val !== null && is_numeric($val) && (float)$val > 0) {
                $withSalary++;
            }
        }
    } catch (Exception $e) {
        $salaries = ['error' => $e->getMessage()];
    }

    echo json_encode([
        'columna_existe' => $colExists,
        'total_activos' => $total,
        'con_sueldo_secundario' => $withSalary,
        'colaboradores' => $salaries
    ]);
}
