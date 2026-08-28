<#
.SYNOPSIS
    Script per connettersi in modo sicuro al PC remoto e avviare Crypto Monitor.

.DESCRIPTION
    Questo script stabilisce un tunnel SSH sicuro e avvia l'applicazione sul PC remoto.
    L'applicazione sarà accessibile localmente su http://localhost:5870.

.PARAMETER RemoteUser
    Il nome utente sul PC remoto.
.PARAMETER RemoteHost
    L'indirizzo IP o Hostname del PC remoto.
.PARAMETER RemotePath
    Il percorso assoluto della cartella 'crypto-monitor' sul PC remoto.

.EXAMPLE
    .\connect-remote.ps1 -RemoteUser "mario" -RemoteHost "192.168.1.50" -RemotePath "/home/mario/crypto-monitor"
#>

param(
    [Parameter(Mandatory = $true, HelpMessage = "Inserisci il nome utente del PC remoto")]
    [string]$RemoteUser,

    [Parameter(Mandatory = $true, HelpMessage = "Inserisci l'IP del PC remoto")]
    [string]$RemoteHost,

    [Parameter(Mandatory = $true, HelpMessage = "Inserisci il percorso della cartella crypto-monitor sul PC remoto (es. /home/user/crypto-monitor)")]
    [string]$RemotePath
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Crypto Monitor - Connessione Remota" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] Connessione a $RemoteUser@$RemoteHost..."
Write-Host "[SECURE] Creazione tunnel sicuro (Local:5870 -> Remote:5870)"

# Controllo se ssh è disponibile
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Error "Comando 'ssh' non trovato. Assicurati di aver installato un client SSH (es. OpenSSH client su Windows)."
    exit 1
}

# Costruzione del comando SSH
# -L 5870:127.0.0.1:5870 : Tunneling della porta
# -t : Pseudo-terminal per output interattivo
# Comando remoto: entra nella directory e lancia lo script bash
$RemoteCommand = "cd `"$RemotePath`" && bash ./scripts/start-server.sh"

Write-Host "[INFO] Esecuzione comando remoto..." -ForegroundColor Gray
Write-Host "Una volta avviato, apri il browser su: http://localhost:5870" -ForegroundColor Green
Write-Host "Mantieni questa finestra aperta per mantenere la connessione." -ForegroundColor Yellow
Write-Host ""

# Esecuzione
ssh -L 5870:127.0.0.1:5870 -t "$RemoteUser@$RemoteHost" $RemoteCommand
