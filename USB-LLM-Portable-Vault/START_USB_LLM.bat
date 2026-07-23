@echo off
setlocal EnableExtensions
title USB LLM Portable Vault
cd /d "%~dp0"

echo ============================================================
echo              USB LLM PORTABLE ENCRYPTED WORKSPACE
echo ============================================================
echo.
echo Nothing will be installed on this computer.
echo Credentials and conversations remain encrypted on the USB.
echo Attached files are processed temporarily and are not saved.
echo.
echo Keep this window open while USB LLM is running.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SERVER.ps1"

echo.
echo USB LLM has stopped.
pause
