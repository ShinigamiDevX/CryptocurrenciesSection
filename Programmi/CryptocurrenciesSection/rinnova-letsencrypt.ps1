# Rinnova il certificato Let's Encrypt di cryptosection.chainholder.dev
# Esegui ogni 60 giorni (il cert dura 90). Token dal .env, non in chiaro qui.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$envFile = Join-Path $root '.env'
$certs = 'C:\Users\Admin\Desktop\Portale\certs'
$legoDir = Join-Path $certs 'lego'

$token = $null; $team = $null
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^VERCEL_TOKEN=(.+)$') { $token = $Matches[1].Trim().Trim('"').Trim("'") }
  if ($_ -match '^VERCEL_TEAM_ID=(.+)$') { $team = $Matches[1].Trim().Trim('"').Trim("'") }
}
if (-not $token) { throw "VERCEL_TOKEN mancante in $envFile" }

$helpers = 'C:\Users\Admin\Desktop\Portale\.docker-helpers'
if (Test-Path $helpers) { $env:PATH = "$helpers;" + $env:PATH }

$env:VERCEL_API_TOKEN = $token
if ($team) { $env:VERCEL_TEAM_ID = $team }

docker run --rm `
  -e VERCEL_API_TOKEN `
  -e VERCEL_TEAM_ID `
  -v "${legoDir}:/.lego" `
  goacme/lego:latest `
  run `
  --path /.lego `
  --email loginchainholder@proton.me `
  --dns vercel `
  --dns.timeout 30 `
  --dns.propagation.wait 90s `
  -d cryptosection.chainholder.dev `
  --accept-tos

Copy-Item -Force (Join-Path $legoDir 'certificates\cryptosection.chainholder.dev.crt') (Join-Path $certs 'cert.pem')
Copy-Item -Force (Join-Path $legoDir 'certificates\cryptosection.chainholder.dev.key') (Join-Path $certs 'key.pem')
docker exec cryptovault-web nginx -s reload
Write-Output "Certificato rinnovato e nginx ricaricato."
