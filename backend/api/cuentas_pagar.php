<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';

header('Content-Type: application/json');

function handleFileUpload($file, $uploadDir = null) {
    if (!isset($file) || $file['error'] !== UPLOAD_ERR_OK) {
        return null;
    }

    $maxBytes = 10 * 1024 * 1024;
    if (isset($file['size']) && (int)$file['size'] > $maxBytes) {
        throw new Exception("El archivo excede el tamaño máximo permitido (10MB)", 400);
    }

    $originalExt = strtolower((string)pathinfo((string)$file['name'], PATHINFO_EXTENSION));
    $allowedExt = ['pdf', 'jpg', 'jpeg', 'png'];
    if ($originalExt === '' || !in_array($originalExt, $allowedExt, true)) {
        throw new Exception("Tipo de archivo no permitido", 400);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']) ?: '';
    $allowedMime = [
        'application/pdf',
        'image/jpeg',
        'image/png'
    ];
    if (!in_array($mime, $allowedMime, true)) {
        throw new Exception("Contenido de archivo no permitido", 400);
    }

    $uploadDirAbs = $uploadDir ? rtrim((string)$uploadDir, DIRECTORY_SEPARATOR) : (__DIR__ . '/../uploads/pagos');
    if (!is_dir($uploadDirAbs)) {
        mkdir($uploadDirAbs, 0755, true);
    }

    $filename = uniqid('pago_') . '.' . $originalExt;
    $destinationAbs = $uploadDirAbs . DIRECTORY_SEPARATOR . $filename;

    if (move_uploaded_file($file['tmp_name'], $destinationAbs)) {
        return 'uploads/pagos/' . $filename;
    }
    return null;
}

function resolveUploadPath(string $storedPath): string {
    $p = str_replace('\\', '/', trim($storedPath));
    if ($p === '') return '';

    if (strpos($p, '../') === 0) {
        $p = ltrim(substr($p, 3), '/');
    }
    if ($p[0] === '/') {
        $p = ltrim($p, '/');
    }
    return $p;
}

function ensureInsideDir(string $fileAbsPath, string $allowedDirAbs): bool {
    $file = realpath($fileAbsPath);
    $dir = realpath($allowedDirAbs);
    if ($file === false || $dir === false) return false;
    $file = rtrim(str_replace('\\', '/', $file), '/');
    $dir = rtrim(str_replace('\\', '/', $dir), '/');
    return strpos($file, $dir . '/') === 0 || $file === $dir;
}

function cxp_compra_tipo_excluido(?string $tipo): bool {
    $t = strtoupper(trim((string)$tipo));
    return in_array($t, ['07', '08'], true);
}

function db_table_exists(PDO $conn, string $table): bool {
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t LIMIT 1");
    $stmt->execute([':t' => $table]);
    return (bool)$stmt->fetchColumn();
}

function db_column_exists(PDO $conn, string $table, string $column): bool {
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c LIMIT 1");
    $stmt->execute([':t' => $table, ':c' => $column]);
    return (bool)$stmt->fetchColumn();
}

function db_add_column(PDO $conn, string $table, string $column, string $definition): void {
    if (db_column_exists($conn, $table, $column)) return;
    $conn->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
}

function cxp_ensure_schema(PDO $conn): void {
    try {
        if (!db_table_exists($conn, 'pagos_proveedores')) return;

        db_add_column($conn, 'pagos_proveedores', 'monto_pago', "DECIMAL(12,2) NULL AFTER monto");
        db_add_column($conn, 'pagos_proveedores', 'moneda_pago', "VARCHAR(3) NULL AFTER monto_pago");
        db_add_column($conn, 'pagos_proveedores', 'tipo_cambio', "DECIMAL(12,6) NULL AFTER moneda_pago");
        db_add_column($conn, 'pagos_proveedores', 'asiento_id', "INT NULL AFTER usuario_id");
        db_add_column($conn, 'pagos_proveedores', 'programacion_id', "INT NULL AFTER asiento_id");
        db_add_column($conn, 'pagos_proveedores', 'conciliado', "TINYINT(1) NOT NULL DEFAULT 1 AFTER banco_movimiento_id");
        db_add_column($conn, 'pagos_proveedores', 'conciliado_at', "TIMESTAMP NULL DEFAULT NULL AFTER conciliado");
        db_add_column($conn, 'pagos_proveedores', 'conciliado_usuario_id', "INT NULL AFTER conciliado_at");
        db_add_column($conn, 'pagos_proveedores', 'constancia_actual_id', "INT NULL AFTER archivo_constancia");

        if (!db_table_exists($conn, 'pagos_proveedores_constancias')) {
            $conn->exec("
                CREATE TABLE pagos_proveedores_constancias (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    pago_id INT NOT NULL,
                    stored_path VARCHAR(255) NOT NULL,
                    drive_file_id INT NULL,
                    mime VARCHAR(80) DEFAULT NULL,
                    original_name VARCHAR(255) DEFAULT NULL,
                    usuario_id INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_pago (pago_id),
                    CONSTRAINT fk_ppc_pago FOREIGN KEY (pago_id) REFERENCES pagos_proveedores(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
        } else {
            db_add_column($conn, 'pagos_proveedores_constancias', 'drive_file_id', "INT NULL AFTER stored_path");
        }

        if (!db_table_exists($conn, 'cxp_programaciones')) {
            $conn->exec("
                CREATE TABLE cxp_programaciones (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    compra_id INT NOT NULL,
                    fecha_programada DATE NOT NULL,
                    monto DECIMAL(12,2) NOT NULL,
                    moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
                    prioridad INT NOT NULL DEFAULT 3,
                    estado ENUM('Programado','Cancelado','Ejecutado') NOT NULL DEFAULT 'Programado',
                    responsable_usuario_id INT NULL,
                    notas TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_compra (compra_id),
                    INDEX idx_fecha (fecha_programada),
                    CONSTRAINT fk_cxp_prog_compra FOREIGN KEY (compra_id) REFERENCES comprobantes_compra(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
        }

        if (!db_table_exists($conn, 'pagos_planilla')) {
            $conn->exec("
                CREATE TABLE pagos_planilla (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    planilla_detalle_id INT NOT NULL,
                    planilla_id INT NOT NULL,
                    colaborador_id INT NOT NULL,
                    periodo VARCHAR(7) NOT NULL,
                    monto DECIMAL(12,2) NOT NULL,
                    medio_pago VARCHAR(50) DEFAULT NULL,
                    referencia VARCHAR(100) DEFAULT NULL,
                    observaciones TEXT DEFAULT NULL,
                    usuario_id INT DEFAULT NULL,
                    fecha DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_planilla_detalle (planilla_detalle_id),
                    INDEX idx_planilla (planilla_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
        }

        if (!db_table_exists($conn, 'pagos_planilla_aportes')) {
            $conn->exec("
                CREATE TABLE pagos_planilla_aportes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    planilla_detalle_id INT NOT NULL,
                    planilla_id INT NOT NULL,
                    colaborador_id INT NOT NULL,
                    periodo VARCHAR(7) NOT NULL,
                    tipo_aporte VARCHAR(20) NOT NULL,
                    monto DECIMAL(12,2) NOT NULL,
                    medio_pago VARCHAR(50) DEFAULT NULL,
                    referencia VARCHAR(100) DEFAULT NULL,
                    observaciones TEXT DEFAULT NULL,
                    usuario_id INT DEFAULT NULL,
                    fecha DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_planilla_detalle (planilla_detalle_id),
                    INDEX idx_planilla (planilla_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
        }
    } catch (Throwable $e) {
    }
}

function cxp_create_asiento_pago(PDO $conn, array $comp, string $medioPago, ?int $origenId, float $montoAplicado, float $tipoCambio, int $usuarioId): ?int {
    try {
        if (!db_table_exists($conn, 'asientos') || !db_table_exists($conn, 'asientos_detalle')) return null;

        $moneda = (string)($comp['moneda'] ?? 'PEN');
        $serie = (string)($comp['serie'] ?? '');
        $numero = (string)($comp['numero'] ?? '');
        $proveedor = (string)($comp['proveedor_razon_social'] ?? '');
        $glosa = "Pago Proveedor {$serie}-{$numero} {$proveedor}";

        $sqlHead = "INSERT INTO asientos (fecha, glosa, tipo_asiento, moneda, tipo_cambio, estado, usuario_id)
                    VALUES (CURDATE(), :glosa, 'PagoProveedor', :moneda, :tc, 'Finalizado', :uid)";
        $conn->prepare($sqlHead)->execute([
            ':glosa' => $glosa,
            ':moneda' => $moneda,
            ':tc' => $tipoCambio > 0 ? $tipoCambio : 1.0,
            ':uid' => $usuarioId
        ]);
        $asientoId = (int)$conn->lastInsertId();

        $ctaBancoCaja = '104';
        if ($medioPago === 'Efectivo') {
            $ctaBancoCaja = '101';
        } elseif ($origenId) {
            $stmt = $conn->prepare("SELECT cuenta_contable FROM bancos_cuentas WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $origenId]);
            $ctaBancoCaja = (string)($stmt->fetchColumn() ?: '104');
        }

        $ctaCxp = '421';

        $sqlDet = "INSERT INTO asientos_detalle (asiento_id, cuenta_codigo, debe, haber) VALUES (:aid, :cta, :debe, :haber)";
        $stmtDet = $conn->prepare($sqlDet);
        $stmtDet->execute([':aid' => $asientoId, ':cta' => $ctaCxp, ':debe' => $montoAplicado, ':haber' => 0]);
        $stmtDet->execute([':aid' => $asientoId, ':cta' => $ctaBancoCaja, ':debe' => 0, ':haber' => $montoAplicado]);

        return $asientoId;
    } catch (Throwable $e) {
        return null;
    }
}

function cxp_delete_asiento(PDO $conn, ?int $asientoId): void {
    if (!$asientoId) return;
    try {
        if (!db_table_exists($conn, 'asientos') || !db_table_exists($conn, 'asientos_detalle')) return;
        $conn->prepare("DELETE FROM asientos_detalle WHERE asiento_id = :id")->execute([':id' => $asientoId]);
        $conn->prepare("DELETE FROM asientos WHERE id = :id")->execute([':id' => $asientoId]);
    } catch (Throwable $e) {
    }
}

function cxp_copy_constancia_to_drive(PDO $conn, int $usuarioId, int $pagoId, int $constanciaId, string $storedPath, ?string $mime, ?string $originalName): ?int {
    try {
        if (!db_table_exists($conn, 'drive_files') || !db_table_exists($conn, 'drive_folders')) return null;
        $driveDir = __DIR__ . '/../uploads/drive';
        if (!is_dir($driveDir)) @mkdir($driveDir, 0755, true);
        if (!is_dir($driveDir) || !is_writable($driveDir)) return null;

        $srcRel = resolveUploadPath($storedPath);
        $srcAbs = __DIR__ . '/../' . $srcRel;
        if (!file_exists($srcAbs)) return null;

        $folderName = 'CxP Constancias';
        $stmt = $conn->prepare("SELECT id FROM drive_folders WHERE parent_id IS NULL AND nombre = :n AND created_by IS NULL LIMIT 1");
        $stmt->execute([':n' => $folderName]);
        $folderId = (int)($stmt->fetchColumn() ?: 0);
        if ($folderId <= 0) {
            $stmt = $conn->prepare("INSERT INTO drive_folders (parent_id, nombre, created_by) VALUES (NULL, :n, NULL)");
            $stmt->execute([':n' => $folderName]);
            $folderId = (int)$conn->lastInsertId();
        }

        $ext = strtolower((string)pathinfo($srcAbs, PATHINFO_EXTENSION));
        $fileName = uniqid('cxp_') . ($ext ? '.' . $ext : '');
        $dstAbs = $driveDir . DIRECTORY_SEPARATOR . $fileName;
        if (!@copy($srcAbs, $dstAbs)) return null;
        $size = @filesize($dstAbs);
        $relPath = 'uploads/drive/' . $fileName;

        $displayName = "Constancia Pago {$pagoId}";
        $stmt = $conn->prepare("
            INSERT INTO drive_files
                (folder_id, nombre, nombre_original, nombre_archivo, ruta_archivo, mime, ext, size_bytes, created_by)
            VALUES
                (:fid, :nombre, :original, :narch, :ruta, :mime, :ext, :size, NULL)
        ");
        $stmt->execute([
            ':fid' => $folderId,
            ':nombre' => $displayName,
            ':original' => $originalName ?: null,
            ':narch' => $fileName,
            ':ruta' => $relPath,
            ':mime' => $mime ?: null,
            ':ext' => $ext ?: null,
            ':size' => $size !== false ? (int)$size : null
        ]);
        $driveId = (int)$conn->lastInsertId();

        if (db_column_exists($conn, 'pagos_proveedores_constancias', 'drive_file_id')) {
            $conn->prepare("UPDATE pagos_proveedores_constancias SET drive_file_id = :df WHERE id = :id")->execute([':df' => $driveId, ':id' => $constanciaId]);
        }
        return $driveId;
    } catch (Throwable $e) {
        return null;
    }
}

function getEmpresaConfig($conn) {
    $stmt = $conn->query("SELECT configuracion_sunat FROM empresa_datos LIMIT 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && !empty($row['configuracion_sunat'])) {
        $cfg = json_decode($row['configuracion_sunat'], true);
        if (json_last_error() === JSON_ERROR_NONE) return $cfg;
    }
    return [];
}
function getEmployerRates($conn) {
    $cfg = getEmpresaConfig($conn);
    $essalud = isset($cfg['essalud_tasa']) && is_numeric($cfg['essalud_tasa']) ? (float)$cfg['essalud_tasa'] : 0.09;
    $vidaLey = isset($cfg['vida_ley_tasa']) && is_numeric($cfg['vida_ley_tasa']) ? (float)$cfg['vida_ley_tasa'] : 0.0053;
    $sctr = isset($cfg['sctr_tasa']) && is_numeric($cfg['sctr_tasa']) ? (float)$cfg['sctr_tasa'] : 0.00;
    return ['essalud_tasa' => $essalud, 'vida_ley_tasa' => $vidaLey, 'sctr_tasa' => $sctr];
}

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

    $method = $_SERVER['REQUEST_METHOD'];
    rbac_require($conn, $userData, 'cuentas_pagar', $method);

    $usuario_id = $userData->id;
    $action = $_GET['action'] ?? '';

    // Helper to get input data (JSON or POST)
    $inputJSON = json_decode(file_get_contents("php://input"), true);
    $data = $inputJSON ?? $_POST;

    cxp_ensure_schema($conn);

    switch ($action) {
        case 'dashboard':
            $porPagar = [];
            $vencido = [];
            $pagadoMes = [];

            $sql = "
                SELECT moneda,
                       SUM(saldo_pendiente) as total_por_pagar,
                       SUM(CASE WHEN fecha_vencimiento < CURDATE() THEN saldo_pendiente ELSE 0 END) as total_vencido
                FROM comprobantes_compra
                WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0
                GROUP BY moneda
            ";
            $stmt = $conn->query($sql);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach (($rows ?: []) as $r) {
                $m = (string)($r['moneda'] ?? 'PEN');
                $porPagar[$m] = (float)($r['total_por_pagar'] ?? 0);
                $vencido[$m] = (float)($r['total_vencido'] ?? 0);
            }

            $sql = "
                SELECT c.moneda, SUM(p.monto) as pagado_mes
                FROM pagos_proveedores p
                JOIN comprobantes_compra c ON c.id = p.compra_id
                WHERE MONTH(p.fecha) = MONTH(CURRENT_DATE())
                  AND YEAR(p.fecha) = YEAR(CURRENT_DATE())
                  AND c.estado != 'Anulado' AND c.tipo_comprobante NOT IN ('07','08')
                GROUP BY c.moneda
            ";
            $stmt = $conn->query($sql);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach (($rows ?: []) as $r) {
                $m = (string)($r['moneda'] ?? 'PEN');
                $pagadoMes[$m] = (float)($r['pagado_mes'] ?? 0);
            }

            echo json_encode([
                "por_pagar" => (object)$porPagar,
                "vencido" => (object)$vencido,
                "pagado_mes" => (object)$pagadoMes,
                "alertas" => [
                    "hoy" => (int)($conn->query("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento = CURDATE()")->fetchColumn() ?: 0),
                    "manana" => (int)($conn->query("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento = DATE_ADD(CURDATE(), INTERVAL 1 DAY)")->fetchColumn() ?: 0),
                    "semana" => (int)($conn->query("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)")->fetchColumn() ?: 0),
                    "vencido" => (int)($conn->query("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento < CURDATE()")->fetchColumn() ?: 0)
                ]
            ]);
            break;

        case 'planilla_secundaria_pendientes':
            $year = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
            $q = trim((string)($_GET['q'] ?? ''));

            $sql = "
                SELECT
                    d.id as planilla_secundaria_detalle_id,
                    p.id as planilla_secundaria_id,
                    DATE_FORMAT(p.fecha_inicio, '%Y-%m') as periodo,
                    p.concepto,
                    CONCAT(TRIM(COALESCE(c.apellidos,'')), ' ', TRIM(COALESCE(c.nombres,''))) as colaborador,
                    c.documento_numero,
                    c.cargo,
                    d.neto_pagar as monto,
                    ROUND(d.neto_pagar - IFNULL(SUM(pg.monto), 0), 2) as monto_pendiente,
                    p.fecha_fin as fecha_vencimiento
                FROM planilla_secundaria_detalles d
                JOIN planillas_secundarias p ON p.id = d.planilla_secundaria_id
                JOIN colaboradores c ON c.id = d.colaborador_id
                LEFT JOIN pagos_planilla_secundaria pg ON pg.planilla_secundaria_detalle_id = d.id
                WHERE p.anio = :year
            ";
            $params = [':year' => $year];
            if ($q !== '') {
                $sql .= " AND (
                    c.documento_numero LIKE :q
                    OR c.nombres LIKE :q
                    OR c.apellidos LIKE :q
                    OR p.concepto LIKE :q
                )";
                $params[':q'] = '%' . $q . '%';
            }
            $sql .= "
                GROUP BY d.id
                HAVING monto_pendiente > 0.009
                ORDER BY p.fecha_inicio DESC, c.apellidos ASC, c.nombres ASC, d.id DESC
            ";

            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => is_array($rows) ? $rows : []]);
            break;

        case 'registrar_pago_planilla_secundaria':
            $detalleId = (int)($data['planilla_secundaria_detalle_id'] ?? 0);
            if ($detalleId <= 0) {
                http_response_code(400);
                echo json_encode(["message" => "ID de detalle requerido"]);
                break;
            }
            $monto = (float)($data['monto'] ?? 0);
            if ($monto <= 0) {
                http_response_code(400);
                echo json_encode(["message" => "Monto inválido"]);
                break;
            }

            $conn->beginTransaction();
            try {
                $stmtDet = $conn->prepare("
                    SELECT d.*, p.fecha_inicio, p.fecha_fin
                    FROM planilla_secundaria_detalles d
                    JOIN planillas_secundarias p ON p.id = d.planilla_secundaria_id
                    WHERE d.id = ?
                    FOR UPDATE
                ");
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
                $stmtIns = $conn->prepare("
                    INSERT INTO pagos_planilla_secundaria
                        (planilla_secundaria_detalle_id, planilla_secundaria_id, colaborador_id, periodo, monto, medio_pago, referencia, observaciones, usuario_id, fecha)
                    VALUES
                        (:did, :pid, :cid, :per, :monto, :medio, :ref, :obs, :uid, CURDATE())
                ");
                $stmtIns->execute([
                    ':did' => $detalleId,
                    ':pid' => (int)$det['planilla_secundaria_id'],
                    ':cid' => (int)$det['colaborador_id'],
                    ':per' => $periodo,
                    ':monto' => $monto,
                    ':medio' => $data['medio_pago'] ?? null,
                    ':ref' => $data['referencia'] ?? '',
                    ':obs' => $data['observaciones'] ?? '',
                    ':uid' => $usuario_id
                ]);

                $conn->commit();
                echo json_encode(["message" => "Pago registrado correctamente"]);
            } catch (Throwable $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                http_response_code(400);
                echo json_encode(["message" => $e->getMessage()]);
            }
            break;

        case 'historial_pagos_planilla_secundaria':
            $detalleId = (int)($_GET['planilla_secundaria_detalle_id'] ?? 0);
            if ($detalleId <= 0) {
                echo json_encode([]);
                break;
            }
            $sql = "
                SELECT p.*, u.usuario
                FROM pagos_planilla_secundaria p
                LEFT JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.planilla_secundaria_detalle_id = ?
                ORDER BY p.fecha DESC, p.id DESC
            ";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$detalleId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(is_array($rows) ? $rows : []);
            break;

        case 'planilla_pendientes':
            $year = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
            $mes = isset($_GET['mes']) ? (int)$_GET['mes'] : 0;
            $q = trim((string)($_GET['q'] ?? ''));

            $sql = "
                SELECT
                    d.id as planilla_detalle_id,
                    p.id as planilla_id,
                    CONCAT(LPAD(p.mes,2,'0'), '/', p.anio) as periodo,
                    CONCAT(TRIM(COALESCE(c.apellidos,'')), ' ', TRIM(COALESCE(c.nombres,''))) as colaborador,
                    c.documento_numero,
                    d.sueldo_base,
                    d.total_bruto,
                    d.total_descuentos,
                    d.neto_pagar as monto,
                    ROUND(COALESCE(d.neto_pagar, 0) - COALESCE((SELECT SUM(monto) FROM pagos_planilla WHERE planilla_detalle_id = d.id), 0), 2) as monto_pendiente
                FROM planilla_detalles d
                JOIN planillas p ON p.id = d.planilla_id
                JOIN colaboradores c ON c.id = d.colaborador_id
                WHERE p.estado = 'Generada' AND p.anio = :year
            ";
            $params = [':year' => $year];
            if ($mes > 0) {
                $sql .= " AND p.mes = :mes";
                $params[':mes'] = $mes;
            }
            if ($q !== '') {
                $sql .= " AND (c.documento_numero LIKE :q OR c.nombres LIKE :q OR c.apellidos LIKE :q)";
                $params[':q'] = '%' . $q . '%';
            }
            $sql .= " HAVING monto_pendiente > 0.009 ORDER BY p.anio DESC, p.mes DESC, c.apellidos ASC, c.nombres ASC";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => is_array($rows) ? $rows : []]);
            break;

        case 'planilla_aportes_pendientes':
            $year = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
            $mes = isset($_GET['mes']) ? (int)$_GET['mes'] : 0;
            $rates = getEmployerRates($conn);
            $essalud = $rates['essalud_tasa'];
            $vidaLey = $rates['vida_ley_tasa'];
            $sctr = $rates['sctr_tasa'];

            $sql = "
                SELECT
                    d.id as planilla_detalle_id,
                    p.id as planilla_id,
                    CONCAT(LPAD(p.mes,2,'0'), '/', p.anio) as periodo,
                    CONCAT(TRIM(COALESCE(c.apellidos,'')), ' ', TRIM(COALESCE(c.nombres,''))) as colaborador,
                    c.documento_numero,
                    ROUND(d.total_bruto * $essalud, 2) as essalud,
                    ROUND(d.total_bruto * $vidaLey, 2) as vida_ley,
                    ROUND(d.total_bruto * $sctr, 2) as sctr,
                    ROUND(d.total_bruto * ($essalud + $vidaLey + $sctr), 2) as total_aporte,
                    ROUND(
                        ROUND(d.total_bruto * ($essalud + $vidaLey + $sctr), 2)
                        - COALESCE((SELECT SUM(monto) FROM pagos_planilla_aportes WHERE planilla_detalle_id = d.id), 0)
                    , 2) as monto_pendiente
                FROM planilla_detalles d
                JOIN planillas p ON p.id = d.planilla_id
                JOIN colaboradores c ON c.id = d.colaborador_id
                WHERE p.estado = 'Generada' AND p.anio = :year
            ";
            $params = [':year' => $year];
            if ($mes > 0) {
                $sql .= " AND p.mes = :mes";
                $params[':mes'] = $mes;
            }
            $sql .= " HAVING monto_pendiente > 0.009 ORDER BY p.anio DESC, p.mes DESC, c.apellidos ASC, c.nombres ASC";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => is_array($rows) ? $rows : []]);
            break;

        case 'registrar_pago_planilla':
            $detalleId = (int)($data['planilla_detalle_id'] ?? 0);
            $monto = (float)($data['monto'] ?? 0);
            if ($detalleId <= 0 || $monto <= 0) {
                http_response_code(400);
                echo json_encode(['message' => 'Datos requeridos']);
                break;
            }
            $conn->beginTransaction();
            try {
                $stmtDet = $conn->prepare("
                    SELECT d.*, p.id as pid, p.mes, p.anio, d.colaborador_id
                    FROM planilla_detalles d
                    JOIN planillas p ON p.id = d.planilla_id
                    WHERE d.id = ? FOR UPDATE
                ");
                $stmtDet->execute([$detalleId]);
                $det = $stmtDet->fetch(PDO::FETCH_ASSOC);
                if (!$det) throw new Exception('Detalle no encontrado');

                $stmtSum = $conn->prepare("SELECT COALESCE(SUM(monto), 0) FROM pagos_planilla WHERE planilla_detalle_id = ?");
                $stmtSum->execute([$detalleId]);
                $pagado = (float)$stmtSum->fetchColumn();
                $pendiente = round((float)$det['neto_pagar'] - $pagado, 2);
                if ($monto > $pendiente) throw new Exception("El monto excede el pendiente ({$pendiente})");

                $periodo = str_pad($det['mes'], 2, '0', STR_PAD_LEFT) . '/' . $det['anio'];
                $stmtIns = $conn->prepare("
                    INSERT INTO pagos_planilla (planilla_detalle_id, planilla_id, colaborador_id, periodo, monto, medio_pago, referencia, observaciones, usuario_id, fecha)
                    VALUES (:did, :pid, :cid, :per, :monto, :medio, :ref, :obs, :uid, CURDATE())
                ");
                $stmtIns->execute([
                    ':did' => $detalleId,
                    ':pid' => (int)$det['pid'],
                    ':cid' => (int)$det['colaborador_id'],
                    ':per' => $periodo,
                    ':monto' => $monto,
                    ':medio' => $data['medio_pago'] ?? null,
                    ':ref' => $data['referencia'] ?? '',
                    ':obs' => $data['observaciones'] ?? '',
                    ':uid' => $usuario_id
                ]);
                $conn->commit();
                echo json_encode(['message' => 'Pago registrado correctamente']);
            } catch (Throwable $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                http_response_code(400);
                echo json_encode(['message' => $e->getMessage()]);
            }
            break;

        case 'historial_pagos_planilla':
            $detalleId = (int)($_GET['planilla_detalle_id'] ?? 0);
            if ($detalleId <= 0) { echo json_encode([]); break; }
            $stmt = $conn->prepare("
                SELECT p.*, u.usuario
                FROM pagos_planilla p
                LEFT JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.planilla_detalle_id = ?
                ORDER BY p.fecha DESC, p.id DESC
            ");
            $stmt->execute([$detalleId]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'registrar_pago_aporte_planilla':
            $detalleId = (int)($data['planilla_detalle_id'] ?? 0);
            $tipoAporte = $data['tipo_aporte'] ?? '';
            $monto = (float)($data['monto'] ?? 0);
            if ($detalleId <= 0 || !in_array($tipoAporte, ['essalud','vida_ley','sctr']) || $monto <= 0) {
                http_response_code(400);
                echo json_encode(['message' => 'Datos requeridos']);
                break;
            }
            $conn->beginTransaction();
            try {
                $stmtDet = $conn->prepare("
                    SELECT d.*, p.id as pid, p.mes, p.anio, d.colaborador_id
                    FROM planilla_detalles d
                    JOIN planillas p ON p.id = d.planilla_id
                    WHERE d.id = ? FOR UPDATE
                ");
                $stmtDet->execute([$detalleId]);
                $det = $stmtDet->fetch(PDO::FETCH_ASSOC);
                if (!$det) throw new Exception('Detalle no encontrado');

                $stmtSum = $conn->prepare("SELECT COALESCE(SUM(monto), 0) FROM pagos_planilla_aportes WHERE planilla_detalle_id = ? AND tipo_aporte = ?");
                $stmtSum->execute([$detalleId, $tipoAporte]);
                $pagado = (float)$stmtSum->fetchColumn();

                $rates2 = ['essalud' => 0.09, 'vida_ley' => 0.0053, 'sctr' => 0.011];
                $totalAporte = round((float)$det['total_bruto'] * $rates2[$tipoAporte], 2);
                $pendiente = round($totalAporte - $pagado, 2);
                if ($monto > $pendiente) throw new Exception("El monto excede el pendiente ({$pendiente})");

                $periodo = str_pad($det['mes'], 2, '0', STR_PAD_LEFT) . '/' . $det['anio'];
                $stmtIns = $conn->prepare("
                    INSERT INTO pagos_planilla_aportes (planilla_detalle_id, planilla_id, colaborador_id, periodo, tipo_aporte, monto, medio_pago, referencia, observaciones, usuario_id, fecha)
                    VALUES (:did, :pid, :cid, :per, :tipo, :monto, :medio, :ref, :obs, :uid, CURDATE())
                ");
                $stmtIns->execute([
                    ':did' => $detalleId,
                    ':pid' => (int)$det['pid'],
                    ':cid' => (int)$det['colaborador_id'],
                    ':per' => $periodo,
                    ':tipo' => $tipoAporte,
                    ':monto' => $monto,
                    ':medio' => $data['medio_pago'] ?? null,
                    ':ref' => $data['referencia'] ?? '',
                    ':obs' => $data['observaciones'] ?? '',
                    ':uid' => $usuario_id
                ]);
                $conn->commit();
                echo json_encode(['message' => 'Pago registrado correctamente']);
            } catch (Throwable $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                http_response_code(400);
                echo json_encode(['message' => $e->getMessage()]);
            }
            break;

        case 'historial_pagos_aporte_planilla':
            $detalleId = (int)($_GET['planilla_detalle_id'] ?? 0);
            $tipoAporte = $_GET['tipo_aporte'] ?? '';
            if ($detalleId <= 0 || !in_array($tipoAporte, ['essalud','vida_ley','sctr'])) { echo json_encode([]); break; }
            $stmt = $conn->prepare("
                SELECT p.*, u.usuario
                FROM pagos_planilla_aportes p
                LEFT JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.planilla_detalle_id = ? AND p.tipo_aporte = ?
                ORDER BY p.fecha DESC, p.id DESC
            ");
            $stmt->execute([$detalleId, $tipoAporte]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'descargar_constancia':
            $pagoId = (int)($_GET['id'] ?? 0);
            if ($pagoId <= 0) {
                http_response_code(400);
                echo json_encode(["message" => "ID requerido"]);
                break;
            }

            $stmt = $conn->prepare("SELECT archivo_constancia FROM pagos_proveedores WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $pagoId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $stored = $row['archivo_constancia'] ?? '';
            if (!$stored) {
                http_response_code(404);
                echo json_encode(["message" => "Archivo no encontrado"]);
                break;
            }

            $rel = resolveUploadPath((string)$stored);
            $full = __DIR__ . '/../' . $rel;
            $uploadsDir = __DIR__ . '/../uploads/pagos';
            if (!file_exists($full) || !ensureInsideDir($full, $uploadsDir)) {
                http_response_code(404);
                echo json_encode(["message" => "Archivo no encontrado"]);
                break;
            }

            $ext = strtolower((string)pathinfo($full, PATHINFO_EXTENSION));
            $ctype = 'application/octet-stream';
            if ($ext === 'pdf') $ctype = 'application/pdf';
            if ($ext === 'jpg' || $ext === 'jpeg') $ctype = 'image/jpeg';
            if ($ext === 'png') $ctype = 'image/png';

            header_remove('Content-Type');
            header('Content-Type: ' . $ctype);
            header('Content-Length: ' . (string)filesize($full));
            header('Content-Disposition: inline; filename="constancia_' . $pagoId . '.' . $ext . '"');
            readfile($full);
            exit;

        case 'buscar_usuarios':
            $q = trim((string)($_GET['q'] ?? ''));
            if (strlen($q) < 2) {
                echo json_encode(['usuarios' => []]);
                break;
            }
            $stmt = $conn->prepare("
                SELECT id, usuario, email, rol_id, status
                FROM usuarios
                WHERE status = 'activo' AND (usuario LIKE :q OR email LIKE :q)
                ORDER BY usuario ASC
                LIMIT 15
            ");
            $stmt->execute([':q' => '%' . $q . '%']);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['usuarios' => is_array($rows) ? $rows : []]);
            break;

        case 'alertas':
            $hoy = date('Y-m-d');
            $manana = date('Y-m-d', strtotime('+1 day'));
            $semana = date('Y-m-d', strtotime('+7 day'));

            $stmt = $conn->prepare("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento < :hoy");
            $stmt->execute([':hoy' => $hoy]);
            $countVencido = (int)($stmt->fetchColumn() ?: 0);

            $stmt = $conn->prepare("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento = :hoy");
            $stmt->execute([':hoy' => $hoy]);
            $countHoy = (int)($stmt->fetchColumn() ?: 0);

            $stmt = $conn->prepare("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento = :manana");
            $stmt->execute([':manana' => $manana]);
            $countManana = (int)($stmt->fetchColumn() ?: 0);

            $stmt = $conn->prepare("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento BETWEEN :hoy AND :semana");
            $stmt->execute([':hoy' => $hoy, ':semana' => $semana]);
            $countSemana = (int)($stmt->fetchColumn() ?: 0);

            $tipo = (string)($_GET['tipo'] ?? 'vencido'); // vencido|hoy|manana|semana
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = (int)($_GET['limit'] ?? 25);
            if ($limit < 1) $limit = 25;
            if ($limit > 100) $limit = 100;
            $offset = ($page - 1) * $limit;

            $where = "estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0";
            $params = [];
            if ($tipo === 'hoy') {
                $where .= " AND fecha_vencimiento = :d";
                $params[':d'] = $hoy;
            } elseif ($tipo === 'manana') {
                $where .= " AND fecha_vencimiento = :d";
                $params[':d'] = $manana;
            } elseif ($tipo === 'semana') {
                $where .= " AND fecha_vencimiento BETWEEN :d1 AND :d2";
                $params[':d1'] = $hoy;
                $params[':d2'] = $semana;
            } else {
                $where .= " AND fecha_vencimiento < :d";
                $params[':d'] = $hoy;
            }

            $stmt = $conn->prepare("SELECT COUNT(*) FROM comprobantes_compra WHERE $where");
            $stmt->execute($params);
            $total = (int)($stmt->fetchColumn() ?: 0);

            $sql = "SELECT id, fecha_emision, fecha_vencimiento, serie, numero, proveedor_razon_social, proveedor_num_doc, moneda, importe_total, saldo_pendiente,
                           DATEDIFF(CURDATE(), fecha_vencimiento) as dias_retraso, estado_pago
                    FROM comprobantes_compra
                    WHERE $where
                    ORDER BY fecha_vencimiento ASC, id ASC
                    LIMIT :lim OFFSET :off";
            $stmt = $conn->prepare($sql);
            foreach ($params as $k => $v) $stmt->bindValue($k, $v);
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'resumen' => [
                    'vencido' => $countVencido,
                    'hoy' => $countHoy,
                    'manana' => $countManana,
                    'semana' => $countSemana
                ],
                'data' => is_array($rows) ? $rows : [],
                'meta' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int)ceil($total / $limit) : 1
                ]
            ]);
            break;

        case 'crear_programacion':
            $compraId = (int)($data['compra_id'] ?? 0);
            $fecha = (string)($data['fecha_programada'] ?? '');
            $monto = (float)($data['monto'] ?? 0);
            $moneda = strtoupper((string)($data['moneda'] ?? 'PEN'));
            $prioridad = (int)($data['prioridad'] ?? 3);
            $responsable = isset($data['responsable_usuario_id']) ? (int)$data['responsable_usuario_id'] : null;
            $notas = (string)($data['notas'] ?? '');
            if ($compraId <= 0 || $fecha === '' || $monto <= 0) {
                throw new Exception("Datos incompletos", 400);
            }
            $stmt = $conn->prepare("SELECT id, moneda, saldo_pendiente, estado, tipo_comprobante FROM comprobantes_compra WHERE id = :id");
            $stmt->execute([':id' => $compraId]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$comp || ($comp['estado'] ?? '') === 'Anulado') throw new Exception("Comprobante inválido", 400);
            if (cxp_compra_tipo_excluido($comp['tipo_comprobante'] ?? null)) throw new Exception("No se puede programar notas de crédito/débito en CxP", 400);
            if ($monto > (float)$comp['saldo_pendiente']) throw new Exception("Monto excede saldo pendiente", 400);
            if ($moneda !== '' && $comp['moneda'] && strtoupper((string)$comp['moneda']) !== $moneda) {
                throw new Exception("Moneda de programación no coincide con la del comprobante", 400);
            }
            if ($prioridad < 1) $prioridad = 1;
            if ($prioridad > 5) $prioridad = 5;

            $stmt = $conn->prepare("
                INSERT INTO cxp_programaciones (compra_id, fecha_programada, monto, moneda, prioridad, estado, responsable_usuario_id, notas)
                VALUES (:cid, :fecha, :monto, :moneda, :prio, 'Programado', :resp, :notas)
            ");
            $stmt->execute([
                ':cid' => $compraId,
                ':fecha' => $fecha,
                ':monto' => $monto,
                ':moneda' => $moneda ?: (string)($comp['moneda'] ?? 'PEN'),
                ':prio' => $prioridad,
                ':resp' => $responsable ?: null,
                ':notas' => $notas
            ]);
            echo json_encode(['message' => 'Programación creada', 'id' => (int)$conn->lastInsertId()]);
            break;

        case 'actualizar_programacion':
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) throw new Exception("ID requerido", 400);
            $fecha = (string)($data['fecha_programada'] ?? '');
            $monto = isset($data['monto']) ? (float)$data['monto'] : null;
            $prioridad = isset($data['prioridad']) ? (int)$data['prioridad'] : null;
            $responsable = array_key_exists('responsable_usuario_id', $data) ? (int)$data['responsable_usuario_id'] : null;
            $notas = array_key_exists('notas', $data) ? (string)$data['notas'] : null;

            $stmt = $conn->prepare("SELECT p.*, c.saldo_pendiente, c.estado as compra_estado FROM cxp_programaciones p JOIN comprobantes_compra c ON c.id = p.compra_id WHERE p.id = :id");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) throw new Exception("Programación no encontrada", 404);
            if (($row['estado'] ?? '') !== 'Programado') throw new Exception("Solo se puede editar si está Programado", 400);

            $updates = [];
            $params = [':id' => $id];
            if ($fecha !== '') { $updates[] = "fecha_programada = :fecha"; $params[':fecha'] = $fecha; }
            if ($monto !== null) {
                if ($monto <= 0) throw new Exception("Monto inválido", 400);
                if ($monto > (float)$row['saldo_pendiente']) throw new Exception("Monto excede saldo pendiente", 400);
                $updates[] = "monto = :monto"; $params[':monto'] = $monto;
            }
            if ($prioridad !== null) {
                if ($prioridad < 1) $prioridad = 1;
                if ($prioridad > 5) $prioridad = 5;
                $updates[] = "prioridad = :prio"; $params[':prio'] = $prioridad;
            }
            if (array_key_exists('responsable_usuario_id', $data)) { $updates[] = "responsable_usuario_id = :resp"; $params[':resp'] = $responsable ?: null; }
            if ($notas !== null) { $updates[] = "notas = :notas"; $params[':notas'] = $notas; }
            if (!$updates) { echo json_encode(['message' => 'Sin cambios']); break; }
            $sql = "UPDATE cxp_programaciones SET " . implode(', ', $updates) . " WHERE id = :id";
            $conn->prepare($sql)->execute($params);
            echo json_encode(['message' => 'Programación actualizada']);
            break;

        case 'cancelar_programacion':
            $id = (int)($_GET['id'] ?? ($data['id'] ?? 0));
            if ($id <= 0) throw new Exception("ID requerido", 400);
            $stmt = $conn->prepare("UPDATE cxp_programaciones SET estado = 'Cancelado' WHERE id = :id AND estado = 'Programado'");
            $stmt->execute([':id' => $id]);
            echo json_encode(['message' => 'Programación cancelada']);
            break;

        case 'listar_programaciones':
            $estado = strtoupper(trim((string)($_GET['estado'] ?? 'PROGRAMADO')));
            $q = trim((string)($_GET['q'] ?? ''));
            $desde = trim((string)($_GET['desde'] ?? ''));
            $hasta = trim((string)($_GET['hasta'] ?? ''));
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = (int)($_GET['limit'] ?? 25);
            if ($limit < 1) $limit = 25;
            if ($limit > 100) $limit = 100;
            $offset = ($page - 1) * $limit;

            $where = ["p.estado IN ('Programado','Cancelado','Ejecutado')", "c.estado != 'Anulado'", "c.tipo_comprobante NOT IN ('07','08')"];
            $params = [];
            if ($estado === 'CANCELADO') $where[] = "p.estado = 'Cancelado'";
            elseif ($estado === 'EJECUTADO') $where[] = "p.estado = 'Ejecutado'";
            else $where[] = "p.estado = 'Programado'";

            if ($q !== '') {
                $where[] = "(c.proveedor_razon_social LIKE :q OR c.proveedor_num_doc LIKE :q OR CONCAT(c.serie,'-',c.numero) LIKE :q)";
                $params[':q'] = '%' . $q . '%';
            }
            if ($desde !== '') { $where[] = "p.fecha_programada >= :d"; $params[':d'] = $desde; }
            if ($hasta !== '') { $where[] = "p.fecha_programada <= :h"; $params[':h'] = $hasta; }

            $whereSql = ' WHERE ' . implode(' AND ', $where);

            $stmt = $conn->prepare("SELECT COUNT(*) FROM cxp_programaciones p JOIN comprobantes_compra c ON c.id = p.compra_id" . $whereSql);
            $stmt->execute($params);
            $total = (int)($stmt->fetchColumn() ?: 0);

            $sql = "
                SELECT p.*, c.serie, c.numero, c.fecha_emision, c.fecha_vencimiento, c.proveedor_razon_social, c.proveedor_num_doc, c.moneda as moneda_compra, c.saldo_pendiente,
                       u.usuario as responsable_usuario
                FROM cxp_programaciones p
                JOIN comprobantes_compra c ON c.id = p.compra_id
                LEFT JOIN usuarios u ON u.id = p.responsable_usuario_id
                $whereSql
                ORDER BY p.fecha_programada ASC, p.prioridad ASC, p.id DESC
                LIMIT :lim OFFSET :off
            ";
            $stmt = $conn->prepare($sql);
            foreach ($params as $k => $v) $stmt->bindValue($k, $v);
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'data' => is_array($rows) ? $rows : [],
                'meta' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int)ceil($total / $limit) : 1
                ]
            ]);
            break;

        case 'proveedor_resumen':
            $doc = trim((string)($_GET['doc'] ?? ''));
            if ($doc === '') throw new Exception("RUC requerido", 400);

            $stmt = $conn->prepare("
                SELECT moneda,
                       SUM(saldo_pendiente) as total_pendiente,
                       SUM(CASE WHEN fecha_vencimiento < CURDATE() THEN saldo_pendiente ELSE 0 END) as total_vencido,
                       COUNT(*) as cantidad
                FROM comprobantes_compra
                WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND proveedor_num_doc = :doc AND saldo_pendiente > 0
                GROUP BY moneda
            ");
            $stmt->execute([':doc' => $doc]);
            $totales = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $invPage = max(1, (int)($_GET['inv_page'] ?? 1));
            $invLimit = (int)($_GET['inv_limit'] ?? 25);
            if ($invLimit < 1) $invLimit = 25;
            if ($invLimit > 100) $invLimit = 100;
            $invOffset = ($invPage - 1) * $invLimit;

            $stmt = $conn->prepare("SELECT COUNT(*) FROM comprobantes_compra WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND proveedor_num_doc = :doc");
            $stmt->execute([':doc' => $doc]);
            $invTotal = (int)($stmt->fetchColumn() ?: 0);

            $stmt = $conn->prepare("
                SELECT id, fecha_emision, fecha_vencimiento, serie, numero, moneda, importe_total, saldo_pendiente, estado_pago,
                       DATEDIFF(CURDATE(), fecha_vencimiento) as dias_retraso
                FROM comprobantes_compra
                WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND proveedor_num_doc = :doc
                ORDER BY fecha_emision DESC, id DESC
                LIMIT :lim OFFSET :off
            ");
            $stmt->bindValue(':doc', $doc);
            $stmt->bindValue(':lim', $invLimit, PDO::PARAM_INT);
            $stmt->bindValue(':off', $invOffset, PDO::PARAM_INT);
            $stmt->execute();
            $facturas = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $payPage = max(1, (int)($_GET['pay_page'] ?? 1));
            $payLimit = (int)($_GET['pay_limit'] ?? 25);
            if ($payLimit < 1) $payLimit = 25;
            if ($payLimit > 100) $payLimit = 100;
            $payOffset = ($payPage - 1) * $payLimit;

            $stmt = $conn->prepare("
                SELECT COUNT(*)
                FROM pagos_proveedores p
                JOIN comprobantes_compra c ON c.id = p.compra_id
                WHERE c.estado != 'Anulado' AND c.tipo_comprobante NOT IN ('07','08') AND c.proveedor_num_doc = :doc
            ");
            $stmt->execute([':doc' => $doc]);
            $payTotal = (int)($stmt->fetchColumn() ?: 0);

            $stmt = $conn->prepare("
                SELECT p.id, p.fecha, p.monto, p.monto_pago, p.moneda_pago, p.tipo_cambio, p.medio_pago, p.referencia, p.observaciones, p.conciliado,
                       c.serie, c.numero, c.moneda as moneda_compra,
                       u.usuario as usuario
                FROM pagos_proveedores p
                JOIN comprobantes_compra c ON c.id = p.compra_id
                LEFT JOIN usuarios u ON u.id = p.usuario_id
                WHERE c.estado != 'Anulado' AND c.tipo_comprobante NOT IN ('07','08') AND c.proveedor_num_doc = :doc
                ORDER BY p.fecha DESC, p.id DESC
                LIMIT :lim OFFSET :off
            ");
            $stmt->bindValue(':doc', $doc);
            $stmt->bindValue(':lim', $payLimit, PDO::PARAM_INT);
            $stmt->bindValue(':off', $payOffset, PDO::PARAM_INT);
            $stmt->execute();
            $pagos = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'totales' => is_array($totales) ? $totales : [],
                'facturas' => [
                    'data' => is_array($facturas) ? $facturas : [],
                    'meta' => [
                        'total' => $invTotal,
                        'page' => $invPage,
                        'limit' => $invLimit,
                        'total_pages' => $invLimit > 0 ? (int)ceil($invTotal / $invLimit) : 1
                    ]
                ],
                'pagos' => [
                    'data' => is_array($pagos) ? $pagos : [],
                    'meta' => [
                        'total' => $payTotal,
                        'page' => $payPage,
                        'limit' => $payLimit,
                        'total_pages' => $payLimit > 0 ? (int)ceil($payTotal / $payLimit) : 1
                    ]
                ]
            ]);
            break;

        case 'conciliacion_sugerencias':
            $cuentaId = (int)($_GET['cuenta_id'] ?? 0);
            $desde = trim((string)($_GET['desde'] ?? ''));
            $hasta = trim((string)($_GET['hasta'] ?? ''));
            if ($cuentaId <= 0 || $desde === '' || $hasta === '') throw new Exception("Cuenta y rango de fechas requeridos", 400);

            $sql = "
                SELECT
                    bm.id as banco_movimiento_id,
                    bm.fecha,
                    bm.monto,
                    bm.referencia,
                    bm.concepto,
                    bm.entidad,
                    p.id as pago_id,
                    p.fecha as pago_fecha,
                    p.monto_pago,
                    p.moneda_pago,
                    p.conciliado,
                    p.referencia as pago_referencia,
                    c.serie,
                    c.numero,
                    c.proveedor_razon_social
                FROM bancos_movimientos bm
                LEFT JOIN pagos_proveedores p
                  ON (p.banco_movimiento_id = bm.id)
                  OR (
                        (p.banco_movimiento_id IS NULL OR p.banco_movimiento_id = 0)
                        AND (p.conciliado = 0 OR p.conciliado IS NULL)
                        AND ABS(IFNULL(p.monto_pago, p.monto) - bm.monto) < 0.01
                        AND (
                            (bm.referencia IS NOT NULL AND bm.referencia <> '' AND p.referencia LIKE CONCAT('%', bm.referencia, '%'))
                            OR (p.referencia IS NOT NULL AND p.referencia <> '' AND bm.referencia LIKE CONCAT('%', p.referencia, '%'))
                            OR (bm.referencia IS NULL OR bm.referencia = '')
                        )
                  )
                LEFT JOIN comprobantes_compra c ON c.id = p.compra_id
                WHERE bm.cuenta_id = :cid
                  AND bm.tipo = 'Egreso'
                  AND DATE(bm.fecha) BETWEEN :d AND :h
                ORDER BY bm.fecha DESC, bm.id DESC
                LIMIT 300
            ";
            $stmt = $conn->prepare($sql);
            $stmt->execute([':cid' => $cuentaId, ':d' => $desde, ':h' => $hasta]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => is_array($rows) ? $rows : []]);
            break;

        case 'marcar_conciliado':
            $pagoId = (int)($data['pago_id'] ?? 0);
            $bancoMovId = isset($data['banco_movimiento_id']) ? (int)$data['banco_movimiento_id'] : 0;
            if ($pagoId <= 0) throw new Exception("Pago requerido", 400);
            $sql = "UPDATE pagos_proveedores
                    SET conciliado = 1, conciliado_at = NOW(), conciliado_usuario_id = :uid" . ($bancoMovId > 0 ? ", banco_movimiento_id = :bm" : "") . "
                    WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $params = [':uid' => $usuario_id, ':id' => $pagoId];
            if ($bancoMovId > 0) $params[':bm'] = $bancoMovId;
            $stmt->execute($params);
            echo json_encode(['message' => 'Conciliado']);
            break;

        case 'listar_pendientes':
            $q = trim((string)($_GET['q'] ?? ''));
            $proveedor = trim((string)($_GET['proveedor'] ?? ''));
            $estado_filter = (string)($_GET['estado_filter'] ?? ''); // vencido, al_dia, todos
            $moneda = strtoupper(trim((string)($_GET['moneda'] ?? '')));
            $fecha_venc_desde = trim((string)($_GET['venc_desde'] ?? ''));
            $fecha_venc_hasta = trim((string)($_GET['venc_hasta'] ?? ''));
            $fecha_emi_desde = trim((string)($_GET['emi_desde'] ?? ''));
            $fecha_emi_hasta = trim((string)($_GET['emi_hasta'] ?? ''));
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = (int)($_GET['limit'] ?? 25);
            if ($limit < 1) $limit = 25;
            if ($limit > 100) $limit = 100;
            $offset = ($page - 1) * $limit;

            $where = ["estado != 'Anulado'", "tipo_comprobante NOT IN ('07','08')", "saldo_pendiente > 0"];
            $params = [];

            if ($proveedor !== '') {
                $where[] = "(proveedor_razon_social LIKE :prov OR proveedor_num_doc LIKE :prov)";
                $params[':prov'] = '%' . $proveedor . '%';
            }
            if ($q !== '') {
                $where[] = "(
                    proveedor_razon_social LIKE :q
                    OR proveedor_num_doc LIKE :q
                    OR CONCAT(serie,'-',numero) LIKE :q
                    OR serie LIKE :q
                    OR numero LIKE :q
                )";
                $params[':q'] = '%' . $q . '%';
            }
            if ($moneda !== '') {
                $where[] = "moneda = :moneda";
                $params[':moneda'] = $moneda;
            }
            if ($estado_filter === 'vencido') {
                $where[] = "fecha_vencimiento < CURDATE()";
            } elseif ($estado_filter === 'al_dia') {
                $where[] = "fecha_vencimiento >= CURDATE()";
            }
            if ($fecha_venc_desde !== '') {
                $where[] = "fecha_vencimiento >= :vdes";
                $params[':vdes'] = $fecha_venc_desde;
            }
            if ($fecha_venc_hasta !== '') {
                $where[] = "fecha_vencimiento <= :vhas";
                $params[':vhas'] = $fecha_venc_hasta;
            }
            if ($fecha_emi_desde !== '') {
                $where[] = "fecha_emision >= :edes";
                $params[':edes'] = $fecha_emi_desde;
            }
            if ($fecha_emi_hasta !== '') {
                $where[] = "fecha_emision <= :ehas";
                $params[':ehas'] = $fecha_emi_hasta;
            }

            $whereSql = ' WHERE ' . implode(' AND ', $where);

            $sqlCount = "SELECT COUNT(*) FROM comprobantes_compra" . $whereSql;
            $stmt = $conn->prepare($sqlCount);
            $stmt->execute($params);
            $total = (int)($stmt->fetchColumn() ?: 0);

            $sql = "SELECT id, fecha_emision, fecha_vencimiento, serie, numero,
                           proveedor_razon_social, proveedor_num_doc, moneda, importe_total, saldo_pendiente,
                           DATEDIFF(CURDATE(), fecha_vencimiento) as dias_retraso, estado_pago
                    FROM comprobantes_compra
                    $whereSql
                    ORDER BY fecha_vencimiento ASC, id ASC
                    LIMIT :lim OFFSET :off";
            $stmt = $conn->prepare($sql);
            foreach ($params as $k => $v) $stmt->bindValue($k, $v);
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'data' => is_array($rows) ? $rows : [],
                'meta' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int)ceil($total / $limit) : 1
                ]
            ]);
            break;

        case 'historial_pagos':
            $compra_id = $_GET['id'] ?? 0;
            if (!$compra_id) {
                http_response_code(400);
                echo json_encode(["message" => "ID de compra requerido"]);
                break;
            }

            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = (int)($_GET['limit'] ?? 50);
            if ($limit < 1) $limit = 50;
            if ($limit > 200) $limit = 200;
            $offset = ($page - 1) * $limit;

            $stmt = $conn->prepare("SELECT COUNT(*) FROM pagos_proveedores WHERE compra_id = :cid");
            $stmt->execute([':cid' => $compra_id]);
            $total = (int)($stmt->fetchColumn() ?: 0);

            $sql = "SELECT p.*, u.usuario as usuario
                    FROM pagos_proveedores p
                    LEFT JOIN usuarios u ON p.usuario_id = u.id
                    WHERE p.compra_id = :cid
                    ORDER BY p.fecha DESC, p.id DESC
                    LIMIT :lim OFFSET :off";
            $stmt = $conn->prepare($sql);
            $stmt->bindValue(':cid', $compra_id, PDO::PARAM_INT);
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'data' => is_array($rows) ? $rows : [],
                'meta' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => $limit > 0 ? (int)ceil($total / $limit) : 1
                ]
            ]);
            break;

        case 'registrar_pago':
            $conn->beginTransaction();

            // 1. Validar Compra
            $stmt = $conn->prepare("SELECT * FROM comprobantes_compra WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $data['compra_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$comp) throw new Exception("Comprobante de compra no encontrado", 400);
            if (($comp['estado'] ?? '') === 'Anulado') throw new Exception("Comprobante anulado", 400);
            if (cxp_compra_tipo_excluido($comp['tipo_comprobante'] ?? null)) throw new Exception("No se puede registrar pago para notas de crédito/débito en CxP", 400);

            $montoInput = (float)($data['monto'] ?? 0);
            if ($montoInput <= 0) throw new Exception("Monto inválido", 400);

            $monedaComp = strtoupper((string)($comp['moneda'] ?? 'PEN'));
            $monedaPago = strtoupper(trim((string)($data['moneda_pago'] ?? '')));
            if ($monedaPago === '') $monedaPago = $monedaComp;
            $allowConversion = !empty($data['allow_conversion']) ? 1 : 0;
            $tipoCambio = (float)($data['tipo_cambio'] ?? 0);
            if ($tipoCambio <= 0) $tipoCambio = 1.0;

            $montoPago = $montoInput;
            $montoAplicado = $montoInput;

            if ($monedaPago !== $monedaComp) {
                if (!$allowConversion || $tipoCambio <= 0) throw new Exception("Tipo de cambio requerido para conversión", 400);

                if ($monedaComp === 'USD' && $monedaPago === 'PEN') {
                    $montoAplicado = round($montoPago / $tipoCambio, 2);
                } elseif ($monedaComp === 'PEN' && $monedaPago === 'USD') {
                    $montoAplicado = round($montoPago * $tipoCambio, 2);
                } else {
                    $montoAplicado = round($montoPago * $tipoCambio, 2);
                }
            }

            if ($montoAplicado <= 0) throw new Exception("Monto aplicado inválido", 400);
            if ($montoAplicado > (float)$comp['saldo_pendiente']) {
                throw new Exception("El monto excede el saldo pendiente ({$comp['saldo_pendiente']})", 400);
            }

            $medioPago = (string)($data['medio_pago'] ?? '');
            $origenId = isset($data['origen_id']) && $data['origen_id'] !== '' ? (int)$data['origen_id'] : null;

            $caja_mov_id = null;
            $banco_mov_id = null;

            if ($medioPago === 'Efectivo') {
                if ($monedaPago !== 'PEN') throw new Exception("Efectivo solo permite moneda PEN", 400);

                if (!$origenId) {
                    $stmt = $conn->prepare("SELECT id FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' ORDER BY id DESC LIMIT 1");
                    $stmt->execute([':uid' => $usuario_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$sesion) throw new Exception("No tienes una caja abierta para realizar pagos en efectivo.", 400);
                    $caja_sesion_id = (int)$sesion['id'];
                } else {
                    $stmt = $conn->prepare("SELECT id FROM caja_sesiones WHERE id = :id AND usuario_id = :uid AND estado = 'Abierta' LIMIT 1");
                    $stmt->execute([':id' => $origenId, ':uid' => $usuario_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$sesion) throw new Exception("Caja inválida o no tienes una caja abierta con ese origen.", 400);
                    $caja_sesion_id = (int)$sesion['id'];
                }

                $concepto = "Pago Factura Compra {$comp['serie']}-{$comp['numero']}";
                $sqlCaja = "INSERT INTO caja_movimientos (sesion_id, tipo, monto, concepto, usuario_id, fecha)
                            VALUES (:sid, 'Egreso', :monto, :conc, :uid, NOW())";
                $conn->prepare($sqlCaja)->execute([
                    ':sid' => $caja_sesion_id,
                    ':monto' => $montoPago,
                    ':conc' => $concepto,
                    ':uid' => $usuario_id
                ]);
                $caja_mov_id = (int)$conn->lastInsertId();
            } elseif (in_array($medioPago, ['Transferencia', 'Cheque', 'Deposito'], true)) {
                if (!$origenId) throw new Exception("Debe seleccionar una cuenta bancaria de origen", 400);

                $stmt = $conn->prepare("SELECT id, moneda, cuenta_contable FROM bancos_cuentas WHERE id = :id FOR UPDATE");
                $stmt->execute([':id' => $origenId]);
                $cuenta = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$cuenta) throw new Exception("Cuenta bancaria de origen no encontrada", 400);
                $monedaCuenta = strtoupper((string)($cuenta['moneda'] ?? ''));
                if ($monedaCuenta !== '' && $monedaCuenta !== $monedaPago) {
                    throw new Exception("La moneda de la cuenta ($monedaCuenta) no coincide con la moneda del pago ($monedaPago)", 400);
                }

                $concepto = "Pago Factura Compra {$comp['serie']}-{$comp['numero']} ({$data['referencia']})";
                $sqlBanco = "INSERT INTO bancos_movimientos (cuenta_id, tipo, origen_destino, monto, concepto, referencia, entidad, usuario_id, fecha)
                             VALUES (:cid, 'Egreso', :origen, :monto, :conc, :ref, :entidad, :uid, NOW())";
                $conn->prepare($sqlBanco)->execute([
                    ':cid' => $origenId,
                    ':origen' => 'Proveedor',
                    ':monto' => $montoPago,
                    ':conc' => $concepto,
                    ':ref' => $data['referencia'] ?? '',
                    ':entidad' => $comp['proveedor_razon_social'],
                    ':uid' => $usuario_id
                ]);
                $banco_mov_id = (int)$conn->lastInsertId();

                $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :monto WHERE id = :id")
                     ->execute([':monto' => $montoPago, ':id' => $origenId]);
            } else {
                throw new Exception("Medio de pago inválido", 400);
            }

            $asientoId = cxp_create_asiento_pago($conn, $comp, $medioPago, $origenId, $montoAplicado, $tipoCambio, $usuario_id);

            $archivoPath = null;
            if (isset($_FILES['archivo'])) {
                $archivoPath = handleFileUpload($_FILES['archivo']);
            }

            $programacionId = isset($data['programacion_id']) ? (int)$data['programacion_id'] : null;

            $sql = "INSERT INTO pagos_proveedores (
                        compra_id, monto, monto_pago, moneda_pago, tipo_cambio,
                        medio_pago, referencia, origen_id, observaciones, usuario_id,
                        asiento_id, programacion_id,
                        caja_movimiento_id, banco_movimiento_id,
                        archivo_constancia, conciliado, conciliado_at, conciliado_usuario_id
                    ) VALUES (
                        :cid, :monto, :monto_pago, :moneda_pago, :tc,
                        :medio, :ref, :origen, :obs, :uid,
                        :asiento_id, :programacion_id,
                        :caja_id, :banco_id,
                        :archivo, 1, NOW(), :conc_uid
                    )";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':cid' => (int)$data['compra_id'],
                ':monto' => $montoAplicado,
                ':monto_pago' => $montoPago,
                ':moneda_pago' => $monedaPago,
                ':tc' => $tipoCambio,
                ':medio' => $medioPago,
                ':ref' => $data['referencia'] ?? '',
                ':origen' => $origenId,
                ':obs' => $data['observaciones'] ?? '',
                ':uid' => $usuario_id,
                ':asiento_id' => $asientoId,
                ':programacion_id' => $programacionId,
                ':caja_id' => $caja_mov_id,
                ':banco_id' => $banco_mov_id,
                ':archivo' => $archivoPath,
                ':conc_uid' => $usuario_id
            ]);
            $pagoId = (int)$conn->lastInsertId();

            if ($archivoPath && db_table_exists($conn, 'pagos_proveedores_constancias')) {
                $ext = strtolower((string)pathinfo($archivoPath, PATHINFO_EXTENSION));
                $mime = $ext === 'pdf' ? 'application/pdf' : (($ext === 'png') ? 'image/png' : 'image/jpeg');
                $orig = (string)($_FILES['archivo']['name'] ?? null);
                $stmtC = $conn->prepare("INSERT INTO pagos_proveedores_constancias (pago_id, stored_path, mime, original_name, usuario_id) VALUES (:pid, :path, :mime, :orig, :uid)");
                $stmtC->execute([':pid' => $pagoId, ':path' => $archivoPath, ':mime' => $mime, ':orig' => $orig ?: null, ':uid' => $usuario_id]);
                $cid = (int)$conn->lastInsertId();
                if (db_column_exists($conn, 'pagos_proveedores', 'constancia_actual_id')) {
                    $conn->prepare("UPDATE pagos_proveedores SET constancia_actual_id = :cid WHERE id = :id")->execute([':cid' => $cid, ':id' => $pagoId]);
                }
                cxp_copy_constancia_to_drive($conn, $usuario_id, $pagoId, $cid, $archivoPath, $mime, $orig ?: null);
            }

            $nuevo_saldo = bcsub($comp['saldo_pendiente'], $montoAplicado, 2);
            $estado_pago = ($nuevo_saldo <= 0) ? 'Pagado' : 'Parcial';
            $stmt = $conn->prepare("UPDATE comprobantes_compra SET saldo_pendiente = :saldo, estado_pago = :estado WHERE id = :id");
            $stmt->execute([':saldo' => $nuevo_saldo, ':estado' => $estado_pago, ':id' => (int)$data['compra_id']]);

            if ($programacionId) {
                $conn->prepare("UPDATE cxp_programaciones SET estado = 'Ejecutado' WHERE id = :id AND compra_id = :cid")->execute([':id' => $programacionId, ':cid' => (int)$data['compra_id']]);
            }

            $conn->commit();
            echo json_encode([
                "message" => "Pago registrado correctamente",
                "pago_id" => $pagoId,
                "nuevo_saldo" => (float)$nuevo_saldo,
                "monto_aplicado" => $montoAplicado,
                "monto_pago" => $montoPago,
                "moneda_pago" => $monedaPago,
                "tipo_cambio" => $tipoCambio
            ]);
            break;

        case 'eliminar_pago':
            $id = $_GET['id'] ?? 0;
            if (!$id) throw new Exception("ID de pago requerido", 400);

            $conn->beginTransaction();

            $stmt = $conn->prepare("SELECT * FROM pagos_proveedores WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $id]);
            $pago = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$pago) throw new Exception("Pago no encontrado", 404);

            $montoPago = isset($pago['monto_pago']) && $pago['monto_pago'] !== null ? (float)$pago['monto_pago'] : (float)$pago['monto'];

            // 1. Revertir movimiento financiero
            if ($pago['caja_movimiento_id']) {
                $conn->prepare("DELETE FROM caja_movimientos WHERE id = :id")->execute([':id' => $pago['caja_movimiento_id']]);
            } elseif ($pago['banco_movimiento_id']) {
                $stmt = $conn->prepare("SELECT cuenta_id FROM bancos_movimientos WHERE id = :id");
                $stmt->execute([':id' => $pago['banco_movimiento_id']]);
                $mov = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($mov) {
                    $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :monto WHERE id = :id")
                         ->execute([':monto' => $montoPago, ':id' => $mov['cuenta_id']]);
                    
                    $conn->prepare("DELETE FROM bancos_movimientos WHERE id = :id")->execute([':id' => $pago['banco_movimiento_id']]);
                }
            }

            cxp_delete_asiento($conn, isset($pago['asiento_id']) ? (int)$pago['asiento_id'] : null);

            // 2. Revertir saldo comprobante
            $stmt = $conn->prepare("UPDATE comprobantes_compra SET saldo_pendiente = saldo_pendiente + :monto, estado_pago = 'Parcial' WHERE id = :id");
            $stmt->execute([':monto' => $pago['monto'], ':id' => $pago['compra_id']]);

            // Ajuste de estado
            $stmt = $conn->prepare("SELECT saldo_pendiente, importe_total FROM comprobantes_compra WHERE id = :id");
            $stmt->execute([':id' => $pago['compra_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($comp['saldo_pendiente'] >= $comp['importe_total']) {
                $conn->prepare("UPDATE comprobantes_compra SET estado_pago = 'Pendiente' WHERE id = :id")->execute([':id' => $pago['compra_id']]);
            } else if ($comp['saldo_pendiente'] <= 0) {
                $conn->prepare("UPDATE comprobantes_compra SET estado_pago = 'Pagado' WHERE id = :id")->execute([':id' => $pago['compra_id']]);
            }

            $uploadsDir = __DIR__ . '/../uploads/pagos';
            if (db_table_exists($conn, 'pagos_proveedores_constancias')) {
                $stmt = $conn->prepare("SELECT stored_path FROM pagos_proveedores_constancias WHERE pago_id = :pid");
                $stmt->execute([':pid' => (int)$pago['id']]);
                $paths = $stmt->fetchAll(PDO::FETCH_COLUMN);
                foreach (($paths ?: []) as $sp) {
                    $rel = resolveUploadPath((string)$sp);
                    $full = __DIR__ . '/../' . $rel;
                    if ($rel !== '' && file_exists($full) && ensureInsideDir($full, $uploadsDir)) {
                        @unlink($full);
                    }
                }
            } elseif (!empty($pago['archivo_constancia'])) {
                $rel = resolveUploadPath((string)$pago['archivo_constancia']);
                $full = __DIR__ . '/../' . $rel;
                if ($rel !== '' && file_exists($full) && ensureInsideDir($full, $uploadsDir)) {
                    @unlink($full);
                }
            }

            if (!empty($pago['programacion_id'])) {
                $conn->prepare("UPDATE cxp_programaciones SET estado = 'Programado' WHERE id = :id AND estado = 'Ejecutado'")->execute([':id' => (int)$pago['programacion_id']]);
            }

            // 3. Eliminar registro de pago
            $conn->prepare("DELETE FROM pagos_proveedores WHERE id = :id")->execute([':id' => $id]);

            $conn->commit();
            echo json_encode(["message" => "Pago eliminado correctamente"]);
            break;

        case 'editar_pago':
            $pago_id = $data['id'] ?? 0;
            if (!$pago_id) throw new Exception("ID de pago requerido", 400);

            $conn->beginTransaction();

            $stmt = $conn->prepare("SELECT * FROM pagos_proveedores WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $pago_id]);
            $pago_old = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$pago_old) throw new Exception("Pago no encontrado", 404);

            $montoPagoOld = isset($pago_old['monto_pago']) && $pago_old['monto_pago'] !== null ? (float)$pago_old['monto_pago'] : (float)$pago_old['monto'];

            if ($pago_old['caja_movimiento_id']) {
                $conn->prepare("DELETE FROM caja_movimientos WHERE id = :id")->execute([':id' => $pago_old['caja_movimiento_id']]);
            } elseif ($pago_old['banco_movimiento_id']) {
                $stmt = $conn->prepare("SELECT cuenta_id FROM bancos_movimientos WHERE id = :id");
                $stmt->execute([':id' => $pago_old['banco_movimiento_id']]);
                $mov = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($mov) {
                    $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual + :monto WHERE id = :id")
                         ->execute([':monto' => $montoPagoOld, ':id' => $mov['cuenta_id']]);
                    $conn->prepare("DELETE FROM bancos_movimientos WHERE id = :id")->execute([':id' => $pago_old['banco_movimiento_id']]);
                }
            }

            cxp_delete_asiento($conn, isset($pago_old['asiento_id']) ? (int)$pago_old['asiento_id'] : null);

            $conn->prepare("UPDATE comprobantes_compra SET saldo_pendiente = saldo_pendiente + :monto WHERE id = :id")
                 ->execute([':monto' => $pago_old['monto'], ':id' => $pago_old['compra_id']]);

            $stmt = $conn->prepare("SELECT * FROM comprobantes_compra WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $pago_old['compra_id']]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$comp) throw new Exception("Comprobante no encontrado", 400);

            $montoInput = (float)($data['monto'] ?? 0);
            if ($montoInput <= 0) throw new Exception("Monto inválido", 400);

            $monedaComp = strtoupper((string)($comp['moneda'] ?? 'PEN'));
            $monedaPago = strtoupper(trim((string)($data['moneda_pago'] ?? '')));
            if ($monedaPago === '') $monedaPago = $monedaComp;
            $allowConversion = !empty($data['allow_conversion']) ? 1 : 0;
            $tipoCambio = (float)($data['tipo_cambio'] ?? 0);
            if ($tipoCambio <= 0) $tipoCambio = 1.0;

            $montoPago = $montoInput;
            $montoAplicado = $montoInput;
            if ($monedaPago !== $monedaComp) {
                if (!$allowConversion || $tipoCambio <= 0) throw new Exception("Tipo de cambio requerido para conversión", 400);
                if ($monedaComp === 'USD' && $monedaPago === 'PEN') {
                    $montoAplicado = round($montoPago / $tipoCambio, 2);
                } elseif ($monedaComp === 'PEN' && $monedaPago === 'USD') {
                    $montoAplicado = round($montoPago * $tipoCambio, 2);
                } else {
                    $montoAplicado = round($montoPago * $tipoCambio, 2);
                }
            }

            if ($montoAplicado <= 0) throw new Exception("Monto aplicado inválido", 400);
            if ($montoAplicado > (float)$comp['saldo_pendiente']) {
                throw new Exception("El nuevo monto excede el saldo pendiente ({$comp['saldo_pendiente']})", 400);
            }

            $medioPago = (string)($data['medio_pago'] ?? '');
            $origenId = isset($data['origen_id']) && $data['origen_id'] !== '' ? (int)$data['origen_id'] : null;

            $caja_mov_id = null;
            $banco_mov_id = null;

            if ($medioPago === 'Efectivo') {
                if ($monedaPago !== 'PEN') throw new Exception("Efectivo solo permite moneda PEN", 400);
                if (!$origenId) {
                    $stmt = $conn->prepare("SELECT id FROM caja_sesiones WHERE usuario_id = :uid AND estado = 'Abierta' ORDER BY id DESC LIMIT 1");
                    $stmt->execute([':uid' => $usuario_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$sesion) throw new Exception("No tienes una caja abierta.", 400);
                    $caja_sesion_id = (int)$sesion['id'];
                } else {
                    $stmt = $conn->prepare("SELECT id FROM caja_sesiones WHERE id = :id AND usuario_id = :uid AND estado = 'Abierta' LIMIT 1");
                    $stmt->execute([':id' => $origenId, ':uid' => $usuario_id]);
                    $sesion = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$sesion) throw new Exception("Caja inválida o no tienes una caja abierta con ese origen.", 400);
                    $caja_sesion_id = (int)$sesion['id'];
                }
                $concepto = "Pago Factura Compra {$comp['serie']}-{$comp['numero']} (Editado)";
                $sqlCaja = "INSERT INTO caja_movimientos (sesion_id, tipo, monto, concepto, usuario_id, fecha)
                            VALUES (:sid, 'Egreso', :monto, :conc, :uid, NOW())";
                $conn->prepare($sqlCaja)->execute([
                    ':sid' => $caja_sesion_id,
                    ':monto' => $montoPago,
                    ':conc' => $concepto,
                    ':uid' => $usuario_id
                ]);
                $caja_mov_id = (int)$conn->lastInsertId();
            } elseif (in_array($medioPago, ['Transferencia', 'Cheque', 'Deposito'], true)) {
                if (!$origenId) throw new Exception("Debe seleccionar una cuenta bancaria de origen", 400);
                $stmt = $conn->prepare("SELECT id, moneda, cuenta_contable FROM bancos_cuentas WHERE id = :id FOR UPDATE");
                $stmt->execute([':id' => $origenId]);
                $cuenta = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$cuenta) throw new Exception("Cuenta bancaria de origen no encontrada", 400);
                $monedaCuenta = strtoupper((string)($cuenta['moneda'] ?? ''));
                if ($monedaCuenta !== '' && $monedaCuenta !== $monedaPago) {
                    throw new Exception("La moneda de la cuenta ($monedaCuenta) no coincide con la moneda del pago ($monedaPago)", 400);
                }
                $concepto = "Pago Factura Compra {$comp['serie']}-{$comp['numero']} ({$data['referencia']}) (Editado)";
                $sqlBanco = "INSERT INTO bancos_movimientos (cuenta_id, tipo, origen_destino, monto, concepto, referencia, entidad, usuario_id, fecha)
                             VALUES (:cid, 'Egreso', :origen, :monto, :conc, :ref, :entidad, :uid, NOW())";
                $conn->prepare($sqlBanco)->execute([
                    ':cid' => $origenId,
                    ':origen' => 'Proveedor',
                    ':monto' => $montoPago,
                    ':conc' => $concepto,
                    ':ref' => $data['referencia'] ?? '',
                    ':entidad' => $comp['proveedor_razon_social'],
                    ':uid' => $usuario_id
                ]);
                $banco_mov_id = (int)$conn->lastInsertId();
                $conn->prepare("UPDATE bancos_cuentas SET saldo_actual = saldo_actual - :monto WHERE id = :id")
                     ->execute([':monto' => $montoPago, ':id' => $origenId]);
            } else {
                throw new Exception("Medio de pago inválido", 400);
            }

            $asientoId = cxp_create_asiento_pago($conn, $comp, $medioPago, $origenId, $montoAplicado, $tipoCambio, $usuario_id);

            $archivoPath = $pago_old['archivo_constancia'];
            $nuevoConstanciaId = null;
            if (isset($_FILES['archivo'])) {
                $archivoPath = handleFileUpload($_FILES['archivo']);
                if ($archivoPath && db_table_exists($conn, 'pagos_proveedores_constancias')) {
                    $ext = strtolower((string)pathinfo($archivoPath, PATHINFO_EXTENSION));
                    $mime = $ext === 'pdf' ? 'application/pdf' : (($ext === 'png') ? 'image/png' : 'image/jpeg');
                    $orig = (string)($_FILES['archivo']['name'] ?? null);
                    $stmtC = $conn->prepare("INSERT INTO pagos_proveedores_constancias (pago_id, stored_path, mime, original_name, usuario_id) VALUES (:pid, :path, :mime, :orig, :uid)");
                    $stmtC->execute([':pid' => (int)$pago_old['id'], ':path' => $archivoPath, ':mime' => $mime, ':orig' => $orig ?: null, ':uid' => $usuario_id]);
                    $nuevoConstanciaId = (int)$conn->lastInsertId();
                    cxp_copy_constancia_to_drive($conn, $usuario_id, (int)$pago_old['id'], $nuevoConstanciaId, $archivoPath, $mime, $orig ?: null);
                }
            }

            $sql = "UPDATE pagos_proveedores SET
                    monto = :monto,
                    monto_pago = :monto_pago,
                    moneda_pago = :moneda_pago,
                    tipo_cambio = :tc,
                    medio_pago = :medio,
                    referencia = :ref,
                    origen_id = :origen,
                    observaciones = :obs,
                    caja_movimiento_id = :caja_id,
                    banco_movimiento_id = :banco_id,
                    archivo_constancia = :archivo,
                    asiento_id = :asiento_id,
                    conciliado = 1,
                    conciliado_at = NOW(),
                    conciliado_usuario_id = :conc_uid
                    WHERE id = :id";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':monto' => $montoAplicado,
                ':monto_pago' => $montoPago,
                ':moneda_pago' => $monedaPago,
                ':tc' => $tipoCambio,
                ':medio' => $medioPago,
                ':ref' => $data['referencia'] ?? '',
                ':origen' => $origenId,
                ':obs' => $data['observaciones'] ?? '',
                ':caja_id' => $caja_mov_id,
                ':banco_id' => $banco_mov_id,
                ':archivo' => $archivoPath,
                ':asiento_id' => $asientoId,
                ':conc_uid' => $usuario_id,
                ':id' => (int)$pago_id
            ]);

            if ($nuevoConstanciaId && db_column_exists($conn, 'pagos_proveedores', 'constancia_actual_id')) {
                $conn->prepare("UPDATE pagos_proveedores SET constancia_actual_id = :cid WHERE id = :id")->execute([':cid' => $nuevoConstanciaId, ':id' => (int)$pago_id]);
            }

            $nuevo_saldo = bcsub($comp['saldo_pendiente'], $montoAplicado, 2);
            $estado_pago = ($nuevo_saldo <= 0) ? 'Pagado' : 'Parcial';
            if ($nuevo_saldo >= (float)$comp['importe_total']) $estado_pago = 'Pendiente';
            $stmt = $conn->prepare("UPDATE comprobantes_compra SET saldo_pendiente = :saldo, estado_pago = :estado WHERE id = :id");
            $stmt->execute([':saldo' => $nuevo_saldo, ':estado' => $estado_pago, ':id' => (int)$comp['id']]);

            $conn->commit();
            echo json_encode([
                "message" => "Pago actualizado correctamente",
                "nuevo_saldo" => (float)$nuevo_saldo,
                "monto_aplicado" => $montoAplicado,
                "monto_pago" => $montoPago,
                "moneda_pago" => $monedaPago,
                "tipo_cambio" => $tipoCambio
            ]);
            break;

        case 'reporte_vencimientos':
            $sql = "SELECT proveedor_razon_social,
                           proveedor_num_doc,
                           moneda,
                           COUNT(id) as cantidad_facturas,
                           SUM(saldo_pendiente) as total_deuda,
                           MAX(DATEDIFF(CURDATE(), fecha_vencimiento)) as max_dias_atraso
                    FROM comprobantes_compra
                    WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0 AND fecha_vencimiento < CURDATE()
                    GROUP BY proveedor_num_doc, proveedor_razon_social, moneda
                    ORDER BY total_deuda DESC";
            $stmt = $conn->query($sql);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(is_array($result) ? $result : []);
            break;
            
        case 'estado_cuenta':
            $proveedor_doc = $_GET['doc'] ?? '';
            if (empty($proveedor_doc)) {
                $sql = "SELECT proveedor_razon_social, proveedor_num_doc, moneda, SUM(saldo_pendiente) as deuda_total
                        FROM comprobantes_compra
                        WHERE estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08') AND saldo_pendiente > 0
                        GROUP BY proveedor_num_doc, proveedor_razon_social, moneda";
                 $stmt = $conn->query($sql);
            } else {
                 $sql = "SELECT * FROM comprobantes_compra 
                         WHERE proveedor_num_doc = :doc AND estado != 'Anulado' AND tipo_comprobante NOT IN ('07','08')
                         ORDER BY fecha_emision DESC";
                 $stmt = $conn->prepare($sql);
                 $stmt->execute([':doc' => $proveedor_doc]);
            }
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(is_array($result) ? $result : []);
            break;

        default:
            http_response_code(400);
            echo json_encode(["message" => "Accion invalida"]);
    }
} catch (Exception $e) {
    if (isset($conn) && $conn->inTransaction()) {
        $conn->rollBack();
    }
    $code = (int)$e->getCode();
    $status = ($code >= 400 && $code <= 499) ? $code : 500;
    http_response_code($status);
    if ($status >= 500) {
        error_log('CxP error: ' . $e->getMessage());
        echo json_encode(["message" => "Error interno del servidor"]);
    } else {
        echo json_encode(["message" => $e->getMessage()]);
    }
}
$conn = null;
?>
