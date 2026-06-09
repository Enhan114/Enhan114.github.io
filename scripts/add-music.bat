@echo off
title Aura Music - 添加音乐
cd /d "%~dp0.."

:: ── Check Node.js ──
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 需要 Node.js. 下载: https://nodejs.org
    pause & exit /b 1
)

:: ── Check git ──
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 需要 Git. 下载: https://git-scm.com
    pause & exit /b 1
)

setlocal enabledelayedexpansion

:menu
cls
echo.
echo   ╔══════════════════════════════════════════════════╗
echo   ║         Aura Music — 音乐添加工具               ║
echo   ╠══════════════════════════════════════════════════╣
echo   ║                                                  ║
echo   ║   [1]  从目录添加 .flac 文件 (API 歌词)          ║
echo   ║   [2]  从目录添加 .flac 文件 (AMLL 歌词)         ║
echo   ║   [3]  从目录添加 .flac 文件 (每首歌单独选)      ║
echo   ║                                                  ║
echo   ║   [B]  仅构建 + 上传 (不添加新歌)                ║
echo   ║   [Q]  退出                                     ║
echo   ║                                                  ║
echo   ╚══════════════════════════════════════════════════╝
echo.
set /p choice="  选择: "

if /i "%choice%"=="1" set MODE=api & goto pick_dir
if /i "%choice%"=="2" set MODE=amll & goto pick_dir
if /i "%choice%"=="3" set MODE=ask & goto pick_dir
if /i "%choice%"=="b" goto build_only
if /i "%choice%"=="B" goto build_only
if /i "%choice%"=="q" exit /b 0
if /i "%choice%"=="Q" exit /b 0
goto menu

:pick_dir
echo.
echo   ┌─────────────────────────────────────────────────┐
echo   │  输入存放 .flac 文件的目录路径:                  │
echo   │  例如: C:\Users\jinkela\Downloads\music          │
echo   └─────────────────────────────────────────────────┘
echo.
set /p "DIR_PATH=  目录: "
if not exist "!DIR_PATH!" (
    echo   [ERROR] 目录不存在!
    timeout /t 2 >nul
    goto menu
)

:: ── Find .flac files ──
set COUNT=0
for %%f in ("!DIR_PATH!\*.flac") do set /a COUNT+=1
if !COUNT!==0 (
    echo   [WARN] 目录中没有 .flac 文件
    timeout /t 2 >nul
    goto menu
)

echo.
echo   找到 !COUNT! 个 .flac 文件
echo.

:: ── Ask for lyrics source per song if mode=ask ──
if /i "%MODE%"=="ask" (
    echo   ┌─────────────────────────────────────────────────┐
    echo   │  每首歌的歌词来源:                               │
    echo   │    api  = 从 music-api.cc.cd API 获取            │
    echo   │    amll = 从 AMLL TTML 数据库获取                │
    echo   │    留空 = 默认 amll                             │
    echo   └─────────────────────────────────────────────────┘
    echo.
)

:: ── Process files ──
echo   ── 开始处理 ──
echo.

set PROCESSED=0
for %%f in ("!DIR_PATH!\*.flac") do (
    set /a PROCESSED+=1
    set "SONG_FILE=%%f"
    set "SONG_NAME=%%~nf"

    if /i "%MODE%"=="ask" (
        echo   [!PROCESSED!/!COUNT!] !SONG_NAME!
        set /p "SONG_SRC=    歌词来源 [api/amll/回车=amll]: "
        if "!SONG_SRC!"=="" set SONG_SRC=amll
    )

    :: Copy file
    echo     复制...
    copy "%%f" "public\music\" >nul

    :: Set source for this song
    if /i "%MODE%"=="amll" set SONG_SRC=amll
    if /i "%MODE%"=="api"  set SONG_SRC=api

    :: Process one at a time via Node helper
    node scripts\add-music-single.mjs "%%f" --source=!SONG_SRC! 2>&1
    echo.
)

:: ── Build & push ──
:build_only
echo.
echo   ── 构建中... ──
call npx vite build --logLevel error
echo   ── 提交上传... ──
git add -A 2>nul
git commit -m "Add music via script" 2>nul
git push 2>nul
echo.
echo   ✅ 完成！按任意键返回菜单...
pause >nul
goto menu
