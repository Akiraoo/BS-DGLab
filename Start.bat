@echo off
if not exist node_modules (
    echo Installing required package...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies.
        pause
        exit /b 1
    )
)
npm start
pause