$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$out = Join-Path $root "updates-dist"
if (-not (Test-Path (Join-Path $out "update.json"))) {
    throw "Falta updates-dist. Ejecuta npm run dist primero."
}
Write-Host "Publicando en Cloudflare Pages (pablo-asa)..."
$env:CI = "true"
npx --yes wrangler@4 pages project create pablo-asa --production-branch main
if ($LASTEXITCODE -ne 0) {
    Write-Host "El proyecto Pages ya existia o no se pudo crear; se intenta publicar igual."
}
npx --yes wrangler@4 pages deploy $out --project-name pablo-asa --branch main --commit-dirty=true
if ($LASTEXITCODE -ne 0) {
    throw "wrangler pages deploy fallo"
}
Write-Host "Publicado: https://pablo-asa.pages.dev/update.json"
