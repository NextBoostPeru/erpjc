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
    echo json_encode(["success" => false, "message" => "Acceso no autorizado"]);
    if (isset($conn)) $conn = null;
    exit;
}

// Ensure table exists
try {
    $conn->exec("
        CREATE TABLE IF NOT EXISTS papeletas_servicio (
            id INT AUTO_INCREMENT PRIMARY KEY,
            colaborador_id INT NOT NULL,
            tipo ENUM('Atencion Medica', 'Permiso Con Goce', 'Permiso Sin Goce', 'Licencia Con Goce', 'Licencia Sin Goce') NOT NULL,
            motivo TEXT NULL,
            fecha_del DATE NOT NULL,
            fecha_al DATE NOT NULL,
            hora_salida TIME NULL,
            hora_retorno TIME NULL,
            lugar VARCHAR(255) NULL,
            observaciones TEXT NULL,
            estado ENUM('Pendiente', 'Aprobado', 'Rechazado') DEFAULT 'Pendiente',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by INT NULL,
            FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
} catch (Exception $e) {
    // Ignore if exists
}

try {
    if ($method === 'GET' && $action === 'list') {
        $sql = "SELECT p.*, c.nombres, c.apellidos, c.documento_numero, c.cargo 
                FROM papeletas_servicio p
                JOIN colaboradores c ON p.colaborador_id = c.id
                ORDER BY p.created_at DESC";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($result);

    } elseif ($method === 'GET' && $action === 'list_colaboradores') {
        $sql = "SELECT id, nombres, apellidos, documento_numero, cargo 
                FROM colaboradores 
                WHERE estado = 'Activo' 
                ORDER BY apellidos, nombres";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($result);

    } elseif ($method === 'POST' && $action === 'create') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['colaborador_id']) || empty($data['tipo']) || empty($data['fecha_del'])) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            exit;
        }

        $sql = "INSERT INTO papeletas_servicio (colaborador_id, tipo, motivo, fecha_del, fecha_al, hora_salida, hora_retorno, lugar, observaciones, created_by)
                VALUES (:colaborador_id, :tipo, :motivo, :fecha_del, :fecha_al, :hora_salida, :hora_retorno, :lugar, :observaciones, :created_by)";
        
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            ':colaborador_id' => $data['colaborador_id'],
            ':tipo' => $data['tipo'],
            ':motivo' => $data['motivo'] ?? '',
            ':fecha_del' => $data['fecha_del'],
            ':fecha_al' => $data['fecha_al'] ?? $data['fecha_del'],
            ':hora_salida' => !empty($data['hora_salida']) ? $data['hora_salida'] : null,
            ':hora_retorno' => !empty($data['hora_retorno']) ? $data['hora_retorno'] : null,
            ':lugar' => $data['lugar'] ?? '',
            ':observaciones' => $data['observaciones'] ?? '',
            ':created_by' => $userId
        ]);

        echo json_encode(["success" => true, "message" => "Papeleta creada correctamente"]);

    } elseif ($method === 'PUT' && $action === 'update_status') {
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['id']) || empty($data['estado'])) {
            http_response_code(400);
            echo json_encode(["message" => "Datos incompletos"]);
            exit;
        }

        $sql = "UPDATE papeletas_servicio SET estado = ? WHERE id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$data['estado'], $data['id']]);

        echo json_encode(["success" => true, "message" => "Estado actualizado"]);

    } elseif ($method === 'POST' && $action === 'generate_pdf') {
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["message" => "ID requerido"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        // Fetch Papeleta Data
        $sql = "SELECT p.*, c.nombres, c.apellidos, c.documento_numero, c.cargo, c.area_id, a.nombre as area_nombre
                FROM papeletas_servicio p
                JOIN colaboradores c ON p.colaborador_id = c.id
                LEFT JOIN areas a ON c.area_id = a.id
                WHERE p.id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            http_response_code(404);
            echo json_encode(["message" => "Papeleta no encontrada"]);
            if (isset($conn)) $conn = null;
            exit;
        }

        // Fetch Company Data
        $stmtEmp = $conn->query("SELECT ruc, razon_social, nombre_comercial, domicilio_fiscal FROM empresa_datos LIMIT 1");
        $empresaRow = $stmtEmp->fetch(PDO::FETCH_ASSOC) ?: [];
        $empresaNombre = !empty($empresaRow['razon_social']) ? $empresaRow['razon_social'] : ($empresaRow['nombre_comercial'] ?? 'EMPRESA');
        $empresaRuc = $empresaRow['ruc'] ?? '';
        
        // Setup Dompdf
        $options = new Options();
        $options->set('isRemoteEnabled', true);
        $dompdf = new Dompdf($options);

        // Helper to check checkbox
        $check = function($val, $target) {
            return $val === $target ? 'X' : '&nbsp;&nbsp;';
        };

        $html = '
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
                .header { text-align: center; margin-bottom: 20px; }
                .title { font-size: 16px; font-weight: bold; margin-top: 10px; border: 1px solid #000; padding: 5px; background: #f0f0f0; }
                .section { margin-bottom: 15px; }
                .row { display: block; margin-bottom: 8px; }
                .label { font-weight: bold; width: 120px; display: inline-block; }
                .value { border-bottom: 1px solid #ccc; min-width: 200px; display: inline-block; padding-left: 5px; }
                
                .checkbox-group { margin: 10px 0; border: 1px solid #ccc; padding: 10px; }
                .cb-row { margin-bottom: 5px; }
                .cb-box { border: 1px solid #000; width: 16px; height: 16px; display: inline-block; text-align: center; margin-right: 5px; font-weight: bold; }
                
                .signatures { width: 100%; margin-top: 60px; }
                .sig-box { width: 30%; display: inline-block; text-align: center; border-top: 1px solid #000; margin: 0 1.5%; font-size: 10px; }
                
                table { width: 100%; border-collapse: collapse; }
                td { vertical-align: top; padding: 4px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div style="font-size: 14px; font-weight: bold;">' . mb_strtoupper($empresaNombre) . '</div>
                <div style="font-size: 12px;">RUC: ' . $empresaRuc . '</div>
                <div class="title">PAPELETA DE SALIDA / SERVICIO</div>
            </div>

            <div class="section">
                <table width="100%">
                    <tr>
                        <td width="15%" class="label">Apellidos y Nombres:</td>
                        <td width="85%" style="border-bottom: 1px solid #ccc;">' . $row['apellidos'] . ', ' . $row['nombres'] . '</td>
                    </tr>
                    <tr>
                        <td class="label">Cargo / Área:</td>
                        <td style="border-bottom: 1px solid #ccc;">' . $row['cargo'] . ' / ' . ($row['area_nombre'] ?? '-') . '</td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <div style="font-weight: bold; margin-bottom: 5px; background: #eee; padding: 3px;">MOTIVO:</div>
                <table width="100%">
                    <tr>
                        <td><div class="cb-box">' . $check($row['tipo'], 'Atencion Medica') . '</div> Atención Médica</td>
                        <td><div class="cb-box">' . $check($row['tipo'], 'Permiso Con Goce') . '</div> Permiso c/ Goce</td>
                        <td><div class="cb-box">' . $check($row['tipo'], 'Permiso Sin Goce') . '</div> Permiso s/ Goce</td>
                    </tr>
                    <tr>
                        <td><div class="cb-box">' . $check($row['tipo'], 'Licencia Con Goce') . '</div> Licencia c/ Goce</td>
                        <td><div class="cb-box">' . $check($row['tipo'], 'Licencia Sin Goce') . '</div> Licencia s/ Goce</td>
                        <td></td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <div style="font-weight: bold; margin-bottom: 5px;">DETALLE / JUSTIFICACIÓN:</div>
                <div style="border: 1px solid #ccc; padding: 10px; min-height: 40px;">
                    ' . ($row['motivo'] ? nl2br($row['motivo']) : '-') . '
                </div>
            </div>

            <div class="section">
                <table width="100%">
                    <tr>
                        <td width="20%" class="label">Fecha Del:</td>
                        <td width="30%" style="border-bottom: 1px solid #ccc;">' . date('d/m/Y', strtotime($row['fecha_del'])) . '</td>
                        <td width="20%" class="label">Al:</td>
                        <td width="30%" style="border-bottom: 1px solid #ccc;">' . date('d/m/Y', strtotime($row['fecha_al'])) . '</td>
                    </tr>
                    <tr>
                        <td class="label">Hora Salida:</td>
                        <td style="border-bottom: 1px solid #ccc;">' . ($row['hora_salida'] ? date('H:i', strtotime($row['hora_salida'])) : '-') . '</td>
                        <td class="label">Hora Retorno:</td>
                        <td style="border-bottom: 1px solid #ccc;">' . ($row['hora_retorno'] ? date('H:i', strtotime($row['hora_retorno'])) : '-') . '</td>
                    </tr>
                    <tr>
                        <td class="label">Lugar / Destino:</td>
                        <td colspan="3" style="border-bottom: 1px solid #ccc;">' . ($row['lugar'] ?: '-') . '</td>
                    </tr>
                </table>
            </div>
            
            <div class="section">
                <div style="font-weight: bold; margin-bottom: 5px;">OBSERVACIONES:</div>
                <div style="border: 1px solid #ccc; padding: 10px; min-height: 30px;">
                    ' . ($row['observaciones'] ? nl2br($row['observaciones']) : 'Ninguna') . '
                </div>
            </div>

            <div class="signatures">
                <div class="sig-box">
                    <br><br><br>
                    __________________________<br>
                    SOLICITANTE<br>
                    (Firma del Colaborador)
                </div>
                <div class="sig-box">
                    <br><br><br>
                    __________________________<br>
                    JEFE INMEDIATO<br>
                    (Autorización)
                </div>
                <div class="sig-box">
                    <br><br><br>
                    __________________________<br>
                    RECURSOS HUMANOS<br>
                    (Visto Bueno)
                </div>
            </div>
            
            <div style="margin-top: 30px; font-size: 9px; color: #666; text-align: center;">
                Fecha de impresión: ' . date('d/m/Y H:i:s') . '
            </div>
        </body>
        </html>
        ';

        $dompdf->loadHtml($html);
        $dompdf->setPaper('A5', 'landscape'); // Half page landscape is common for slips
        $dompdf->render();

        $pdfBase64 = base64_encode($dompdf->output());
        echo json_encode(["success" => true, "pdf_base64" => $pdfBase64]);

    } else {
        http_response_code(404);
        echo json_encode(["message" => "Acción no encontrada"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
    if (isset($conn)) $conn = null;
}
if (isset($conn)) $conn = null;
?>
