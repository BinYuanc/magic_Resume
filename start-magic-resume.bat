@echo off
setlocal
title Magic Resume - Dev Server

rem ============================================================
rem  Magic Resume one-click startup (portable: works from any folder,
rem  including a ZIP downloaded from GitHub)
rem
rem  Flow : pick package manager -> install deps when needed
rem         -> start dev server in THIS window
rem         -> auto-minimize when the site is ready -> open browser
rem  Stop : close the (minimized) window, or run stop-magic-resume.bat
rem ============================================================

rem -- Always work in the folder that contains this script --
cd /d "%~dp0"
if errorlevel 1 (
    echo [ERROR] Cannot enter the project folder.
    pause
    exit /b 1
)

rem -- Node.js is required --
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Install Node.js 20.19+ first:
    echo         https://nodejs.org/
    pause
    exit /b 1
)

rem -- Pick a package manager: pnpm preferred, npm as fallback --
set PM=
where pnpm >nul 2>&1 && set PM=pnpm
if not defined PM where npm >nul 2>&1 && set PM=npm
if not defined PM (
    echo [ERROR] Neither pnpm nor npm was found. Reinstall Node.js 20.19+ and retry.
    pause
    exit /b 1
)
echo [Info] Package manager: %PM%

rem -- Decide whether dependencies must be (re)installed --
rem    1) the package links are broken  -> vite is missing
rem    2) pnpm-lock.yaml differs from the copy pnpm left in node_modules
rem       (this is what catches "repo was updated, deps are stale")
set NEED_INSTALL=0
if not exist "node_modules\vite" set NEED_INSTALL=1
if not exist "node_modules\.pnpm\lock.yaml" set NEED_INSTALL=1
if "%NEED_INSTALL%"=="0" (
    fc /b "pnpm-lock.yaml" "node_modules\.pnpm\lock.yaml" >nul 2>&1
    if errorlevel 1 set NEED_INSTALL=1
)

if "%NEED_INSTALL%"=="1" (
    echo [Setup] Installing dependencies, this may take a few minutes ...
    if "%PM%"=="pnpm" (call pnpm install) else (call npm install)
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed. Check the network, then retry.
        pause
        exit /b 1
    )
)

rem -- Warn if port 3000 is already taken (an old instance may still run) --
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [WARN] Port 3000 is already in use - maybe an old instance is running.
    echo [WARN] Close the other window first, otherwise vite will pick port 3001.
    timeout /t 4 >nul
)

echo.
echo [Start] Launching Magic Resume dev server ...
echo [Start] This window will minimize by itself once the site is ready.
echo.

rem -- Background watcher: waits for the port, then minimizes this window
rem    and opens http://localhost:3000
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-and-minimize.ps1" -Port 3000

rem -- Dev server runs in THIS console, so closing the window stops it --
if "%PM%"=="pnpm" (call pnpm dev) else (call npm run dev)

echo.
echo [Exit] Dev server stopped.
pause
