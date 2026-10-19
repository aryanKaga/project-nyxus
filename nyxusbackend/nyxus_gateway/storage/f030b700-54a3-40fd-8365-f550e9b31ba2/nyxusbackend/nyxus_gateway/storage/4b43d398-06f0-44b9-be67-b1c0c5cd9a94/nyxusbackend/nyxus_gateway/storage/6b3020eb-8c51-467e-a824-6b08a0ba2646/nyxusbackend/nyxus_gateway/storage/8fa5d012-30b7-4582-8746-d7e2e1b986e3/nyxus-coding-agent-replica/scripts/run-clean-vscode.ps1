param(
    [Parameter(Mandatory = $true)]
    [string]$ExtensionPath,

    [Parameter(Mandatory = $true)]
    [string]$WorkspacePath
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path -LiteralPath $ExtensionPath -PathType Container)) {
    throw "Nyxus extension folder does not exist: $ExtensionPath"
}

if (!(Test-Path -LiteralPath $WorkspacePath -PathType Container)) {
    throw "Workspace folder does not exist: $WorkspacePath"
}

$codeCommand = Get-Command code -ErrorAction Stop
$codeExe = Join-Path (Split-Path (Split-Path $codeCommand.Source -Parent) -Parent) 'Code.exe'
if (!(Test-Path -LiteralPath $codeExe -PathType Leaf)) {
    throw "VS Code executable was not found at: $codeExe"
}

$profilePath = Join-Path $env:TEMP ('nyxus-debug-' + [guid]::NewGuid())
$extensionsPath = Join-Path $profilePath 'extensions'
New-Item -ItemType Directory -Force -Path $profilePath, $extensionsPath | Out-Null

$arguments = '--new-window --user-data-dir="{0}" --extensions-dir="{1}" --extensionDevelopmentPath="{2}" --disable-extensions --disable-gpu "{3}"' -f `
    $profilePath, $extensionsPath, $ExtensionPath, $WorkspacePath

$process = Start-Process -FilePath $codeExe -ArgumentList $arguments -PassThru
Write-Output "Started clean VS Code window (PID $($process.Id))."
Write-Output "Nyxus extension: $ExtensionPath"
Write-Output "Workspace: $WorkspacePath"
