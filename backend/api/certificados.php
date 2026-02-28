<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

error_reporting(E_ERROR | E_PARSE);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;

// Auth Check
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);
$userId = $userData->id ?? null;

if (!$userData) {
    http_response_code(401);
    echo json_encode(["message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

try {
    $conn->exec("
        CREATE TABLE IF NOT EXISTS certificados_historial (
            id INT AUTO_INCREMENT PRIMARY KEY,
            colaborador_id INT NOT NULL,
            tipo_documento ENUM('CT','CPS') NOT NULL,
            codigo VARCHAR(50) NULL,
            correlativo INT NULL,
            dirigido_a VARCHAR(255) NULL,
            cargo VARCHAR(150) NULL,
            fecha_inicio DATE NULL,
            fecha_fin DATE NULL,
            fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            pdf_url VARCHAR(255) NULL,
            pdf_base64 LONGTEXT NULL,
            emitido_por INT NULL,
            estado ENUM('Activo','Anulado') DEFAULT 'Activo',
            INDEX idx_colaborador (colaborador_id),
            FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    // Try adding columns if missing (silent fail if exists)
    try {
        $conn->exec("ALTER TABLE certificados_historial ADD COLUMN pdf_base64 LONGTEXT NULL");
    } catch (Exception $e) {}
    try {
        $conn->exec("ALTER TABLE certificados_historial ADD COLUMN codigo VARCHAR(50) NULL");
    } catch (Exception $e) {}
    try {
        $conn->exec("ALTER TABLE certificados_historial ADD COLUMN correlativo INT NULL");
    } catch (Exception $e) {}
    $conn->exec("
        CREATE TABLE IF NOT EXISTS certificados_firmas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(150) NOT NULL,
            imagen_path VARCHAR(255) NOT NULL,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
} catch (Exception $e) {
}

try {
    if ($method === 'GET' && $action === 'list_candidates') {
        $sql = "SELECT id, nombres, apellidos, documento_numero, cargo, fecha_ingreso, tipo_contrato 
                FROM colaboradores 
                WHERE estado = 'Activo'
                ORDER BY apellidos, nombres";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($result);

    } elseif ($method === 'GET' && $action === 'history') {
        // Listar historial
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $offset = ($page - 1) * $limit;

        $whereClause = "WHERE h.estado = 'Activo'";
        $params = [];

        if (!empty($_GET['colaborador_id'])) {
            $whereClause .= " AND h.colaborador_id = ?";
            $params[] = $_GET['colaborador_id'];
        }

        $sql = "SELECT h.id, h.tipo_documento, h.codigo, h.dirigido_a, h.fecha_emision, h.pdf_base64,
                       c.nombres, c.apellidos, c.documento_numero
                FROM certificados_historial h
                JOIN colaboradores c ON h.colaborador_id = c.id
                $whereClause
                ORDER BY h.fecha_emision DESC
                LIMIT $limit OFFSET $offset";
        
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Count total
        $countSql = "SELECT COUNT(*) FROM certificados_historial h $whereClause";
        $countStmt = $conn->prepare($countSql);
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();

        echo json_encode([
            'data' => $data,
            'total' => $total,
            'page' => $page,
            'limit' => $limit
        ]);

    } elseif ($method === 'GET' && $action === 'firmas') {
        $stmt = $conn->prepare("SELECT id, nombre, imagen_path, activo, created_at FROM certificados_firmas ORDER BY created_at DESC");
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($rows);

    } elseif ($method === 'POST' && $action === 'generate') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['colaborador_id']) || empty($data['tipo_documento'])) {
            throw new Exception("Faltan datos requeridos");
        }

        // Datos Colaborador
        $stmt = $conn->prepare("SELECT * FROM colaboradores WHERE id = ?");
        $stmt->execute([$data['colaborador_id']]);
        $colab = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$colab) throw new Exception("Colaborador no encontrado");

        // Datos Empresa
        $stmtEmp = $conn->query("SELECT ruc, razon_social, nombre_comercial, domicilio_fiscal, logo FROM empresa_datos LIMIT 1");
        $empresaRow = $stmtEmp->fetch(PDO::FETCH_ASSOC) ?: [];
        $empresaNombre = !empty($empresaRow['nombre_comercial']) ? $empresaRow['nombre_comercial'] : ($empresaRow['razon_social'] ?? '');
        $empresa = [
            'nombre' => $empresaNombre,
            'ruc' => $empresaRow['ruc'] ?? '',
            'direccion' => $empresaRow['domicilio_fiscal'] ?? '',
            'razon_social' => $empresaRow['razon_social'] ?? $empresaNombre
        ];

        // PDF Setup
        $options = new Options();
        $options->set('isRemoteEnabled', true);
        $options->set('isHtml5ParserEnabled', true);
        $dompdf = new Dompdf($options);
        
        $nombre_completo = mb_strtoupper($colab['nombres'] . ' ' . $colab['apellidos']);
        $dni = $colab['documento_numero'];
        $cargo = mb_strtoupper($colab['cargo'] ?? '');
        
        // Fechas
        $fecha_inicio = !empty($colab['fecha_ingreso']) ? date('d/m/Y', strtotime($colab['fecha_ingreso'])) : '';
        $fecha_fin = !empty($data['fecha_fin']) ? date('d/m/Y', strtotime($data['fecha_fin'])) : 'la actualidad';
        $fecha_inicio_db = !empty($colab['fecha_ingreso']) ? $colab['fecha_ingreso'] : null;
        $fecha_fin_db = !empty($data['fecha_fin']) ? $data['fecha_fin'] : null;

        if ($data['tipo_documento'] === 'CT') {
            try {
                $stmtCont = $conn->prepare("SELECT tipo_contrato, fecha_inicio, fecha_fin FROM contratos WHERE colaborador_id = ? AND (estado = 'Vigente' OR estado = 'Por Vencer') ORDER BY fecha_inicio DESC LIMIT 1");
                $stmtCont->execute([$data['colaborador_id']]);
                $contrato = $stmtCont->fetch(PDO::FETCH_ASSOC);
                if ($contrato) {
                    $fecha_inicio = !empty($contrato['fecha_inicio']) ? date('d/m/Y', strtotime($contrato['fecha_inicio'])) : $fecha_inicio;
                    $fecha_fin = !empty($contrato['fecha_fin']) ? date('d/m/Y', strtotime($contrato['fecha_fin'])) : 'la actualidad';
                    $fecha_inicio_db = $contrato['fecha_inicio'];
                    $fecha_fin_db = $contrato['fecha_fin'];
                } else {
                    $stmtLast = $conn->prepare("SELECT fecha_inicio, fecha_fin FROM contratos WHERE colaborador_id = ? ORDER BY fecha_inicio DESC LIMIT 1");
                    $stmtLast->execute([$data['colaborador_id']]);
                    $last = $stmtLast->fetch(PDO::FETCH_ASSOC);
                    if ($last) {
                        $fecha_inicio = !empty($last['fecha_inicio']) ? date('d/m/Y', strtotime($last['fecha_inicio'])) : $fecha_inicio;
                        $fecha_fin = !empty($last['fecha_fin']) ? date('d/m/Y', strtotime($last['fecha_fin'])) : 'la actualidad';
                        $fecha_inicio_db = $last['fecha_inicio'];
                        $fecha_fin_db = $last['fecha_fin'];
                    }
                }
            } catch (Exception $e) {}
        }
        
        $dirigido_a = !empty($data['dirigido_a']) ? $data['dirigido_a'] : 'A quien corresponda';

        // Representante Legal (tomar Gerente activo como representante por defecto)
        $rep_nombre = null;
        $rep_dni = null;
        try {
            $qRep = "SELECT c.nombres, c.apellidos, c.documento_numero 
                     FROM colaboradores c 
                     JOIN usuarios u ON c.usuario_id = u.id 
                     WHERE u.rol_id = 7 AND u.status = 'activo' 
                     LIMIT 1";
            $stRep = $conn->prepare($qRep);
            $stRep->execute();
            $rep = $stRep->fetch(PDO::FETCH_ASSOC);
            if ($rep) {
                $rep_nombre = mb_strtoupper(trim(($rep['nombres'] ?? '') . ' ' . ($rep['apellidos'] ?? '')));
                $rep_dni = $rep['documento_numero'] ?? '';
            }
        } catch (Exception $e) { /* ignore */ }
        if (!$rep_nombre) {
            // Fallbacks
            $rep_nombre = mb_strtoupper($empresa['razon_social']);
            $rep_dni = '';
        }

        // Función fecha literal
        $meses_literal = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        $toFechaLiteral = function($dateStr) use ($meses_literal) {
            if (empty($dateStr)) return '';
            $ts = strtotime($dateStr);
            if (!$ts) return $dateStr;
            $d = date('d', $ts);
            $m = $meses_literal[(int)date('n', $ts)-1];
            $y = date('Y', $ts);
            return $d . " de " . $m . " del " . $y;
        };
        
        // Fecha actual
        $meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        $fecha_texto = "Lima, " . date('d') . " de " . $meses[date('n')-1] . " del " . date('Y');

        // Contenido
        $titulo = "";
        $cuerpo = "";
        
        // Generar código correlativo (ej: CT-0001-2026-RRHH)
        $anioActual = date('Y');
        $prefix = ($data['tipo_documento'] === 'CT') ? 'CT' : 'CPS';
        $stmtSeq = $conn->prepare("
            SELECT MAX(correlativo) 
            FROM certificados_historial 
            WHERE tipo_documento = ? AND YEAR(fecha_emision) = ?
        ");
        $stmtSeq->execute([$data['tipo_documento'], $anioActual]);
        $lastCorrel = (int) $stmtSeq->fetchColumn();
        $nextCorrel = $lastCorrel + 1;
        $correlStr = str_pad((string)$nextCorrel, 4, '0', STR_PAD_LEFT);
        $codigo = $prefix . '-' . $correlStr . '-' . $anioActual . '-RRHH';

        if ($data['tipo_documento'] === 'CT') {
            $titulo = "CERTIFICADO DE TRABAJO";
            $fi_literal = $toFechaLiteral($fecha_inicio_db);
            $ff_literal = !empty($fecha_fin_db) ? $toFechaLiteral($fecha_fin_db) : 'la actualidad';
            $cuerpo = "
            <p>La que suscribe, <strong>{$rep_nombre}</strong>, identificada con DNI Nº <strong>{$rep_dni}</strong>, representante legal de la empresa <strong>{$empresa['razon_social']}</strong>, con RUC <strong>{$empresa['ruc']}</strong>.</p>
            <p style='text-align: center; margin: 25px 0; font-weight: bold;'>CERTIFICA QUE:</p>
            <p style='text-align: center; font-size: 14pt; margin: 10px 0;'><strong>{$nombre_completo}</strong></p>
            <p>Identificado(a) con DNI Nº <strong>{$dni}</strong>, ha laborado como <strong>{$cargo}</strong>, durante el periodo comprendido desde el <strong>{$fi_literal}</strong>, hasta el <strong>{$ff_literal}</strong>, demostrando durante su permanencia responsabilidad, honestidad y dedicación a las labores que le fueron asignadas.</p>
            <p>Se expide el presente certificado para los fines que la parte interesada crea conveniente.</p>
            <p style='margin-top: 20px;'>Atentamente.</p>
            ";
        } elseif ($data['tipo_documento'] === 'CPS') {
            $titulo = "CONSTANCIA DE PRESTACIÓN DE SERVICIOS";
            $cuerpo = "
            <p>Por medio del presente documento, <strong>{$empresa['nombre']}</strong>, identificada con RUC N° <strong>{$empresa['ruc']}</strong>, con domicilio legal en {$empresa['direccion']}.</p>
            <p style='text-align: center; margin: 30px 0;'><strong>HACE CONSTAR:</strong></p>
            <p>Que el Sr./Sra. <strong>{$nombre_completo}</strong>, identificado(a) con DNI N° <strong>{$dni}</strong>, ha prestado servicios profesionales independientes en calidad de Locador de Servicios, desempeñándose como <strong>{$cargo}</strong> desde el <strong>{$fecha_inicio}</strong> hasta <strong>{$fecha_fin}</strong>.</p>
            <p>La presente constancia se expide a solicitud del interesado(a) para los fines que considere pertinentes, dejando expresa constancia que la relación contractual fue de naturaleza civil y no laboral.</p>
            ";
        }

        // Fondo de página (imagen local)
        $bgCss = "";
        $bgBase64 = null;
        // Candidatos de ruta para el fondo
        $candidates = [
            realpath(__DIR__ . '/../uploads/plantillas/image118.png'),
            __DIR__ . '/../uploads/plantillas/image118.png',
            realpath('d:/Escritorio/erp/backend/uploads/plantillas/image118.png'),
            'd:/Escritorio/erp/backend/uploads/plantillas/image118.png'
        ];
        $bgPath = null;
        foreach ($candidates as $c) {
            if ($c && file_exists($c)) { $bgPath = $c; break; }
        }
        // Preparar imagen de fondo embebida
        if ($bgPath) {
            $typeImg = pathinfo($bgPath, PATHINFO_EXTENSION);
            $dataImg = @file_get_contents($bgPath);
            if ($dataImg !== false) {
                $bgBase64 = 'data:image/' . $typeImg . ';base64,' . base64_encode($dataImg);
            }
        }

        // Firma digital (imagen activa en certificados_firmas)
        $firmaBase64 = null;
        try {
            $stmtFirma = $conn->prepare("SELECT imagen_path FROM certificados_firmas WHERE activo = 1 ORDER BY id DESC LIMIT 1");
            $stmtFirma->execute();
            $firmaRow = $stmtFirma->fetch(PDO::FETCH_ASSOC);
            if ($firmaRow && !empty($firmaRow['imagen_path'])) {
                $fpCandidates = [
                    __DIR__ . '/../' . $firmaRow['imagen_path'],
                    realpath(__DIR__ . '/../' . $firmaRow['imagen_path'])
                ];
                $firmaPath = null;
                foreach ($fpCandidates as $fc) {
                    if ($fc && file_exists($fc)) { $firmaPath = $fc; break; }
                }
                if ($firmaPath) {
                    $fType = pathinfo($firmaPath, PATHINFO_EXTENSION);
                    $fData = @file_get_contents($firmaPath);
                    if ($fData !== false) {
                        $firmaBase64 = 'data:image/' . $fType . ';base64,' . base64_encode($fData);
                    }
                }
            }
        } catch (Exception $e) {}

        // URL de validación y QR
        $validationParams = [
            'dni' => $dni,
            'tipo' => $data['tipo_documento'],
            'codigo' => $codigo,
            'nombre' => $nombre_completo,
            'fi' => $fecha_inicio_db,
            'ff' => $fecha_fin_db,
            'ruc' => $empresa['ruc'],
            'ts' => time()
        ];
        $validationUrl = 'https://certificados.consultoriagrupojc.com/validar?' . http_build_query($validationParams);
        $qrImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=' . urlencode($validationUrl);

        $bgImgHtml = $bgBase64 ? "<img class='bg-img' src='{$bgBase64}' />" : "";
        $firmaImgHtml = $firmaBase64 ? "<img class='firma-img' src='{$firmaBase64}' />" : "";

        $html = "
        <html>
        <head>
            <meta charset='UTF-8'>
            <style>
                @page { size: A4; margin: 0; }
                body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; margin: 0; }
                .page-wrap { position: relative; z-index: 1; padding: 40px; }
                .codigo { text-align: left; font-size: 10pt; margin-bottom: 20px; }
                .titulo { font-size: 18pt; font-weight: bold; text-decoration: underline; text-align: center; margin-bottom: 40px; }
                .contenido { text-align: justify; margin-bottom: 50px; }
                .firma { text-align: center; margin-top: 100px; }
                .firma-img { max-width: 220px; max-height: 90px; margin: 0 auto 10px auto; object-fit: contain; display: block; }
                .linea-firma { border-top: 1px solid black; width: 200px; margin: 0 auto; }
                .fecha { text-align: right; margin-top: 60px; }
                .qr-section { position: absolute; right: 40px; bottom: 60px; text-align: center; font-size: 8pt; color: #333; }
                .qr-section img { width: 130px; height: 130px; }
                .bg-img { position: fixed; top: 0; left: 0; width: 100%; height: 100%; }
            </style>
        </head>
        <body>
            {$bgImgHtml}
            <div class='page-wrap'>
                <div class='codigo'>C&oacute;digo: {$codigo}</div>
                <div class='titulo'>{$titulo}</div>
                <div class='contenido'>{$cuerpo}</div>
                <div class='fecha'>{$fecha_texto}</div>
                <div class='firma'>
                    {$firmaImgHtml}
                    <div class='linea-firma'></div>
                    <p>
                        <strong>{$rep_nombre}</strong><br>
                        REPRESENTANTE LEGAL<br>
                        {$empresa['razon_social']}
                    </p>
                </div>
                <div class='qr-section'>
                    <img src='{$qrImageUrl}' alt='QR de validación'>
                    <div>Escanee para validar este documento<br>certificados.consultoriagrupojc.com</div>
                </div>
            </div>
        </body>
        </html>
        ";

        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();
        $output = $dompdf->output();
        $pdfBase64 = base64_encode($output);

        // Guardar historial
        try {
            $stmtHist = $conn->prepare("
                INSERT INTO certificados_historial 
                (colaborador_id, tipo_documento, codigo, correlativo, dirigido_a, cargo, fecha_inicio, fecha_fin, pdf_base64, emitido_por) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmtHist->execute([
                $data['colaborador_id'],
                $data['tipo_documento'],
                $codigo,
                $nextCorrel,
                $dirigido_a,
                $cargo,
                $fecha_inicio_db,
                $fecha_fin_db,
                $pdfBase64,
                $userId
            ]);
        } catch (Exception $e) {
            // Log error but continue
        }

        echo json_encode([
            'success' => true,
            'pdf_base64' => $pdfBase64,
            'filename' => "{$data['tipo_documento']}_{$dni}.pdf"
        ]);

    } elseif ($method === 'POST' && $action === 'firmas') {
        $contentType = $_SERVER["CONTENT_TYPE"] ?? '';
        $isMultipart = strpos($contentType, 'multipart/form-data') !== false;
        if (!$isMultipart) {
            http_response_code(400);
            echo json_encode(['error' => 'Solicitud inválida']);
            if (isset($conn)) $conn = null;
            exit;
        }
        $nombre = $_POST['nombre'] ?? '';
        if (!$nombre) {
            http_response_code(400);
            echo json_encode(['error' => 'El nombre es obligatorio']);
            if (isset($conn)) $conn = null;
            exit;
        }
        if (!isset($_FILES['imagen']) || $_FILES['imagen']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'La imagen es obligatoria']);
            if (isset($conn)) $conn = null;
            exit;
        }
        $uploadDir = __DIR__ . '/../uploads/certificados_firmas/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }
        $fileExt = strtolower(pathinfo($_FILES['imagen']['name'], PATHINFO_EXTENSION));
        $allowed = ['jpg', 'jpeg', 'png', 'gif'];
        if (!in_array($fileExt, $allowed, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Formato de archivo no permitido']);
            if (isset($conn)) $conn = null;
            exit;
        }
        $fileName = 'firma_' . time() . '_' . rand(1000, 9999) . '.' . $fileExt;
        $targetPath = $uploadDir . $fileName;
        if (!move_uploaded_file($_FILES['imagen']['tmp_name'], $targetPath)) {
            http_response_code(500);
            echo json_encode(['error' => 'Error al guardar archivo']);
            if (isset($conn)) $conn = null;
            exit;
        }
        $relPath = 'uploads/certificados_firmas/' . $fileName;
        $stmt = $conn->prepare("INSERT INTO certificados_firmas (nombre, imagen_path, activo) VALUES (?, ?, 1)");
        $stmt->execute([$nombre, $relPath]);
        echo json_encode([
            'success' => true,
            'id' => $conn->lastInsertId(),
            'nombre' => $nombre,
            'imagen_path' => $relPath,
            'activo' => 1
        ]);

    } elseif ($method === 'PUT' && $action === 'edit') {
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['id'])) throw new Exception("ID requerido");

        $sql = "UPDATE certificados_historial SET dirigido_a = ? WHERE id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$data['dirigido_a'], $data['id']]);

        echo json_encode(['success' => true]);

    } elseif ($method === 'PUT' && $action === 'firmas') {
        $data = json_decode(file_get_contents("php://input"), true);
        if (empty($data['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'ID requerido']);
            if (isset($conn)) $conn = null;
            exit;
        }
        $fields = [];
        $params = [];
        if (isset($data['nombre'])) {
            $fields[] = "nombre = ?";
            $params[] = $data['nombre'];
        }
        if (isset($data['activo'])) {
            $fields[] = "activo = ?";
            $params[] = (int)$data['activo'];
        }
        if (!$fields) {
            http_response_code(400);
            echo json_encode(['error' => 'Sin datos para actualizar']);
            if (isset($conn)) $conn = null;
            exit;
        }
        $params[] = $data['id'];
        $sql = "UPDATE certificados_firmas SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        echo json_encode(['success' => true]);

    } elseif ($method === 'DELETE' && $action === 'delete') {
        $id = $_GET['id'] ?? null;
        if (!$id) throw new Exception("ID requerido");

        // Soft delete
        $sql = "UPDATE certificados_historial SET estado = 'Anulado' WHERE id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$id]);

        echo json_encode(['success' => true]);

    } elseif ($method === 'DELETE' && $action === 'firmas') {
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'ID requerido']);
            if (isset($conn)) $conn = null;
            exit;
        }
        $stmt = $conn->prepare("SELECT imagen_path FROM certificados_firmas WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $stmtDel = $conn->prepare("DELETE FROM certificados_firmas WHERE id = ?");
            $stmtDel->execute([$id]);
            if (!empty($row['imagen_path'])) {
                $filePath = __DIR__ . '/../' . $row['imagen_path'];
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
            }
            echo json_encode(['success' => true]);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Registro no encontrado']);
        }

    } else {
        throw new Exception("Acción no válida");
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
