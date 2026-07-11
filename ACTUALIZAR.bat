@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo    Actualizando VadeMed en GitHub...
echo ============================================
echo.
git add -A
git commit -m "Actualizacion %date% %time%"
git push
echo.
echo ============================================
echo    Si arriba dice  "main -^> main"  =  LISTO
echo    Tu sitio se actualiza en 1-2 minutos:
echo    https://edgaralexisval38-eng.github.io/VADEMED/
echo ============================================
echo.
pause
