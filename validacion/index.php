<?php
date_default_timezone_set('America/Lima');

if (php_sapi_name() !== 'cli') {
    header("X-Content-Type-Options: nosniff");
    header("X-Frame-Options: DENY");
    header("X-XSS-Protection: 1; mode=block");
    header("Referrer-Policy: strict-origin-when-cross-origin");
    header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none';");
}

if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    // OK
} else {
    if (!empty($_SERVER['HTTP_HOST']) && !empty($_SERVER['REQUEST_URI'])) {
        $httpsUrl = 'https://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
        header("Location: " . $httpsUrl, true, 301);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'Método no permitido';
    exit;
}

function rate_limit_validation($limit = 60, $window = 300) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $dir = __DIR__ . '/cache';
    if (!file_exists($dir)) {
        @mkdir($dir, 0755, true);
    }
    $file = $dir . '/rl_' . md5($ip) . '.json';
    $now = time();
    $data = ['start' => $now, 'count' => 0];
    if (file_exists($file)) {
        $json = @file_get_contents($file);
        $saved = json_decode($json, true);
        if (is_array($saved) && isset($saved['start'], $saved['count'])) {
            if (($now - $saved['start']) < $window) {
                $data = $saved;
            }
        }
    }
    if ($data['count'] >= $limit) {
        http_response_code(429);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Demasiadas solicitudes desde esta dirección. Intente nuevamente más tarde.';
        exit;
    }
    $data['count']++;
    @file_put_contents($file, json_encode($data));
}

rate_limit_validation();

$host ="76.13.160.64";
$db_name ="erpjc";
$username ="adminremote";
$password ="Nextboost@2026";

try {
    $pdo = new PDO("mysql:host={$host};dbname={$db_name}", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8"
    ]);
    $pdo->exec("SET time_zone = '-05:00'");
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'Error interno de conexión.';
    exit;
}

function h($value) {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

$codigo = isset($_GET['codigo']) ? trim($_GET['codigo']) : '';
$dni    = isset($_GET['dni']) ? trim($_GET['dni']) : '';
$tipo   = isset($_GET['tipo']) ? trim($_GET['tipo']) : '';

if ($dni !== '' && (!ctype_digit($dni) || strlen($dni) !== 8)) {
    http_response_code(400);
    $cert = null;
    $errorMessage = 'El enlace de validación es inválido.';
} elseif ($codigo === '' || !preg_match('/^[A-Z]{2}-\d{4}-\d{4}-[A-Z0-9]+$/', $codigo)) {
    http_response_code(400);
    $cert = null;
    $errorMessage = 'El enlace de validación es inválido.';
} else {
    $cert = null;
    $errorMessage = '';

    if ($codigo !== '' && $dni !== '') {
        try {
            $sql = "
            SELECT 
                ch.*,
                c.nombres,
                c.apellidos,
                c.documento_numero,
                c.cargo AS cargo_colab,
                e.razon_social,
                e.ruc
            FROM certificados_historial ch
            INNER JOIN colaboradores c ON c.id = ch.colaborador_id
            LEFT JOIN empresa_datos e ON 1=1
            WHERE ch.codigo = :codigo
              AND c.documento_numero = :dni
              AND ch.estado = 'Activo'
              " . ($tipo !== '' ? "AND ch.tipo_documento = :tipo" : "") . "
            ORDER BY ch.fecha_emision DESC
            LIMIT 1
        ";
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':codigo', $codigo);
            $stmt->bindValue(':dni', $dni);
            if ($tipo !== '') {
                $stmt->bindValue(':tipo', $tipo);
            }
            $stmt->execute();
            $cert = $stmt->fetch();
            if (!$cert) {
                $errorMessage = 'No se encontró un certificado activo que coincida con los datos proporcionados.';
            }
        } catch (Exception $e) {
            $cert = null;
            $errorMessage = 'Ocurrió un error al validar el certificado.';
        }
    } else {
        $errorMessage = 'Datos incompletos. El enlace de validación es inválido.';
    }
}

$empresaNombre = $cert['razon_social'] ?? 'CONSULTORIA GRUPO JC S.A.C.';
$empresaRuc    = $cert['ruc'] ?? '';

$fechaEmision = '';
if (!empty($cert['fecha_emision'])) {
    $fechaEmision = date('d/m/Y H:i', strtotime($cert['fecha_emision']));
}

$fi = '';
if (!empty($cert['fecha_inicio'])) {
    $fi = date('d/m/Y', strtotime($cert['fecha_inicio']));
}
$ff = '';
if (!empty($cert['fecha_fin'])) {
    $ff = date('d/m/Y', strtotime($cert['fecha_fin']));
}

?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Validación de Certificado</title>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: radial-gradient(circle at top, #eff6ff 0, #e5e7eb 45%, #f3f4f6 100%);
            margin: 0;
            padding: 0;
            color: #111827;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 32px 16px 40px 16px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .card {
            background: #ffffff;
            border-radius: 16px;
            padding: 24px 28px 20px 28px;
            box-shadow: 0 18px 45px rgba(15,23,42,0.14);
            border: 1px solid #e5e7eb;
            width: 100%;
            max-width: 900px;
            position: relative;
            overflow: hidden;
        }
        .card-valid {
            border-color: #6ee7b7;
            box-shadow: 0 18px 45px rgba(5,150,105,0.22);
        }
        .card-invalid {
            border-color: #fecaca;
            box-shadow: 0 18px 45px rgba(185,28,28,0.2);
        }
        .card::before {
            content: "";
            position: absolute;
            top: -60px;
            right: -60px;
            width: 180px;
            height: 180px;
            border-radius: 999px;
            background: radial-gradient(circle at center, rgba(37,99,235,0.12), transparent 65%);
            pointer-events: none;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
        }
        .title-block {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .logo {
            font-weight: 700;
            font-size: 19px;
            color: #1d4ed8;
        }
        .subtitle {
            font-size: 12px;
            color: #6b7280;
        }
        .pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 9px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 500;
            color: #1f2937;
            background: #eff6ff;
            border: 1px solid #dbeafe;
            margin-top: 4px;
        }
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
        }
        .status-ok {
            background: #ecfdf5;
            color: #047857;
            border: 1px solid #6ee7b7;
        }
        .status-bad {
            background: #fef2f2;
            color: #b91c1c;
            border: 1px solid #fecaca;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: currentColor;
        }
        .section {
            margin-top: 18px;
            padding-top: 16px;
            border-top: 1px dashed #e5e7eb;
        }
        .section-title {
            font-size: 14px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 8px;
        }
        .field-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 10px 18px;
            font-size: 13px;
        }
        .field-label {
            font-size: 12px;
            color: #6b7280;
        }
        .field-value {
            font-weight: 600;
            color: #111827;
        }
        .code-box {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            background: #eff6ff;
            border-radius: 999px;
            border: 1px solid #bfdbfe;
            font-size: 12px;
            font-weight: 600;
            color: #1d4ed8;
            letter-spacing: 0.02em;
        }
        .alert-message {
            margin-top: 16px;
            padding: 10px 12px;
            border-radius: 8px;
            font-size: 12px;
            color: #4b5563;
            background: #f9fafb;
            border: 1px dashed #e5e7eb;
        }
        .pdf-wrapper {
            margin-top: 20px;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #e5e7eb;
            background: #f9fafb;
        }
        .pdf-wrapper iframe {
            width: 100%;
            height: 600px;
            border: none;
            background: #f3f4f6;
        }
        .error-text {
            margin-top: 8px;
            font-size: 14px;
        }
        .error-wrapper {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .error-icon {
            width: 40px;
            height: 40px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #fef2f2;
            color: #b91c1c;
            font-weight: 700;
            font-size: 20px;
        }
        .footer {
            margin-top: 18px;
            padding-top: 14px;
            border-top: 1px solid #f3f4f6;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            font-size: 11px;
            color: #9ca3af;
        }
        .footer span {
            white-space: nowrap;
        }
        .footer-domain {
            font-weight: 500;
            color: #6b7280;
        }
        @media (max-width: 640px) {
            .card {
                padding: 20px 16px 16px 16px;
            }
            .header {
                flex-direction: column;
                align-items: flex-start;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card <?= $cert ? 'card-valid' : 'card-invalid' ?>">
            <div class="header">
                <div class="title-block">
                    <div class="logo"><?= h($empresaNombre) ?></div>
                    <div class="subtitle">
                        Validación de Certificado <?= ($tipo === 'CPS' ? 'de Servicios' : 'de Trabajo') ?>
                        <?= $empresaRuc ? ' · RUC ' . h($empresaRuc) : '' ?>
                    </div>
                    <div class="pill">
                        Validación en línea · certificados.consultoriagrupojc.com
                    </div>
                </div>
                <?php if ($cert): ?>
                    <div class="status-badge status-ok">
                        <span class="status-dot"></span>
                        <span>CERTIFICADO VÁLIDO</span>
                    </div>
                <?php else: ?>
                    <div class="status-badge status-bad">
                        <span class="status-dot"></span>
                        <span>CERTIFICADO NO VÁLIDO</span>
                    </div>
                <?php endif; ?>
            </div>

            <?php if ($cert): ?>
                <div class="section">
                    <div class="section-title">Información del certificado</div>
                    <div class="field-grid">
                        <div>
                            <div class="field-label">Código de Validación</div>
                            <div class="field-value">
                                <span class="code-box"><?= h($cert['codigo']) ?></span>
                            </div>
                        </div>
                        <div>
                            <div class="field-label">Tipo de documento</div>
                            <div class="field-value">
                                <?= h($cert['tipo_documento'] === 'CPS' ? 'Constancia de Prestación de Servicios' : 'Certificado de Trabajo') ?>
                            </div>
                        </div>
                        <div>
                            <div class="field-label">Estado</div>
                            <div class="field-value">Activo</div>
                        </div>
                        <div>
                            <div class="field-label">Fecha de emisión</div>
                            <div class="field-value"><?= h($fechaEmision ?: '-') ?></div>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Datos del colaborador</div>
                    <div class="field-grid">
                        <div>
                            <div class="field-label">Nombres y Apellidos</div>
                            <div class="field-value">
                                <?= h(trim(($cert['nombres'] ?? '') . ' ' . ($cert['apellidos'] ?? ''))) ?>
                            </div>
                        </div>
                        <div>
                            <div class="field-label">Documento de Identidad</div>
                            <div class="field-value">DNI <?= h($cert['documento_numero'] ?? '') ?></div>
                        </div>
                        <div>
                            <div class="field-label">Cargo</div>
                            <div class="field-value"><?= h($cert['cargo'] ?? $cert['cargo_colab'] ?? '') ?></div>
                        </div>
                        <div>
                            <div class="field-label">Periodo Laboral</div>
                            <div class="field-value">
                                <?php if ($fi && $ff): ?>
                                    Desde <?= h($fi) ?> hasta <?= h($ff) ?>
                                <?php elseif ($fi && !$ff): ?>
                                    Desde <?= h($fi) ?> hasta la actualidad
                                <?php else: ?>
                                    -
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="alert-message">
                    Este resultado ha sido generado directamente desde la base de datos del sistema ERP de
                    <?= h($empresaNombre) ?>. Si los datos mostrados no coinciden con el documento físico, 
                    prevalecerá siempre la información que se muestra en esta página.
                </div>

                <?php if (!empty($cert['pdf_base64'])): ?>
                    <div class="section">
                        <div class="section-title">Vista del certificado</div>
                        <div class="pdf-wrapper">
                            <iframe src="data:application/pdf;base64,<?= h($cert['pdf_base64']) ?>"></iframe>
                        </div>
                    </div>
                <?php endif; ?>

            <?php else: ?>
                <div class="section">
                    <div class="error-wrapper">
                        <div class="error-icon">!</div>
                        <p class="error-text"><?= h($errorMessage) ?></p>
                    </div>
                    <div class="alert-message">
                        Verifique que el enlace de validación corresponda exactamente al QR impreso en el documento. 
                        Si el problema persiste, contacte con el área de Recursos Humanos de <?= h($empresaNombre) ?>.
                    </div>
                </div>
            <?php endif; ?>

            <div class="footer">
                <div>© <?= date('Y') ?> <?= h($empresaNombre) ?></div>
                <div class="footer-domain">certificados.consultoriagrupojc.com</div>
            </div>
        </div>
    </div>
</body>
</html>
