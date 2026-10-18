@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TERRAIN / 01 - 山地聚落生长实验室
echo.
echo   TERRAIN / 01 - 山地聚落生长实验室
echo   正在启动本地服务器...
echo.
start "TERRAIN / 01 server" cmd /k "node server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8123"
echo   浏览器已打开 http://127.0.0.1:8123
echo   关闭服务器窗口即可停止。
echo.
