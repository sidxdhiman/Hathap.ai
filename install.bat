@echo off
setlocal
rem Install both workspaces from the repository root. The repo has no root
rem package.json, so `npm install` here does nothing useful - each workspace
rem has to be installed on its own.
cd /d "%~dp0"

echo Installing server dependencies...
pushd server
call npm install
if errorlevel 1 (
    popd
    echo.
    echo Server install failed.
    exit /b 1
)
popd

echo Installing client dependencies...
pushd client
call npm install
if errorlevel 1 (
    popd
    echo.
    echo Client install failed.
    exit /b 1
)
popd

echo.
echo Install complete. Next steps:
echo   1. copy server\.env.example to server\.env and set JWT_SECRET and
echo      API_KEY_ENCRYPTION_SECRET (32+ characters)
echo   2. start MongoDB, then run `npm run dev` in server\ and in client\
echo   3. open http://localhost:5173
exit /b 0
