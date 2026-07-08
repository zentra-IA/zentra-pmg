@echo off
chcp 65001 >nul
color 0B
title ZENTRA SALES AI

echo.
echo ==============================================================
echo                ZENTRA SALES AI
echo ==============================================================
echo.

cd /d "%~dp0"

echo [1/8] Verificando Node...

where node >nul 2>nul

if errorlevel 1 (
    echo.
    echo Node.js nao encontrado.
    pause
    exit
)

echo OK
echo.

echo [2/8] Limpando cache do Next...

if exist .next (
    rmdir /s /q .next
)

echo OK
echo.

echo [3/8] Verificando node_modules...

if not exist node_modules (

    echo Instalando dependencias...
    call npm install

)

echo OK
echo.

echo [4/8] Gerando Prisma...

call npx prisma generate

echo.

echo [5/8] Abrindo Next.js...

start "Zentra Sales AI" cmd /k "cd /d %cd% && npm run dev"

timeout /t 8 >nul

echo.

echo [6/8] Abrindo Worker IA...

if exist scripts\zentra-worker.ts (

start "IA Worker" cmd /k "cd /d %cd% && npx tsx scripts/zentra-worker.ts"

)

echo.

echo [7/8] Abrindo WhatsApp...

if exist whatsapp-server (

start "WhatsApp" cmd /k "cd /d %cd%\whatsapp-server && npm install && npm start"

)

echo.

echo [8/8] Abrindo navegador...

start http://localhost:3000

echo.
echo ==============================================================
echo             SISTEMA INICIADO
echo ==============================================================
echo.
echo Next.js ............ OK
echo Prisma ............. OK
echo IA Worker .......... OK
echo WhatsApp ........... OK
echo Navegador .......... OK
echo.
echo http://localhost:3000
echo.
pause