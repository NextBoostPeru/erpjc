@echo off
echo ========================================================
echo CONECTANDO CON GITHUB Y SUBIENDO CAMBIOS
echo ========================================================

echo 1. Inicializando repositorio (si no existe)...
git init

echo 2. Agregando todos los archivos...
git add .

echo 3. Guardando cambios (commit)...
git commit -m "Actualizacion completa con dependencias arregladas"

echo 4. Configurando rama principal...
git branch -M main

echo 5. Configurando repositorio remoto...
git remote remove origin 2>nul
git remote add origin https://github.com/NextBoostPeru/erpjc.git

echo 6. Subiendo a GitHub...
git push -u origin main

echo.
echo ========================================================
echo PROCESO FINALIZADO
echo ========================================================
pause
