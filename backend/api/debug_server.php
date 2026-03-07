<?php
// Habilitar visualización de errores para depuración
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header("Content-Type: text/plain");

echo "=== INICIO DE DIAGNÓSTICO ===\n";
echo "PHP Version: " . phpversion() . "\n";
echo "Server Software: " . $_SERVER['SERVER_SOFTWARE'] . "\n";
echo "Current Directory: " . __DIR__ . "\n\n";

// 1. Verificar estructura de directorios crítica
echo "=== VERIFICACIÓN DE ARCHIVOS ===\n";
$files_to_check = [
    '../config/db.php',
    '../config/jwt.php',
    '../config/security.php',
    '../api/helpers/jwt/src/JWT.php',
    '../api/helpers/jwt/src/Key.php',
    '../api/helpers/jwt/src/SignatureInvalidException.php',
    '../api/helpers/jwt/src/BeforeValidException.php',
    '../api/helpers/jwt/src/ExpiredException.php'
];

foreach ($files_to_check as $file) {
    $path = __DIR__ . '/' . $file;
    $exists = file_exists($path);
    echo "Archivo: $file -> " . ($exists ? "OK" : "FALTA") . "\n";
    if (!$exists) {
        echo "   Ruta absoluta buscada: " . realpath(__DIR__) . DIRECTORY_SEPARATOR . $file . "\n";
    }
}

echo "\n=== PRUEBA DE INCLUSIÓN ===\n";

// 2. Probar DB
echo "Intentando incluir db.php... ";
try {
    if (file_exists(__DIR__ . '/../config/db.php')) {
        require_once __DIR__ . '/../config/db.php';
        echo "OK (Conexión establecida o archivo cargado)\n";
        if (isset($conn)) {
            echo "   Objeto \$conn existe.\n";
        } else {
            echo "   Objeto \$conn NO existe.\n";
        }
    } else {
        echo "SALTADO (No existe)\n";
    }
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}

// 3. Probar JWT
echo "Intentando incluir jwt.php... ";
try {
    if (file_exists(__DIR__ . '/../config/jwt.php')) {
        require_once __DIR__ . '/../config/jwt.php';
        echo "OK\n";
        
        if (class_exists('Firebase\JWT\JWT')) {
            echo "   Clase Firebase\JWT\JWT cargada correctamente.\n";
        } else {
            echo "   ERROR: Clase Firebase\JWT\JWT NO encontrada.\n";
        }
    } else {
        echo "SALTADO (No existe)\n";
    }
} catch (Throwable $e) {
    echo "ERROR FATAL al cargar JWT: " . $e->getMessage() . "\n";
    echo "Trace:\n" . $e->getTraceAsString() . "\n";
}

echo "\n=== PRUEBA DE LIBRERÍAS EXTERNAS ===\n";

// 4. Probar PHPMailer
echo "Intentando cargar PHPMailer... ";
try {
    if (class_exists('PHPMailer\PHPMailer\PHPMailer')) {
        echo "OK (Cargado vía Autoload)\n";
    } elseif (file_exists(__DIR__ . '/../vendor/phpmailer/phpmailer/src/PHPMailer.php')) {
        require_once __DIR__ . '/../vendor/phpmailer/phpmailer/src/Exception.php';
        require_once __DIR__ . '/../vendor/phpmailer/phpmailer/src/PHPMailer.php';
        require_once __DIR__ . '/../vendor/phpmailer/phpmailer/src/SMTP.php';
        if (class_exists('PHPMailer\PHPMailer\PHPMailer')) {
            echo "OK (Cargado Manualmente)\n";
        } else {
             echo "ERROR: Archivos existen pero clase no encontrada.\n";
        }
    } else {
        echo "FALTA (No encontrado en vendor/phpmailer)\n";
    }
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}

// 5. Probar Dompdf
echo "Intentando cargar Dompdf... ";
try {
    if (class_exists('Dompdf\Dompdf')) {
        echo "OK (Cargado vía Autoload)\n";
    } elseif (file_exists(__DIR__ . '/../vendor/dompdf/dompdf/src/Dompdf.php')) {
         // Dompdf es complejo de cargar manualmente sin autoloader, pero verificamos existencia
         echo "PARCIAL (Archivos existen, pero Autoloader falló)\n";
    } else {
        echo "FALTA (No encontrado en vendor/dompdf)\n";
    }
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}

echo "\n=== FIN DEL DIAGNÓSTICO ===\n";
?>
