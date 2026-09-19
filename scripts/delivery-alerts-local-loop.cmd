@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0\.."

for /f "tokens=1,* delims==" %%A in ('findstr /b /i "CRON_SECRET=" .env') do (
  set "CRON_SECRET=%%B"
)

if not defined CRON_SECRET (
  echo.
  echo ERRO: CRON_SECRET nao encontrado no arquivo .env
  echo Adicione uma linha como:
  echo CRON_SECRET=zentra-local-entregas-2026
  echo.
  pause
  exit /b 1
)

echo ==========================================
echo ZENTRA - ALERTAS DE ENTREGA LOCAL
echo Chamando o processador a cada 3 minutos.
echo Ctrl+C para parar.
echo ==========================================
echo.

:loop
echo [%date% %time%] Processando...
curl -s -H "Authorization: Bearer !CRON_SECRET!" http://localhost:3001/api/cron/delivery-alerts
echo.
echo Proxima verificacao em 180 segundos...
timeout /t 180 /nobreak >nul
goto loop
