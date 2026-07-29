@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem py 是 Windows 官方安裝器一定會附的啟動器，不受 Add to PATH 有沒有勾影響
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 scripts\launcher.py
  goto :finished
)

where python >nul 2>nul
if %errorlevel%==0 (
  python scripts\launcher.py
  goto :finished
)

echo.
echo 找不到 Python，請先安裝 Python 3.10 以上版本：
echo https://www.python.org/downloads/
echo.
pause
exit /b 1

:finished
rem 出錯時視窗要停住讓使用者看得到訊息，不然一閃就關等於什麼都沒發生
if errorlevel 1 (
  echo.
  echo 程式非正常結束，上面是錯誤訊息。
  pause
)
