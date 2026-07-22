@echo off
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 scripts\launcher.py
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  python scripts\launcher.py
  goto :end
)

echo 找不到 Python。請先安裝 Python 3.10 以上版本：
echo https://www.python.org/downloads/
pause

:end
