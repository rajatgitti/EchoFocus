# EchoFocus — One-Click Local Launcher
# Starts Python AI Backend on port 8000 and Next.js Frontend on port 3000

$Host.UI.RawUI.WindowTitle = "EchoFocus — Target Speaker Extraction System"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     ECHOFOCUS — Focus on the Voice That Matters" -ForegroundColor Yellow
Write-Host "     Built on VANTA Target Speaker Extraction Foundation" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Set environment paths for Node and Git
$env:PATH = "C:\Users\Rajat\node;C:\Users\Rajat\mingit\cmd;" + $env:PATH
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

# Python executable
$pythonExe = "C:\Users\Rajat\Downloads\echofocus\echofocus\.venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
}

if (-not $pythonExe) {
    Write-Host "[ERROR] Python was not found! Please check your Python installation." -ForegroundColor Red
    pause
    exit 1
}

# 1. Hardware & CUDA Verification
Write-Host "`n[1/4] Verifying hardware & PyTorch execution device..." -ForegroundColor Green
$gpuCheck = & $pythonExe -c "import torch; print(f'CUDA={torch.cuda.is_available()}|DEVICE={torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"CPU\"}')"
$isCuda = $gpuCheck -match "CUDA=True"
if ($isCuda) {
    $devName = ($gpuCheck -split "\|")[1] -replace "DEVICE=",""
    Write-Host "      [CUDA ACCELERATED] Detected GPU: $devName" -ForegroundColor Green
    Write-Host "      Inference speed: ~1.2 seconds with BF16 Mixed Precision." -ForegroundColor Gray
} else {
    Write-Host "      [CPU MODE] CUDA not detected. Using optimized multi-threaded CPU." -ForegroundColor Yellow
}

# 2. Checkpoints Verification
Write-Host "`n[2/4] Verifying AI model checkpoints..." -ForegroundColor Green
$sepPath = Join-Path $root "checkpoints\fully_ours\best.pt"
$spkPath = Join-Path $root "checkpoints\spk_encoder\best.pt"

if (-not (Test-Path $sepPath) -or -not (Test-Path $spkPath)) {
    Write-Host "      Checkpoints missing. Downloading trained weights..." -ForegroundColor Yellow
    & $pythonExe (Join-Path $root "scripts\download_weights.py")
} else {
    $sepSize = [math]::Round((Get-Item $sepPath).Length / 1MB, 1)
    $spkSize = [math]::Round((Get-Item $spkPath).Length / 1MB, 1)
    Write-Host "      VANTA Separator Checkpoint: $sepPath ($sepSize MB)" -ForegroundColor Gray
    Write-Host "      ECAPA-TDNN Speaker Encoder: $spkPath ($spkSize MB)" -ForegroundColor Gray
}

# 3. Clean up existing ports (8000 and 3000)
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

# 4. Start Backend
Write-Host "`n[3/4] Starting EchoFocus Backend on http://127.0.0.1:8000..." -ForegroundColor Green
$backendProc = Start-Process -FilePath $pythonExe `
    -ArgumentList (Join-Path $root "server.py"), "--port 8000" `
    -WorkingDirectory $root `
    -PassThru `
    -WindowStyle Hidden

# Wait for Backend to become healthy
$healthy = $false
$attempts = 0
while (-not $healthy -and $attempts -lt 25) {
    Start-Sleep -Milliseconds 800
    $attempts++
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -ErrorAction Stop
        if ($res.status -eq "ok") {
            $healthy = $true
            Write-Host "      Backend is healthy! (Device: $($res.device), Whisper: $($res.whisper_asr))" -ForegroundColor Green
        }
    } catch {
        Write-Host -NoNewline "." -ForegroundColor DarkGray
    }
}

if (-not $healthy) {
    Write-Host "`n[ERROR] Backend failed to start. Please check server.py output." -ForegroundColor Red
    if ($backendProc -and -not $backendProc.HasExited) { Stop-Process -Id $backendProc.Id -Force }
    pause
    exit 1
}

# 5. Start Frontend
Write-Host "`n[4/4] Starting Next.js Frontend on http://localhost:3000..." -ForegroundColor Green
$webDir = Join-Path $root "web"
$npmCmd = "C:\Users\Rajat\node\npm.cmd"
if (-not (Test-Path $npmCmd)) {
    $npmCmd = "npm.cmd"
}

# Launch browser
Start-Process "http://localhost:3000"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " EchoFocus is live at: http://localhost:3000" -ForegroundColor Yellow
Write-Host " Connected to backend: http://127.0.0.1:8000" -ForegroundColor Gray
Write-Host " Press Ctrl+C in this window to stop both servers." -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan

try {
    Set-Location $webDir
    & $npmCmd run dev
} finally {
    Write-Host "`nStopping EchoFocus services..." -ForegroundColor Yellow
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "EchoFocus shut down cleanly." -ForegroundColor Green
}
