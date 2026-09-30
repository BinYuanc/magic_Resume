@echo off
title Stop Magic Resume
rem Kill the node/vite process listening on port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo Stopping PID %%a ...
    taskkill /PID %%a /F >nul 2>&1
)
echo Magic Resume stopped.
timeout /t 2 >nul
