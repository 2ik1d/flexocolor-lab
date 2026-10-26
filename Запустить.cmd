@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "FLEXOCOLOR_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "FLEXOCOLOR_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%FLEXOCOLOR_NODE%" scripts\serve.mjs
if errorlevel 1 pause
