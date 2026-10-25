# Builds dist/fresh-recs-firefox.xpi and dist/fresh-recs-chrome.zip from this folder.
# Usage: pwsh ./build.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null

$shared = 'content.js', 'content.css', 'popup.html', 'popup.js', 'privacy.html'

function New-Package($out, $entries) {
  if (Test-Path $out) { Remove-Item $out }
  $zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
  try {
    foreach ($name in $entries.Keys) {
      # Entry names use forward slashes; both stores reject backslashes.
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, (Join-Path $root $entries[$name]), $name)
    }
  } finally { $zip.Dispose() }
  Write-Host "Built $out"
}

$firefox = [ordered]@{ 'manifest.json' = 'manifest.json'; 'icon.svg' = 'icon.svg' }
$chrome = [ordered]@{ 'manifest.json' = 'manifest.chrome.json' }
foreach ($f in $shared) { $firefox[$f] = $f; $chrome[$f] = $f }
foreach ($n in 16, 32, 48, 128) { $chrome["icons/icon$n.png"] = "icons/icon$n.png" }

New-Package (Join-Path $dist 'fresh-recs-firefox.xpi') $firefox
New-Package (Join-Path $dist 'fresh-recs-chrome.zip') $chrome
