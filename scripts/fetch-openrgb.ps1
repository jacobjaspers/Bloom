# Downloads the official OpenRGB Windows build that Bloom uses for hardware it
# doesn't drive itself, into vendor\openrgb\ (ignored by git). Pinned to one release
# so every Bloom build talks to a known version.
#
# OpenRGB is free software by the OpenRGB project (https://openrgb.org), licensed
# GPL-2.0-or-later. Its license and source link are shipped in THIRD_PARTY_NOTICES.md.

$ErrorActionPreference = 'Stop'
$Version = '1.1'
$Url = 'https://codeberg.org/OpenRGB/OpenRGB/releases/download/release_1.1/OpenRGB_1.1_Windows_64_8e16de2.zip'
$Root = Split-Path $PSScriptRoot -Parent
$Dest = Join-Path $Root 'vendor\openrgb'
$Zip = Join-Path ([IO.Path]::GetTempPath()) "openrgb-$Version-$([guid]::NewGuid().ToString('N')).zip"
$Stage = Join-Path ([IO.Path]::GetTempPath()) "openrgb-$Version-$([guid]::NewGuid().ToString('N'))"

if (Test-Path (Join-Path $Dest 'OpenRGB.exe')) {
  Write-Host "OpenRGB is already in $Dest"
  exit 0
}

Write-Host "Downloading OpenRGB $Version ..."
Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing
$hash = (Get-FileHash $Zip -Algorithm SHA256).Hash
Write-Host "SHA-256: $hash"

Expand-Archive -Path $Zip -DestinationPath $Stage -Force
# The archive may wrap everything in one folder; find the one holding OpenRGB.exe.
$exe = Get-ChildItem -Path $Stage -Filter 'OpenRGB.exe' -Recurse | Select-Object -First 1
if (-not $exe) { throw 'OpenRGB.exe not found in the download' }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Path (Join-Path $exe.DirectoryName '*') -Destination $Dest -Recurse -Force
Set-Content -Path (Join-Path $Dest 'BLOOM_VERSION.txt') -Value "OpenRGB $Version`n$Url`nSHA-256 $hash"
# OpenRGB's license travels with its program (GPL-2.0 section 1).
Invoke-WebRequest -Uri 'https://codeberg.org/OpenRGB/OpenRGB/raw/tag/release_1.1/LICENSE' -OutFile (Join-Path $Dest 'LICENSE.txt') -UseBasicParsing
Write-Host "OpenRGB $Version installed to $Dest"
