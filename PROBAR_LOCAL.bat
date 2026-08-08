@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================
echo    VadeMed - MODO LOCAL (prueba en tu compu)
echo ============================================
echo.
echo  Abriendo la app en tu navegador...
echo  (NO se sube nada a internet)
echo.
echo  Para CERRAR: cierra esta ventana negra.
echo ============================================
echo.
start "" http://127.0.0.1:8150/index.html
python -m http.server 8150 --bind 127.0.0.1
