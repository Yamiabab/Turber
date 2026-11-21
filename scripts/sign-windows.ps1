param(
    [Parameter(Mandatory = $true)]
    [string]$File
)

# Invoked by Tauri bundler via bundle.windows.signCommand, with %1 = path to sign.
# If certificate env vars are absent, skip quietly so local / secret-less CI builds stay green.
$ErrorActionPreference = 'Stop'

$b64 = $env:WINDOWS_CERTIFICATE_PFX_BASE64
$pwd = $env:WINDOWS_CERTIFICATE_PASSWORD

if ([string]::IsNullOrWhiteSpace($b64) -or [string]::IsNullOrWhiteSpace($pwd)) {
    Write-Host '[sign] certificate env not set, skipping code signing'
    exit 0
}

if (-not (Test-Path $File)) {
    Write-Host "[sign] target not found: $File"
    exit 1
}

$work = $env:RUNNER_TEMP
if ([string]::IsNullOrWhiteSpace($work)) { $work = $env:TEMP }
$pfx = Join-Path $work 'turber-codesign.pfx'

if (-not (Test-Path $pfx)) {
    [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($b64))
    $sec = ConvertTo-SecureString -String $pwd -AsPlainText -Force
    Import-PfxCertificate -FilePath $pfx -CertStoreLocation 'Cert:\CurrentUser\My' -Password $sec | Out-Null
    Write-Host '[sign] certificate imported'
}

$signtool = (Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1).FullName

if (-not $signtool) {
    Write-Host '[sign] signtool.exe not found'
    exit 1
}

Write-Host "[sign] signing $File"
& $signtool sign /f $pfx /p $pwd /fd sha256 /td sha256 /tr http://timestamp.digicert.com "$File"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[sign] signing failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

$v = Get-AuthenticodeSignature -FilePath $File
Write-Host "[sign] done, signer: $($v.SignerCertificate.Subject)"
exit 0
