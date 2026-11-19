@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Turber 账户服务启动中...
echo 网页地址: http://127.0.0.1:8787/
node --experimental-sqlite src/index.mjs
pause
