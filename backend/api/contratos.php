<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Disable warning reporting to prevent JSON corruption
error_reporting(E_ERROR | E_PARSE);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once '../config/db.php';
require_once '../config/jwt.php';
require_once '../config/rbac.php';
require_once '../vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;

// Validate JWT
$jwt = new JWTHandler();
$token = $jwt->getBearerToken();
$userData = $jwt->validateToken($token);

if (!$userData) {
    http_response_code(401);
    echo json_encode(['error' => 'Token inválido']);
    if (isset($conn)) $conn = null;
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;
$uploadDir = __DIR__ . '/uploads/contratos/';
$signatureDir = __DIR__ . '/uploads/contratos_firmas/';

if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}
if (!file_exists($signatureDir)) {
    mkdir($signatureDir, 0777, true);
}

function contratos_get_colaborador_id_for_user(PDO $conn, $userData): ?int {
    $userId = $userData->id ?? null;
    if (!$userId) return null;
    $stmt = $conn->prepare("SELECT id FROM colaboradores WHERE usuario_id = :uid OR email = (SELECT email FROM usuarios WHERE id = :uid2) LIMIT 1");
    $stmt->execute([':uid' => $userId, ':uid2' => $userId]);
    $cid = $stmt->fetchColumn();
    return $cid ? (int)$cid : null;
}

try {
    if ($action === 'download' && $method === 'GET' && isset($_GET['contrato_id'])) {
        $contratoId = (int)$_GET['contrato_id'];
        if ($contratoId <= 0) {
            http_response_code(400);
            echo json_encode(["error" => "contrato_id inválido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $colaboradorId = contratos_get_colaborador_id_for_user($conn, $userData);
        if (!$colaboradorId) {
            http_response_code(403);
            echo json_encode(["error" => "No autorizado"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $stmt = $conn->prepare("SELECT archivo_url FROM contratos WHERE id = ? AND colaborador_id = ? LIMIT 1");
        $stmt->execute([$contratoId, $colaboradorId]);
        $archivoUrl = $stmt->fetchColumn();

        if (!$archivoUrl) {
            http_response_code(404);
            echo json_encode(["error" => "Contrato/archivo no encontrado"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $basename = basename((string)$archivoUrl);
        $fullPath = $uploadDir . $basename;
        $real = realpath($fullPath);
        $realBase = realpath($uploadDir);
        if (!$real || !$realBase || strpos($real, $realBase) !== 0 || !file_exists($real)) {
            http_response_code(404);
            echo json_encode(["error" => "Archivo no encontrado"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        header("Content-Type: application/pdf");
        header("Content-Length: " . filesize($real));
        header("Cache-Control: private, max-age=60");
        readfile($real);
        if (isset($conn)) $conn = null;
        exit;
    }

    $signData = null;
    if ($action === 'sign' && $method === 'POST') {
        $signData = json_decode(file_get_contents("php://input"), true);

        if (!is_array($signData) || empty($signData['id']) || empty($signData['role'])) {
            http_response_code(400);
            echo json_encode(["message" => "ID y rol requeridos."]);
            if (isset($conn)) $conn = null;
            exit;
        }

        if ($signData['role'] === 'colaborador') {
            $contratoId = (int)$signData['id'];
            if ($contratoId <= 0) {
                http_response_code(400);
                echo json_encode(["message" => "ID inválido."]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $colaboradorId = contratos_get_colaborador_id_for_user($conn, $userData);
            if (!$colaboradorId) {
                http_response_code(403);
                echo json_encode(["message" => "No autorizado"]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $stmtOwner = $conn->prepare("SELECT colaborador_id FROM contratos WHERE id = ? LIMIT 1");
            $stmtOwner->execute([$contratoId]);
            $ownerId = (int)$stmtOwner->fetchColumn();

            if (!$ownerId) {
                http_response_code(404);
                echo json_encode(["message" => "Contrato no encontrado"]);
                if (isset($conn)) $conn = null;
                exit;
            }

            if ($ownerId !== $colaboradorId) {
                http_response_code(403);
                echo json_encode(["message" => "No autorizado"]);
                if (isset($conn)) $conn = null;
                exit;
            }

            $now = date('Y-m-d H:i:s');
            $stmtUp = $conn->prepare("UPDATE contratos SET firma_colaborador = :now WHERE id = :id");
            $stmtUp->execute([':now' => $now, ':id' => $contratoId]);
            echo json_encode(["message" => "Contrato firmado correctamente."]);
            if (isset($conn)) $conn = null;
            exit;
        }
    }

    rbac_require($conn, $userData, 'gestion_contratos', $method);

    // Ensure regimen_pensionario column exists
    try {
        $chk = $conn->query("SHOW COLUMNS FROM contratos LIKE 'regimen_pensionario'");
        if ($chk->rowCount() == 0) {
            $conn->exec("ALTER TABLE contratos ADD COLUMN regimen_pensionario ENUM('ONP','AFP Integra','AFP Prima','AFP Profuturo','AFP Habitat') NULL AFTER salario");
        }
    } catch (Exception $e) {}
    // Ensure asignacion_familiar column exists
    try {
        $chk2 = $conn->query("SHOW COLUMNS FROM contratos LIKE 'asignacion_familiar'");
        if ($chk2->rowCount() == 0) {
            $conn->exec("ALTER TABLE contratos ADD COLUMN asignacion_familiar TINYINT(1) DEFAULT 0 AFTER regimen_pensionario");
        }
    } catch (Exception $e) {}
    // Ensure afp_cuspp column exists (Código Único del SPP)
    try {
        $chk3 = $conn->query("SHOW COLUMNS FROM contratos LIKE 'afp_cuspp'");
        if ($chk3->rowCount() == 0) {
            $conn->exec("ALTER TABLE contratos ADD COLUMN afp_cuspp VARCHAR(20) NULL AFTER asignacion_familiar");
        }
    } catch (Exception $e) {}

    $conn->exec("
        UPDATE contratos
        SET estado = 'Vigente'
        WHERE estado <> 'Finalizado'
          AND (fecha_fin IS NULL OR fecha_fin > DATE_ADD(CURDATE(), INTERVAL 30 DAY))
    ");
    $conn->exec("
        UPDATE contratos
        SET estado = 'Por Vencer'
        WHERE estado <> 'Finalizado'
          AND fecha_fin IS NOT NULL
          AND fecha_fin BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    ");
    $conn->exec("
        UPDATE contratos
        SET estado = 'Vencido'
        WHERE estado <> 'Finalizado'
          AND fecha_fin IS NOT NULL
          AND fecha_fin < CURDATE()
    ");
    if ($action === 'download' && $method === 'GET') {
        $reqPath = $_GET['file'] ?? '';
        if (!$reqPath) {
            http_response_code(400);
            echo json_encode(["error" => "Falta parámetro 'file'"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        $reqPath = str_replace('\\', '/', $reqPath);
        // Strip query/hash if present to avoid filesystem lookup issues
        $reqPath = preg_split('/[?#]/', $reqPath, 2)[0];
        if (strpos($reqPath, 'uploads/') !== 0) {
            http_response_code(403);
            echo json_encode(["error" => "Ruta no permitida"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        $fullPath = __DIR__ . '/' . $reqPath;
        $real = realpath($fullPath);
        $realBase = realpath(__DIR__ . '/uploads/contratos/');
        if (!$real || strpos($real, $realBase) !== 0 || !file_exists($real)) {
            http_response_code(404);
            echo json_encode(["error" => "Archivo no encontrado"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        header("Content-Type: application/pdf");
        header("Content-Length: " . filesize($real));
        header("Cache-Control: private, max-age=60");
        readfile($real);
        if (isset($conn)) $conn = null;
        exit;
    }
    // Firma de Gerencia: CRUD
    if ($action === 'upload_signature' && $method === 'POST') {
        if (!isset($_FILES['firma']) || $_FILES['firma']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(["message" => "Archivo de firma requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        $ext = strtolower(pathinfo($_FILES['firma']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['png', 'jpg', 'jpeg'])) {
            http_response_code(400);
            echo json_encode(["message" => "Formato inválido. Solo PNG/JPG"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        $filename = 'firma_gerente_' . time() . '_' . uniqid() . '.' . $ext;
        if (!move_uploaded_file($_FILES['firma']['tmp_name'], $signatureDir . $filename)) {
            http_response_code(500);
            echo json_encode(["message" => "Error al subir la firma"]);
            if (isset($conn)) $conn = null;
            exit;
        }
        $relativePath = '/uploads/contratos_firmas/' . $filename;
        $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('firma_gerente_contrato', :val)
                                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $stmt->execute([':val' => $relativePath]);
        echo json_encode(["success" => true, "path" => $relativePath]);
        if (isset($conn)) $conn = null;
        exit;
    }
    if ($action === 'get_signature' && $method === 'GET') {
        $stmtSig = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'firma_gerente_contrato' LIMIT 1");
        $stmtSig->execute();
        $sigRel = $stmtSig->fetchColumn();
        echo json_encode(["exists" => !empty($sigRel), "path" => $sigRel]);
        if (isset($conn)) $conn = null;
        exit;
    }
    if ($action === 'delete_signature' && ($method === 'DELETE' || $method === 'POST')) {
        $stmtSig = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'firma_gerente_contrato' LIMIT 1");
        $stmtSig->execute();
        $sigRel = $stmtSig->fetchColumn();
        if (!empty($sigRel)) {
            $fsPath = __DIR__ . '/' . ltrim($sigRel, '/');
            if (file_exists($fsPath)) { @unlink($fsPath); }
        }
        $conn->prepare("DELETE FROM system_settings WHERE setting_key = 'firma_gerente_contrato'")->execute();
        echo json_encode(["success" => true, "message" => "Firma eliminada"]);
        if (isset($conn)) $conn = null;
        exit;
    }
    if ($action === 'stats' && $method === 'GET') {
        $stats = [
            'total' => 0,
            'vigente' => 0,
            'por_vencer' => 0,
            'vencido' => 0,
            'finalizado' => 0
        ];

        // Total
        $stmt = $conn->query("SELECT COUNT(*) FROM contratos");
        $stats['total'] = $stmt->fetchColumn();

        // By Status
        $stmt = $conn->query("SELECT estado, COUNT(*) as count FROM contratos GROUP BY estado");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $key = strtolower(str_replace(' ', '_', $row['estado']));
            if (isset($stats[$key])) {
                $stats[$key] = $row['count'];
            }
        }

        // Calculate 'por_vencer' (Active but expiring in <= 30 days)
        // Note: 'Por Vencer' status might be explicitly set or calculated. 
        // If we rely on the 'estado' column, the above loop handles it.
        // But if we want to dynamic calculate based on dates for "Vigente" ones:
        $stmt = $conn->query("
            SELECT COUNT(*) FROM contratos 
            WHERE estado = 'Vigente' 
            AND fecha_fin IS NOT NULL 
            AND fecha_fin <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        ");
        $stats['por_vencer_calculated'] = $stmt->fetchColumn();

        echo json_encode(["success" => true, "data" => $stats]);
        if (isset($conn)) $conn = null;
        exit;
    }

    if ($action === 'generate' && $method === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['colaborador_id']) || empty($data['tipo_contrato'])) {
            $missing = [];
            if (empty($data['colaborador_id'])) $missing[] = 'colaborador_id';
            if (empty($data['tipo_contrato'])) $missing[] = 'tipo_contrato';
            
            if (isset($conn)) $conn = null;
            throw new Exception("Datos insuficientes para generar contrato. Faltan: " . implode(', ', $missing));
        }

        // Fetch collaborator data for fallback
        $stmt = $conn->prepare("SELECT * FROM colaboradores WHERE id = ?");
        $stmt->execute([$data['colaborador_id']]);
        $colab = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$colab) throw new Exception("Colaborador no encontrado.");

        // Use provided data or fallback to DB
        $cargo = !empty($data['cargo']) ? $data['cargo'] : ($colab['cargo'] ?? 'NO ASIGNADO');
        $area = !empty($data['area']) ? $data['area'] : ($colab['area'] ?? 'NO ASIGNADA');
        $horas_trabajo = !empty($data['horas_trabajo']) ? $data['horas_trabajo'] : '48 horas semanales';
        
        $inputNombres = isset($data['nombres']) ? trim((string)$data['nombres']) : '';
        $inputApellidos = isset($data['apellidos']) ? trim((string)$data['apellidos']) : '';
        if ($inputNombres !== '' || $inputApellidos !== '') {
            $colab_nombre_completo = trim($inputNombres . ' ' . ($inputApellidos !== '' ? $inputApellidos : (string)($colab['apellidos'] ?? '')));
        } else {
            $colab_nombre_completo = trim((string)($colab['nombres'] ?? '') . ' ' . (string)($colab['apellidos'] ?? ''));
        }
        $colab_dni = !empty($data['dni']) ? $data['dni'] : $colab['documento_numero'];
        $colab_direccion = !empty($data['direccion']) ? $data['direccion'] : ($colab['direccion'] ?? 'Domicilio no registrado');
        
        // Fetch company data
        $empresaQuery = "SELECT * FROM empresa_datos LIMIT 1";
        $empresaStmt = $conn->prepare($empresaQuery);
        $empresaStmt->execute();
        $empresa = $empresaStmt->fetch(PDO::FETCH_ASSOC);

        if (!$empresa) {
            $empresa = [];
        }

        $nombre_gerente = null;
        try {
            $gerenteQuery = "
                SELECT c.nombres, c.apellidos
                FROM colaboradores c
                JOIN usuarios u ON c.usuario_id = u.id
                JOIN roles r ON r.id = u.rol_id
                WHERE u.status = 'activo'
                  AND (u.rol_id = 7 OR LOWER(r.nombre) LIKE '%geren%')
                ORDER BY (u.rol_id = 7) DESC, u.id DESC
                LIMIT 1
            ";
            $gerenteStmt = $conn->prepare($gerenteQuery);
            $gerenteStmt->execute();
            $gerente = $gerenteStmt->fetch(PDO::FETCH_ASSOC);
            if ($gerente && (!empty($gerente['nombres']) || !empty($gerente['apellidos']))) {
                $nombre_gerente = trim(($gerente['nombres'] ?? '') . ' ' . ($gerente['apellidos'] ?? ''));
            }
        } catch (Throwable $e) {
        }

        if (!$nombre_gerente) {
            try {
                $userGerenteQuery = "
                    SELECT u.nombre_real, u.usuario
                    FROM usuarios u
                    JOIN roles r ON r.id = u.rol_id
                    WHERE u.status = 'activo'
                      AND (u.rol_id = 7 OR LOWER(r.nombre) LIKE '%geren%')
                    ORDER BY (u.rol_id = 7) DESC, u.id DESC
                    LIMIT 1
                ";
                $st = $conn->prepare($userGerenteQuery);
                $st->execute();
                $urow = $st->fetch(PDO::FETCH_ASSOC);
                $nombre_gerente = trim((string)($urow['nombre_real'] ?? $urow['usuario'] ?? '')) ?: null;
            } catch (Throwable $e) {
            }
        }

        if (!$nombre_gerente) {
            foreach (['representante_legal', 'representante_legal_nombre', 'nombre_representante', 'representante', 'gerente', 'gerente_nombre'] as $k) {
                if (!empty($empresa[$k])) {
                    $nombre_gerente = trim((string)$empresa[$k]);
                    break;
                }
            }
        }

        if (!$nombre_gerente) {
            $nombre_gerente = 'Representante no consignado';
        }

        // Fill defaults if keys missing
        $empresa['razon_social'] = $empresa['razon_social'] ?? 'EMPRESA NO CONFIGURADA';
        $empresa['ruc'] = $empresa['ruc'] ?? '00000000000';
        $empresa['direccion'] = $empresa['domicilio_fiscal'] ?? $empresa['direccion'] ?? 'Dirección no configurada';
        
        // Date formatting in Spanish
        $meses = array("Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre");
        $fecha_dia = date('d');
        $fecha_mes = $meses[date('n')-1];
        $fecha_anio = date('Y');
        $fecha_texto = "$fecha_dia de $fecha_mes del $fecha_anio";


        // Determine contract title and duration clause
        $tipo = mb_strtolower($data['tipo_contrato'], 'UTF-8');
        
        // Fetch Template from DB
        $stmtTpl = $conn->prepare("SELECT * FROM plantillas_contratos WHERE tipo_contrato = ? LIMIT 1");
        $stmtTpl->execute([$data['tipo_contrato']]);
        $template = $stmtTpl->fetch(PDO::FETCH_ASSOC);

        $body_content = "";
        
        // Default Variables
        $titulo_contrato = "CONTRATO DE TRABAJO";
        $denominacion_empleador = "EL EMPLEADOR";
        $denominacion_colaborador = "EL TRABAJADOR";

        if ($template) {
            // Use DB Template
            $titulo_contrato = $template['nombre'];
            if (mb_strtoupper(trim((string)$titulo_contrato), 'UTF-8') === 'CONTRATO FIJO') {
                $titulo_contrato = 'CONTRATO DE TRABAJO SUJETO A MODALIDAD POR NECESIDADES DEL MERCADO';
            }
            
            // Adjust denominations based on type if needed
            if (stripos($tipo, 'locación') !== false || stripos($tipo, 'locacion') !== false) {
                 $denominacion_empleador = "EL COMITENTE";
                 $denominacion_colaborador = "EL LOCADOR";
            }

            $stmtSec = $conn->prepare("SELECT * FROM secciones_contratos WHERE plantilla_id = ? ORDER BY orden ASC");
            $stmtSec->execute([$template['id']]);
            $sections = $stmtSec->fetchAll(PDO::FETCH_ASSOC);

            // Prepare replacements
            $replacements = [
                '{{NOMBRE_COLABORADOR}}' => $colab_nombre_completo,
                '{{DNI_COLABORADOR}}' => $colab_dni,
                '{{DIRECCION_COLABORADOR}}' => $colab_direccion,
                '{{CARGO_COLABORADOR}}' => $cargo,
                '{{AREA_COLABORADOR}}' => $area,
                '{{SALARIO}}' => number_format($data['salario'], 2),
                '{{FECHA_INICIO}}' => $data['fecha_inicio'],
                '{{FECHA_FIN}}' => $data['fecha_fin'] ?? 'indefinido',
                '{{TITULO_CONTRATO}}' => $titulo_contrato,
                '{{DENOMINACION_EMPLEADOR}}' => $denominacion_empleador,
                '{{DENOMINACION_COLABORADOR}}' => $denominacion_colaborador,
                '{{NOMBRE_GERENTE}}' => $nombre_gerente,
                '{{REPRESENTANTE_LEGAL}}' => $nombre_gerente,
                '{{NOMBRE_REPRESENTANTE}}' => $nombre_gerente,
                '{{RAZON_SOCIAL_EMPRESA}}' => $empresa['razon_social'],
                '{{RUC_EMPRESA}}' => $empresa['ruc'],
                '{{DIRECCION_EMPRESA}}' => $empresa['direccion'],
                '{{TIPO_CONTRATO_TEXTO}}' => $data['tipo_contrato'],
                '{{HORAS_TRABAJO}}' => $horas_trabajo
            ];

            // Header with Title
            $body_content .= "<div class='header'>
                <strong>{$empresa['razon_social']}</strong><br>
                <small>RUC: {$empresa['ruc']}</small>
            </div>
            <div class='title'>{$titulo_contrato}</div>";

            foreach ($sections as $section) {
                $content = $section['contenido'];
                foreach ($replacements as $key => $val) {
                    $content = str_replace($key, $val, $content);
                }
                
                $body_content .= "<div class='section'>
                    " . ($section['titulo'] !== 'INTRODUCCIÓN' ? "<div class='clause-title'>{$section['titulo']}</div>" : "") . "
                    <div>{$content}</div>
                </div>";
            }

        } else {
             // Fallback if template not found
             $body_content = "<div class='title'>PLANTILLA NO ENCONTRADA PARA: {$data['tipo_contrato']}</div>";
             $body_content .= "<div class='section'>Por favor, configure una plantilla para este tipo de contrato en la sección de gestión de plantillas.</div>";
        }

        // Add Signatures Block (Common)
        // Firma de Gerencia (imagen)
        $stmtSig = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'firma_gerente_contrato' LIMIT 1");
        $stmtSig->execute();
        $sigRel = $stmtSig->fetchColumn();
        $firmaImgHtml = "";
        if (!empty($sigRel)) {
            $fsPath = __DIR__ . '/' . ltrim($sigRel, '/');
            if (file_exists($fsPath)) {
                $mime = function_exists('mime_content_type') ? mime_content_type($fsPath) : 'image/png';
                $base64 = base64_encode(file_get_contents($fsPath));
                $firmaImgHtml = '<img src="data:' . $mime . ';base64,' . $base64 . '" style="height:70px; margin-bottom:5px;" />';
            }
        }

        $body_content .= "
            <div class='section'>
                Leído el presente contrato y estando las partes conformes con su contenido, lo firman en señal de aceptación en la ciudad de Lima, el día <strong>" . $fecha_dia . "</strong> de <strong>" . $fecha_mes . "</strong> del <strong>" . $fecha_anio . "</strong>.
            </div>

            <div class='signatures'>
                <div class='sig-box'>
                    " . $firmaImgHtml . "
                    <strong>{$denominacion_empleador}</strong><br>
                    {$empresa['razon_social']}<br>
                    RUC: {$empresa['ruc']}
                </div>
                <div class='sig-box'>
                    <br><br>
                    <strong>{$denominacion_colaborador}</strong><br>
                    {$colab_nombre_completo}<br>
                    " . ((stripos($tipo, 'locación') !== false) ? "RUC/DNI" : "DNI") . ": {$colab_dni}
                </div>
            </div>

            <div class='footer'>
                Documento generado electrónicamente el " . date('d/m/Y') . " a las " . date('H:i:s') . "
            </div>";

        $body_content = str_ireplace(
            'CONTRATO FIJO',
            'CONTRATO DE TRABAJO SUJETO A MODALIDAD POR NECESIDADES DEL MERCADO',
            $body_content
        );

        // Prepare HTML Content
        $html = "
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Times New Roman', serif; 
                    font-size: 11pt; 
                    line-height: 1.5; 
                    color: #000;
                    margin: 2.5cm 2.5cm;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    font-family: Arial, sans-serif;
                }
                .title { 
                    text-align: center; 
                    font-weight: bold; 
                    font-size: 14pt;
                    margin-bottom: 25px; 
                    text-transform: uppercase; 
                    text-decoration: underline;
                }
                .section { 
                    margin-bottom: 15px; 
                    text-align: justify; 
                }
                .clause-title {
                    font-weight: bold;
                    text-transform: uppercase;
                    text-decoration: underline;
                }
                .signatures { 
                    margin-top: 80px; 
                    width: 100%; 
                    page-break-inside: avoid;
                }
                .sig-box { 
                    width: 45%; 
                    float: left; 
                    text-align: center; 
                    border-top: 1px solid black; 
                    margin: 0 2.5%; 
                    padding-top: 5px;
                    font-size: 10pt;
                }
                .footer {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    font-size: 8pt;
                    text-align: center;
                    color: #555;
                    border-top: 1px solid #eee;
                    padding-top: 5px;
                }
            </style>
        </head>
        <body>
            {$body_content}
        </body>
        </html>";

        // Generate PDF
        $options = new Options();
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', true);
        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        $filename = 'contrato_' . $colab_dni . '_' . time() . '.pdf';
        file_put_contents($uploadDir . $filename, $dompdf->output());

        // Return the filename so frontend can save it to the DB record
        echo json_encode([
            "message" => "Contrato generado exitosamente.",
            "filename" => $filename,
            "url" => '/uploads/contratos/' . $filename
        ]);
        if (isset($conn)) $conn = null;
        exit;

    } elseif ($action === 'sign' && $method === 'POST') {
        $data = $signData;

        if (!is_array($data) || empty($data['id']) || empty($data['role'])) {
            if (isset($conn)) $conn = null;
            throw new Exception("ID y rol requeridos.");
        }

        if ($data['role'] !== 'gerencia') {
            http_response_code(403);
            echo json_encode(["message" => "No autorizado"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        $now = date('Y-m-d H:i:s');
        $stmt = $conn->prepare("UPDATE contratos SET firma_gerencia = :now WHERE id = :id");
        $stmt->execute([':now' => $now, ':id' => $data['id']]);

        echo json_encode(["message" => "Contrato firmado correctamente."]);
        if (isset($conn)) $conn = null;
        exit;
    }

    // Handle unique areas request
    if ($action === 'areas' && $method === 'GET') {
        // Fetch areas from collaborators since they are the master source of areas
        $query = "SELECT DISTINCT area FROM colaboradores WHERE area IS NOT NULL AND area != '' ORDER BY area";
        $stmt = $conn->prepare($query);
        $stmt->execute();
        $areas = $stmt->fetchAll(PDO::FETCH_COLUMN);
        echo json_encode(["success" => true, "data" => $areas]);
        if (isset($conn)) $conn = null;
        exit;
    }

    // Standard CRUD
    switch ($method) {
        case 'GET':
            // Pagination
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = ($page - 1) * $limit;
            $search = isset($_GET['search']) ? $_GET['search'] : '';
            $filterStatus = isset($_GET['status']) ? $_GET['status'] : '';
            $filterArea = isset($_GET['area']) ? $_GET['area'] : '';
            $colaboradorId = isset($_GET['colaborador_id']) ? (int)$_GET['colaborador_id'] : 0;

            // Base SQL
            $whereSQL = "WHERE 1=1";
            $params = [];

            if (!empty($search)) {
                $whereSQL .= " AND (c.nombres LIKE :search OR c.apellidos LIKE :search OR c.documento_numero LIKE :search OR co.tipo_contrato LIKE :search)";
                $params[':search'] = "%$search%";
            }
            if (!empty($filterStatus)) {
                $whereSQL .= " AND co.estado = :status";
                $params[':status'] = $filterStatus;
            }
            if (!empty($filterArea)) {
                $whereSQL .= " AND co.area = :area";
                $params[':area'] = $filterArea;
            }
            if ($colaboradorId > 0) {
                $whereSQL .= " AND co.colaborador_id = :colaborador_id";
                $params[':colaborador_id'] = $colaboradorId;
            }

            // Alerts logic: Contracts expiring in 30 days
            if (isset($_GET['alerts'])) {
                $whereSQL .= " AND co.fecha_fin BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND co.estado = 'Vigente'";
            }

            // Count
            $countQuery = "SELECT COUNT(*) as total 
                           FROM contratos co
                           JOIN colaboradores c ON co.colaborador_id = c.id
                           $whereSQL";
            $countStmt = $conn->prepare($countQuery);
            $countStmt->execute($params);
            $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];
            $totalPages = ceil($total / $limit);

            // Fetch
            $orderBy = "co.estado = 'Por Vencer' DESC, co.fecha_fin ASC";
            if ($colaboradorId > 0) {
                $orderBy = "co.id DESC";
            }
            $query = "SELECT co.*, c.nombres, c.apellidos, c.documento_numero 
                      FROM contratos co
                      JOIN colaboradores c ON co.colaborador_id = c.id
                      $whereSQL
                      ORDER BY $orderBy
                      LIMIT :limit OFFSET :offset";
            
            $stmt = $conn->prepare($query);
            foreach ($params as $key => $val) {
                $stmt->bindValue($key, $val);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Process URL for files
            foreach ($data as &$row) {
                if ($row['archivo_url']) {
                    $row['archivo_url'] = '/uploads/contratos/' . basename($row['archivo_url']);
                }
            }

            echo json_encode([
                "data" => $data,
                "pagination" => [
                    "total" => $total,
                    "page" => $page,
                    "limit" => $limit,
                    "totalPages" => $totalPages
                ]
            ]);
            break;

        case 'POST':
            $data = $_POST;
            
            // Check if it's an UPDATE (has ID)
            if (!empty($data['id'])) {
                // UPDATE LOGIC
                $id = $data['id'];
                
                // File Upload for Update
                $archivo_sql = "";
                $params = [
                    ':colaborador_id' => $data['colaborador_id'],
                    ':tipo_contrato' => $data['tipo_contrato'],
                    ':fecha_inicio' => $data['fecha_inicio'],
                    ':fecha_fin' => !empty($data['fecha_fin']) ? $data['fecha_fin'] : null,
                    ':salario' => !empty($data['salario']) ? $data['salario'] : null,
                    ':estado' => $data['estado'] ?? 'Vigente',
                    ':observaciones' => $data['observaciones'] ?? '',
                    ':id' => $id
                ];

                if (isset($_FILES['archivo']) && $_FILES['archivo']['error'] === UPLOAD_ERR_OK) {
                    $ext = pathinfo($_FILES['archivo']['name'], PATHINFO_EXTENSION);
                    if (strtolower($ext) !== 'pdf') {
                        http_response_code(400); echo json_encode(["message" => "Solo se permiten archivos PDF."]); 
                        if (isset($conn)) $conn = null;
                        exit;
                    }
                    $filename = 'contrato_' . time() . '_' . uniqid() . '.pdf';
                    if (move_uploaded_file($_FILES['archivo']['tmp_name'], $uploadDir . $filename)) {
                        $archivo_sql = ", archivo_url = :archivo_url";
                        $params[':archivo_url'] = $filename;
                    }
                }
                // Also support updating filename if generated via frontend separately (though we'll likely save it directly)
                // For now, if frontend sends 'generated_filename', we can use it.
                if (isset($_POST['generated_filename'])) {
                    $archivo_sql = ", archivo_url = :archivo_url";
                    $params[':archivo_url'] = $_POST['generated_filename'];
                }

                $sql = "UPDATE contratos SET 
                    colaborador_id = :colaborador_id,
                    tipo_contrato = :tipo_contrato,
                    fecha_inicio = :fecha_inicio,
                    fecha_fin = :fecha_fin,
                    salario = :salario,
                    regimen_pensionario = :regimen_pensionario,
                    afp_cuspp = :afp_cuspp,
                    asignacion_familiar = :asignacion_familiar,
                    estado = :estado,
                    observaciones = :observaciones,
                    cargo = :cargo,
                    area = :area
                    $archivo_sql
                    WHERE id = :id";
                
                $params[':cargo'] = $data['cargo'] ?? null;
                $params[':area'] = $data['area'] ?? null;
                $params[':regimen_pensionario'] = $data['regimen_pensionario'] ?? null;
                $params[':afp_cuspp'] = !empty($data['afp_cuspp']) ? strtoupper($data['afp_cuspp']) : null;
                $params[':asignacion_familiar'] = !empty($data['asignacion_familiar']) ? 1 : 0;

                $stmt = $conn->prepare($sql);
                $stmt->execute($params);
                echo json_encode(["message" => "Contrato actualizado."]);

            } else {
                // INSERT LOGIC
                // Validation
                if (empty($data['colaborador_id']) || empty($data['fecha_inicio']) || empty($data['tipo_contrato'])) {
                    http_response_code(400);
                    echo json_encode(["message" => "Datos requeridos faltantes."]);
                    if (isset($conn)) $conn = null;
                    exit;
                }

                $stmt = $conn->prepare("
                    UPDATE contratos
                    SET
                      estado = 'Finalizado',
                      fecha_fin = CASE
                        WHEN fecha_fin IS NULL OR fecha_fin >= :new_start
                          THEN DATE_SUB(:new_start, INTERVAL 1 DAY)
                        ELSE fecha_fin
                      END
                    WHERE colaborador_id = :colab_id
                      AND estado <> 'Finalizado'
                      AND fecha_inicio < :new_start
                      AND (fecha_fin IS NULL OR fecha_fin >= :new_start)
                ");
                $stmt->execute([
                    ':new_start' => $data['fecha_inicio'],
                    ':colab_id' => $data['colaborador_id']
                ]);

                // File Upload
                $archivo_url = null;
                if (isset($_FILES['archivo']) && $_FILES['archivo']['error'] === UPLOAD_ERR_OK) {
                    $ext = pathinfo($_FILES['archivo']['name'], PATHINFO_EXTENSION);
                    if (strtolower($ext) !== 'pdf') {
                        http_response_code(400);
                        echo json_encode(["message" => "Solo se permiten archivos PDF."]);
                        $conn = null;
                        exit;
                    }
                    $filename = 'contrato_' . time() . '_' . uniqid() . '.pdf';
                    if (move_uploaded_file($_FILES['archivo']['tmp_name'], $uploadDir . $filename)) {
                        $archivo_url = $filename; 
                    } else {
                        throw new Exception("Error al subir archivo.");
                    }
                }
                
                if (isset($_POST['generated_filename'])) {
                    $archivo_url = $_POST['generated_filename'];
                }

                // Insert
                $sql = "INSERT INTO contratos (
                colaborador_id, tipo_contrato, fecha_inicio, fecha_fin, salario, regimen_pensionario, afp_cuspp, asignacion_familiar, archivo_url, estado, observaciones, cargo, area, horas_trabajo
            ) VALUES (
                :colaborador_id, :tipo_contrato, :fecha_inicio, :fecha_fin, :salario, :regimen_pensionario, :afp_cuspp, :asignacion_familiar, :archivo_url, :estado, :observaciones, :cargo, :area, :horas_trabajo
            )";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':colaborador_id' => $data['colaborador_id'],
                ':tipo_contrato' => $data['tipo_contrato'],
                ':fecha_inicio' => $data['fecha_inicio'],
                ':fecha_fin' => !empty($data['fecha_fin']) ? $data['fecha_fin'] : null,
                ':salario' => !empty($data['salario']) ? $data['salario'] : null,
                ':regimen_pensionario' => $data['regimen_pensionario'] ?? null,
                ':afp_cuspp' => !empty($data['afp_cuspp']) ? strtoupper($data['afp_cuspp']) : null,
                ':asignacion_familiar' => !empty($data['asignacion_familiar']) ? 1 : 0,
                ':archivo_url' => $archivo_url,
                ':estado' => $data['estado'] ?? 'Vigente',
                ':observaciones' => $data['observaciones'] ?? '',
                ':cargo' => $data['cargo'] ?? null,
                ':area' => $data['area'] ?? null,
                ':horas_trabajo' => $data['horas_trabajo'] ?? null
            ]);

                echo json_encode(["message" => "Contrato registrado correctamente."]);
            }
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400); echo json_encode(["message" => "ID requerido."]); 
                if (isset($conn)) $conn = null;
                exit;
            }
            
            // Get file path to delete
            $stmt = $conn->prepare("SELECT archivo_url FROM contratos WHERE id = ?");
            $stmt->execute([$id]);
            $file = $stmt->fetchColumn();
            
            if ($file && file_exists($uploadDir . $file)) {
                unlink($uploadDir . $file);
            }

            $stmt = $conn->prepare("DELETE FROM contratos WHERE id = ?");
            $stmt->execute([$id]);

            echo json_encode(["message" => "Contrato eliminado."]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Error: " . $e->getMessage()]);
}
$conn = null;
?>
