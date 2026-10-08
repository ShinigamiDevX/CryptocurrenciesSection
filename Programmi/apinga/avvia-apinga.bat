@echo off
REM Avvia Apinga in ascolto su 0.0.0.0:5001 (raggiungibile da http://192.168.4.80:5001)
cd /d "%~dp0"
taskkill /IM apinga-server_windows.exe /F >nul 2>&1
timeout /t 1 /nobreak >nul
start "Apinga" /MIN "%~dp0apinga-server_windows.exe"
echo Apinga avviato. Apri: http://192.168.4.80:5001
