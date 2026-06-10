@echo off
chcp 65001 >nul
title Aura Music - Add Music
cd /d "%~dp0.."

where node >nul 2>&1
if %errorlevel% neq 0 ( echo [ERROR] Node.js required. https://nodejs.org & pause & exit /b 1 )
where git >nul 2>&1
if %errorlevel% neq 0 ( echo [ERROR] Git required. https://git-scm.com & pause & exit /b 1 )

setlocal enabledelayedexpansion

:menu
cls
echo.
echo   ================================================
echo          Aura Music - Add Music Tool
echo   ================================================
echo.
echo     [1] Add .flac files (AMLL lyrics - default)
echo     [2] Add .flac files (API lyrics)
echo     [3] Add .flac files (choose per song)
echo.
echo     [B] Build + upload only
echo     [Q] Quit
echo.
echo   ================================================
echo.
set /p choice="  Choice: "

if /i "%choice%"=="1" set MODE=amll & goto pick_dir
if /i "%choice%"=="2" set MODE=api & goto pick_dir
if /i "%choice%"=="3" set MODE=ask & goto pick_dir
if /i "%choice%"=="b" goto build_only
if /i "%choice%"=="B" goto build_only
if /i "%choice%"=="q" exit /b 0
if /i "%choice%"=="Q" exit /b 0
goto menu

:pick_dir
echo.
echo   --------------------------------------------------
echo     Enter the folder path containing .flac files:
echo     e.g. C:\Users\jinkela\Downloads\music
echo   --------------------------------------------------
echo.
set /p "DIR_PATH=  Folder: "
if not exist "!DIR_PATH!" ( echo   [ERROR] Folder not found! && timeout /t 2 >nul && goto menu )

set COUNT=0
for %%f in ("!DIR_PATH!\*.flac") do set /a COUNT+=1
if !COUNT!==0 ( echo   [WARN] No .flac files in folder && timeout /t 2 >nul && goto menu )

echo.
echo   Found !COUNT! .flac file(s)
echo.

:: Process
echo   --- Processing ---
echo.
set PROCESSED=0
for %%f in ("!DIR_PATH!\*.flac") do (
    set /a PROCESSED+=1
    set "SONG_FILE=%%f"
    set "SONG_NAME=%%~nf"

    if /i "%MODE%"=="ask" (
        echo   [!PROCESSED!/!COUNT!] !SONG_NAME!
        set /p "SONG_SRC=    Source [amll/api/Enter=amll]: "
        if "!SONG_SRC!"=="" set SONG_SRC=amll
    )
    if /i "%MODE%"=="amll" set SONG_SRC=amll
    if /i "%MODE%"=="api"  set SONG_SRC=api

    echo   [!PROCESSED!/!COUNT!] !SONG_NAME! (source: !SONG_SRC!)

    :: Copy file
    copy "%%f" "public\music\" >nul 2>&1

    :: Process via Node
    node scripts\add-music-single.mjs "%%f" --source=!SONG_SRC!
    echo.
)

:build_only
echo.
echo   --- Syncing FLAC to docs... ---
if not exist "docs\music" mkdir "docs\music"
copy "public\music\*.flac" "docs\music\" >nul 2>&1
copy "public\music\*.mp3" "docs\music\" >nul 2>&1
echo   --- Building... ---
call npx vite build --logLevel error
echo   --- Unlocking manifest for commit... ---
git update-index --no-skip-worktree public\music-manifest.json 2>nul
git update-index --no-skip-worktree docs\music-manifest.json 2>nul
echo   --- Committing & pushing... ---
git add -A 2>nul
git commit -m "Add music via script" 2>nul
git push 2>nul
echo   --- Locking manifest... ---
git update-index --skip-worktree public\music-manifest.json 2>nul
git update-index --skip-worktree docs\music-manifest.json 2>nul
echo.
echo   Done! Press any key to return to menu...
pause >nul
goto menu
