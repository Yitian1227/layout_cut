# 啟動後端服務 PowerShell 腳本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "啟動後端服務" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 切換到腳本所在目錄
Set-Location $PSScriptRoot

# 檢查虛擬環境
if (-not (Test-Path "venv\Scripts\Activate.ps1")) {
    Write-Host "[錯誤] 虛擬環境不存在！" -ForegroundColor Red
    Write-Host "請先執行: python -m venv venv" -ForegroundColor Yellow
    Read-Host "按 Enter 鍵退出"
    exit 1
}

# 檢查 app.py
if (-not (Test-Path "app.py")) {
    Write-Host "[錯誤] app.py 不存在！" -ForegroundColor Red
    Read-Host "按 Enter 鍵退出"
    exit 1
}

# 啟動虛擬環境
Write-Host "啟動虛擬環境..." -ForegroundColor Green
& "venv\Scripts\Activate.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "正在啟動後端服務..." -ForegroundColor Cyan
Write-Host "服務地址: http://localhost:8000" -ForegroundColor Yellow
Write-Host "按 Ctrl+C 停止服務" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 啟動 uvicorn
uvicorn app:app --reload --port 8000
