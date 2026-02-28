<?php
// backend/api/public_files.php
// Script to serve public files (like logos) with CORS headers

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");
header("Access-Control-Allow-Headers: Content-Type");

if (isset($_GET['path'])) {
    $path = $_GET['path'];
    
    // Security check: Prevent directory traversal and ensure it's in uploads
    // Normalize path separators
    $path = str_replace('\\', '/', $path);
    
    // Basic validation: must start with uploads/ and contain no ".."
    if (strpos($path, 'uploads/') === 0 && strpos($path, '..') === false) {
        
        $fullPath = __DIR__ . '/' . $path;
        
        if (file_exists($fullPath)) {
            // Determine content type
            $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
            $contentType = 'application/octet-stream';
            
            switch ($ext) {
                case 'jpg':
                case 'jpeg':
                    $contentType = 'image/jpeg';
                    break;
                case 'png':
                    $contentType = 'image/png';
                    break;
                case 'gif':
                    $contentType = 'image/gif';
                    break;
                case 'pdf':
                    $contentType = 'application/pdf';
                    break;
            }
            
            header("Content-Type: " . $contentType);
            header("Content-Length: " . filesize($fullPath));
            
            readfile($fullPath);
            exit;
        } else {
            http_response_code(404);
            echo "File not found.";
        }
    } else {
        http_response_code(403);
        echo "Access denied.";
    }
} else {
    http_response_code(400);
    echo "No path specified.";
}
?>
