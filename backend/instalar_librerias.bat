@echo off
echo Limpiando instalacion anterior...
if exist composer.lock del composer.lock
if exist vendor rmdir /s /q vendor

echo Descargando Composer...
"C:\xampp\php\php.exe" -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
"C:\xampp\php\php.exe" composer-setup.php
"C:\xampp\php\php.exe" -r "unlink('composer-setup.php');"

echo Instalando dependencias (esto puede tardar unos minutos)...
"C:\xampp\php\php.exe" composer.phar install --ignore-platform-reqs --no-scripts

echo.
echo ========================================================
echo INSTALACION COMPLETADA
echo ========================================================
echo Ahora comprueba que existan las carpetas:
echo - backend/vendor/dompdf/dompdf
echo - backend/vendor/phpmailer/phpmailer
echo.
echo Si todo esta bien, sube la carpeta 'vendor' completa al servidor.
echo.
pause
