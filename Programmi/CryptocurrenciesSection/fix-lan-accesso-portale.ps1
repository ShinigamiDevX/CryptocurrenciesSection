# Esegui come Amministratore (tasto destro → Esegui con PowerShell / Terminale admin)
# Ripristina accesso LAN al portale CryptocurrenciesSection (porte 80/443).

$ErrorActionPreference = 'Stop'

Write-Host "== Profilo rete Ethernet ==" -ForegroundColor Cyan
try {
    Set-NetConnectionProfile -InterfaceAlias 'Ethernet' -NetworkCategory Private
    Write-Host "OK: Ethernet impostata su Private"
} catch {
    Write-Host "AVVISO: impossibile cambiare profilo (GPO/permessi): $($_.Exception.Message)" -ForegroundColor Yellow
    Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory -AutoSize
}

Write-Host "`n== Regole firewall 80/443 ==" -ForegroundColor Cyan
foreach ($rule in @(
    @{ Name = 'CryptocurrenciesSection HTTP 80'; Port = 80 },
    @{ Name = 'CryptocurrenciesSection HTTPS 443'; Port = 443 }
)) {
    netsh advfirewall firewall delete rule name="$($rule.Name)" | Out-Null
    netsh advfirewall firewall add rule name="$($rule.Name)" dir=in action=allow protocol=TCP localport=$($rule.Port) profile=any enable=yes | Out-Null
    Write-Host "OK: $($rule.Name)"
}

Write-Host "`n== Verifica locale ==" -ForegroundColor Cyan
curl.exe -sk -o NUL -w "https://192.168.4.80/portal -> %{http_code}`n" --connect-timeout 5 "https://192.168.4.80/portal"
curl.exe -sk -o NUL -w "https://cryptosection.chainholder.dev/portal -> %{http_code}`n" --connect-timeout 5 "https://cryptosection.chainholder.dev/portal"

Write-Host "`nDalle altre macchine apri: https://cryptosection.chainholder.dev" -ForegroundColor Green
Write-Host "Se ancora fallisce: riavvia Docker Desktop, poi riprova." -ForegroundColor Green
