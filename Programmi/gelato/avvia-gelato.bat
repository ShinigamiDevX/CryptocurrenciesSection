@echo off
REM Avvia GELATO (proxy :5005 -> backend :5006), raggiungibile da http://192.168.4.80:5005
cd /d "%~dp0"
taskkill /IM gelato2.1_win.exe /F >nul 2>&1
for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH') do (
  wmic process where "ProcessId=%%~P" get CommandLine 2>nul | findstr /I "gelato\\start.js gelato/start.js" >nul && taskkill /PID %%~P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul
start "GELATO" /MIN "C:\Program Files\nodejs\node.exe" "%~dp0start.js"
echo GELATO avviato. Apri: http://192.168.4.80:5005
