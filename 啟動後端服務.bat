@echo off
chcp 65001 >nul
echo ========================================
echo 啟動後端服務
echo ========================================
echo.

cd /d "%~dp0"

echo 檢查虛擬環境...
if not exist "venv\Scripts\activate.bat" (
    echo [錯誤] 虛擬環境不存在！
    echo 請先執行: python -m venv venv
    pause
    exit /b 1
)

echo 啟動虛擬環境...
call venv\Scripts\activate.bat

echo.
echo 檢查 app.py...
if not exist "app.py" (
    echo [錯誤] app.py 不存在！
    pause
    exit /b 1
)

echo.
echo ========================================
echo 正在啟動後端服務...
echo 服務地址: http://localhost:8000
echo 按 Ctrl+C 停止服務
echo ========================================
echo.

uvicorn app:app --reload --port 8000

pause
