# Avvio isolato di Vysion. Non ferma, non elimina e non fa prune di container/immagini/volumi esistenti.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$env:PATH = 'C:\Users\Admin\Desktop\Portale\.docker-helpers;' + $env:PATH

function Invoke-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) {
        throw "Comando docker fallito ($LASTEXITCODE): docker $($args -join ' ')"
    }
}

$KeepNames = @(
    'terra',
    'cryptovault-web',
    'cryptovault-cryptoscanner',
    'cryptovault-auth',
    'cryptovault-analisi',
    'cryptovault-cluster'
)

function Get-KeepStatus {
    docker ps -a --format '{{.Names}}' | Where-Object { $KeepNames -contains $_ }
}

$before = @(Get-KeepStatus)
if ($before.Count -lt $KeepNames.Count) {
    Write-Warning "Alcuni container da preservare non risultano presenti: $($KeepNames -join ', ')"
}

function Assert-KeepAlive {
    $now = @(Get-KeepStatus)
    foreach ($name in $KeepNames) {
        if ($before -contains $name -and $now -notcontains $name) {
            throw "ABORT: il container $name non c'e' piu'. Nessun prune e' stato eseguito da questo script."
        }
    }
}

$net = @(docker network ls --format '{{.Name}}')
if ($net -notcontains 'ransomware_network') {
    Invoke-Docker network create ransomware_network | Out-Null
    Write-Output 'Rete ransomware_network creata.'
} else {
    Write-Output 'Rete ransomware_network gia esistente.'
}

$airflowDirs = @(
    'vysion_ransomware_monitor\docker\config\airflow\dags',
    'vysion_ransomware_monitor\docker\config\airflow\logs',
    'vysion_ransomware_monitor\docker\config\airflow\plugins'
)
foreach ($d in $airflowDirs) {
    $p = Join-Path $Root $d
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

Write-Output 'Build immagini Vysion (prefisso vysion-). Nessun prune.'
Invoke-Docker build -t vysion-tor -f vysion_ransomware_monitor/docker/Dockerfile.tor vysion_ransomware_monitor
Assert-KeepAlive
Invoke-Docker build -t vysion-airflow -f vysion_ransomware_monitor/docker/Dockerfile.airflow vysion_ransomware_monitor
Assert-KeepAlive
Invoke-Docker build -t vysion-api -f vysion_ransomware_api/docker/Dockerfile.api vysion_ransomware_api
Assert-KeepAlive
Invoke-Docker compose --project-name vysion-webapp -f vysion_ransomware_webapp/docker/docker-compose.webapp.yml --env-file vysion_ransomware_webapp/docker/.env build
Assert-KeepAlive

Write-Output 'Avvio stack Vysion (solo compose di questo progetto).'
Invoke-Docker compose --project-name vysion-databases -f vysion_ransomware_monitor/docker/docker-compose.databases.yml --env-file vysion_ransomware_monitor/docker/.env up -d
Assert-KeepAlive
Invoke-Docker compose --project-name vysion-ransomware -f vysion_ransomware_monitor/docker/docker-compose.monitor.yml --env-file vysion_ransomware_monitor/docker/.env up -d
Assert-KeepAlive
Invoke-Docker compose --project-name vysion-api -f vysion_ransomware_api/docker/docker-compose.api.yml --env-file vysion_ransomware_api/docker/.env up -d
Assert-KeepAlive
Invoke-Docker compose --project-name vysion-webapp -f vysion_ransomware_webapp/docker/docker-compose.webapp.yml --env-file vysion_ransomware_webapp/docker/.env up -d
Assert-KeepAlive

Write-Output 'Attesa Elasticsearch/Kibana e import template (via rete Vysion, non tocca altri container).'
$doc = Join-Path $Root 'vysion_ransomware_monitor\doc'
$imp = Join-Path $Root 'vysion_ransomware_monitor\scripts\import-elastic-safe.sh'
Invoke-Docker run --rm --network ransomware_network -v "${doc}:/doc:ro" -v "${imp}:/import.sh:ro" alpine:3.19 sh /import.sh
Assert-KeepAlive

Write-Output ''
Write-Output 'Vysion avviato. Dashboard: http://192.168.4.80:3002'
Write-Output 'Login vendor: eactda@byronlabs.io / Admin!1234%'
Write-Output 'Container esistenti lasciati intatti:'
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
