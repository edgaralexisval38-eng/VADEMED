@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================
echo    Publicando cambios de VadeMed...
echo ============================================
echo.
echo [1/3] Subiendo el numero de version...
node -e "const fs=require('fs');let s=fs.readFileSync('sw.js','utf8');s=s.replace(/vademed-v(\d+)/,(m,n)=>'vademed-v'+(+n+1));fs.writeFileSync('sw.js',s);console.log('     Nueva version:',(s.match(/vademed-v\d+/)||[''])[0]);"
echo.
echo [2/3] Guardando cambios...
git add -A
git commit -m "Actualizacion de temas"
echo.
echo [3/3] Publicando en GitHub / Netlify...
git push origin main
echo.
echo ============================================
echo    LISTO! Espera aprox. 1 minuto y luego
echo    cierra y abre la app (con internet).
echo    Tu sitio: https://vademedmx.netlify.app
echo ============================================
echo.
pause
