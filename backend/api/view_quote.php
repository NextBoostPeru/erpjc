<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");
require_once __DIR__ . '/../config/db.php';

$id = $_GET['id'] ?? null;
$token = $_GET['token'] ?? null;

if (!$id || !$token) {
    http_response_code(400);
    die("Parámetros inválidos.");
}

// Secret Salt (debe coincidir con el usado en cotizaciones.php)
$salt = 'NextBoostPeru_Secure_2024';

if ($token !== md5($id . $salt)) {
    http_response_code(403);
    die("Acceso denegado. Enlace inválido.");
}

try {
    $stmt = $conn->prepare("SELECT archivo_adjunto, serie, correlativo FROM cotizaciones WHERE id = ?");
    $stmt->execute([$id]);
    $cot = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$cot || empty($cot['archivo_adjunto'])) {
        http_response_code(404);
        die("Documento no encontrado o no generado.");
    }

    $filePath = __DIR__ . '/../' . $cot['archivo_adjunto'];
    
    // Check alternative path (in case it was saved relative to api/ folder by mistake)
    if (!file_exists($filePath)) {
        $altPath = __DIR__ . '/uploads/cotizaciones/' . basename($cot['archivo_adjunto']);
        if (file_exists($altPath)) {
            $filePath = $altPath;
        }
    }

    if (!file_exists($filePath)) {
        http_response_code(404);
        // Add detailed error for debugging if needed (remove in prod if strict)
        // But for now, the user needs to know WHY
        die("Archivo físico no encontrado en el servidor. ID: $id. Path buscado: " . basename($filePath));
    }

    // Servir el archivo
    $filename = "Cotizacion_" . $cot['serie'] . "-" . str_pad($cot['correlativo'], 6, '0', STR_PAD_LEFT) . ".pdf";
    
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($filePath));
    header('Cache-Control: private, max-age=0, must-revalidate');
    header('Pragma: public');

    readfile($filePath);

} catch (Exception $e) {
    http_response_code(500);
    die("Error interno.");
}
?>