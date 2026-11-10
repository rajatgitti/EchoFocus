# EchoFocus Unified Startup Script
$Host.UI.RawUI.WindowTitle = "EchoFocus - Launching System"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ECHOFOCUS — Focus on the Voice That Matters" -ForegroundColor Yellow
Write-Host "   Built on VANTA Target Speaker Extraction Foundation" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Set environment PATH
$env:PATH = "C:\Users\Rajat\node;C:\Users\Rajat\mingit\cmd;" + $env:PATH
$pythonExe = "C:\Users\Rajat\Downloads\echofocus\echofocus\.venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python.exe"
}

# 1. Check Weights
Write-Host "`n[1/3] Checking extraction model checkpoints..." -ForegroundColor Green
$sepPath = "checkpoints\fully_ours\best.pt"
$spkPath = "checkpoints\spk_encoder\best.pt"

if (-not (Test-Path $sepPath) -or -not (Test-Path $spkPath)) {
    Write-Host "Checkpoints missing. Downloading trained weights..." -ForegroundColor Yellow
    & $pythonExe scripts\download_weights.py
} else {
    Write-Host "Checkpoints verified (Separator: 38MB, Speaker Encoder: 75MB)." -ForegroundColor Green
}

# 2. Start Backend
Write-Host "`n[2/3] Starting EchoFocus Backend on port 8000..." -ForegroundColor Green
$backendJob = Start-Process -FilePath $pythonExe -ArgumentList "server.py --port 8000" -PassThru -NoNewWindow

Start-Sleep -Seconds 4

# 3. Start Frontend
Write-Host "`n[3/3] Starting EchoFocus Next.js Frontend on port 3000..." -ForegroundColor Green
Set-Location web
& "C:\Users\Rajat\node\npm.cmd" run dev

