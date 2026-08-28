# Ferma solo i 4 progetti Compose Vysion. Non tocca Terra ne i container cryptovault-*.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
docker compose --project-name vysion-webapp -f vysion_ransomware_webapp/docker/docker-compose.webapp.yml stop
docker compose --project-name vysion-api -f vysion_ransomware_api/docker/docker-compose.api.yml stop
docker compose --project-name vysion-ransomware -f vysion_ransomware_monitor/docker/docker-compose.monitor.yml stop
docker compose --project-name vysion-databases -f vysion_ransomware_monitor/docker/docker-compose.databases.yml stop
Write-Output 'Vysion fermato. Container portale e Terra non toccati.'
