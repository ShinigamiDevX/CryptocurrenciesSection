# Irrigidisce i permessi NTFS su auth/data (solo SYSTEM, Administrators, utente corrente).
# Esegui: powershell -ExecutionPolicy Bypass -File deploy\harden-auth-data.ps1
$ErrorActionPreference = 'Stop'
$data = (Resolve-Path (Join-Path $PSScriptRoot '..\auth\data')).Path
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "Hardening: $data"
Write-Host "Utente:    $user"

icacls $data /inheritance:r | Out-Null
icacls $data /remove:g "Users" "Authenticated Users" "Everyone" "Interactive" 2>$null | Out-Null
icacls $data /grant:r "NT AUTHORITY\SYSTEM:(OI)(CI)F" | Out-Null
icacls $data /grant:r "BUILTIN\Administrators:(OI)(CI)F" | Out-Null
icacls $data /grant:r "${user}:(OI)(CI)M" | Out-Null

Get-ChildItem -LiteralPath $data -Force | ForEach-Object {
    icacls $_.FullName /inheritance:r | Out-Null
    icacls $_.FullName /grant:r "NT AUTHORITY\SYSTEM:F" | Out-Null
    icacls $_.FullName /grant:r "BUILTIN\Administrators:F" | Out-Null
    icacls $_.FullName /grant:r "${user}:M" | Out-Null
}

Write-Host "ACL aggiornate:"
icacls $data
