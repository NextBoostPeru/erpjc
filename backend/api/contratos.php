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

if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

try {
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
        
        $colab_nombre_completo = !empty($data['nombres']) ? $data['nombres'] : ($colab['nombres'] . ' ' . $colab['apellidos']);
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

        // Fetch Manager (Gerente) - Role ID 7
        $gerenteQuery = "SELECT c.nombres, c.apellidos FROM colaboradores c
                         JOIN usuarios u ON c.usuario_id = u.id
                         WHERE u.rol_id = 7 AND u.status = 'activo' LIMIT 1";
        $gerenteStmt = $conn->prepare($gerenteQuery);
        $gerenteStmt->execute();
        $gerente = $gerenteStmt->fetch(PDO::FETCH_ASSOC);
        
        $nombre_gerente = $gerente ? ($gerente['nombres'] . ' ' . $gerente['apellidos']) : ($empresa['representante_legal'] ?? 'Representante no configurado');

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
                '{{TITULO_CONTRATO}}' => $template['nombre'],
                '{{DENOMINACION_EMPLEADOR}}' => $denominacion_empleador,
                '{{DENOMINACION_COLABORADOR}}' => $denominacion_colaborador,
                '{{NOMBRE_GERENTE}}' => $nombre_gerente,
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
        $body_content .= "
            <div class='section'>
                Leído el presente contrato y estando las partes conformes con su contenido, lo firman en señal de aceptación en la ciudad de Lima, el día <strong>" . $fecha_dia . "</strong> de <strong>" . $fecha_mes . "</strong> del <strong>" . $fecha_anio . "</strong>.
            </div>

            <div class='signatures'>
                <div class='sig-box'>
                    <br><br>
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
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['id']) || empty($data['role'])) {
            if (isset($conn)) $conn = null;
            throw new Exception("ID y rol requeridos.");
        }

        $field = ($data['role'] === 'gerencia') ? 'firma_gerencia' : 'firma_colaborador';
        $now = date('Y-m-d H:i:s');

        $sql = "UPDATE contratos SET $field = :now WHERE id = :id";
        $stmt = $conn->prepare($sql);
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

            // Base SQL
            $whereSQL = "WHERE 1=1";
            $params = [];

            if (!empty($search)) {
                $whereSQL .= " AND (c.nombres LIKE :search OR c.apellidos LIKE :search OR co.tipo_contrato LIKE :search)";
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
            $query = "SELECT co.*, c.nombres, c.apellidos, c.documento_numero 
                      FROM contratos co
                      JOIN colaboradores c ON co.colaborador_id = c.id
                      $whereSQL
                      ORDER BY co.estado = 'Por Vencer' DESC, co.fecha_fin ASC
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
                    estado = :estado,
                    observaciones = :observaciones,
                    cargo = :cargo,
                    area = :area
                    $archivo_sql
                    WHERE id = :id";
                
                $params[':cargo'] = $data['cargo'] ?? null;
                $params[':area'] = $data['area'] ?? null;

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
                colaborador_id, tipo_contrato, fecha_inicio, fecha_fin, salario, archivo_url, estado, observaciones, cargo, area, horas_trabajo
            ) VALUES (
                :colaborador_id, :tipo_contrato, :fecha_inicio, :fecha_fin, :salario, :archivo_url, :estado, :observaciones, :cargo, :area, :horas_trabajo
            )";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':colaborador_id' => $data['colaborador_id'],
                ':tipo_contrato' => $data['tipo_contrato'],
                ':fecha_inicio' => $data['fecha_inicio'],
                ':fecha_fin' => !empty($data['fecha_fin']) ? $data['fecha_fin'] : null,
                ':salario' => !empty($data['salario']) ? $data['salario'] : null,
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
