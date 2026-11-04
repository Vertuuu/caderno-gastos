@echo off
cd /d "%~dp0"
title Caderno de Gastos
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo O Node.js nao foi encontrado neste computador.
  echo Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)
node server.js
pause
