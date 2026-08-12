@echo off
chcp 65001 >nul
title Subir VadeMed a GitHub
cd /d "%~dp0"
echo.
echo ============================================
echo    Subiendo VadeMed a GitHub...
echo ============================================
echo.

REM Por si quedaron cambios sin guardar, se agregan y se hace un commit rapido.
git add -A
git diff --cached --quiet
if errorlevel 1 (
  echo Guardando cambios pendientes...
  git commit -m "Actualizacion de VadeMed" >nul 2>&1
)

echo Enviando a GitHub ^(rama main^)...
echo.
git push origin main

if errorlevel 1 (
  echo.
  echo ============================================
  echo    NO SE PUDO SUBIR
  echo ============================================
  echo.
  echo Casi siempre es la red. Prueba:
  echo   1^) Apagar el VPN si tienes uno.
  echo   2^) Revisar que el antivirus/firewall no bloquee git.
  echo   3^) Conectarte a otra red ^(datos del celular^) y volver a intentar.
  echo.
  echo Cuando la red funcione, vuelve a dar doble clic a este archivo.
) else (
  echo.
  echo ============================================
  echo    LISTO. Cambios subidos a GitHub.
  echo ============================================
  echo.
  echo Tu link ^(cuando actives GitHub Pages^):
  echo   https://edgaralexisval38-eng.github.io/VADEMED/
)

echo.
pause
