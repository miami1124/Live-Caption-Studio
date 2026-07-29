"""跨平台啟動器：建立虛擬環境、安裝套件、啟動本機網頁。"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import venv
import webbrowser
from pathlib import Path


def _force_utf8_output() -> None:
    """Windows 的主控台預設編碼吃不下中文，一 print 就 UnicodeEncodeError。

    這不只是訊息醜掉而已：它會讓「安裝失敗」的友善提示自己變成一個 crash，
    使用者反而看不到真正的原因（CI 的 windows-latest 就是這樣一直紅的）。
    改成 UTF-8 並在真的編不出來時用替代字元，至少不會整個炸掉。
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass   # 被導向到不支援 reconfigure 的物件（例如測試的假 stdout）


_force_utf8_output()

ROOT = Path(__file__).resolve().parents[1]
VENV_DIR = ROOT / ".venv"
REQUIREMENTS = ROOT / "requirements.txt"
READY_MARKER = VENV_DIR / ".requirements-ready"
PORT = int(os.getenv("PORT", "5090"))
URL = f"http://127.0.0.1:{PORT}"
OPEN_BROWSER = os.getenv("NO_BROWSER", "").strip().lower() not in {"1", "true", "yes"}


MIN_PYTHON = (3, 10)


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def check_python_version() -> bool:
    """版本太舊要在這裡擋下來。

    不擋的話使用者會看到一整頁 pip 的編譯錯誤，完全猜不到真正的原因是版本。
    """
    if sys.version_info >= MIN_PYTHON:
        return True
    current = ".".join(str(part) for part in sys.version_info[:3])
    needed = ".".join(str(part) for part in MIN_PYTHON)
    print(f"\n這個工具需要 Python {needed} 以上，但目前執行的是 Python {current}。")
    print("請到 https://www.python.org/downloads/ 安裝新版後再試一次。")
    if os.name == "nt":
        print("（Windows 安裝時記得勾選「Add Python to PATH」）")
    return False


def _is_microsoft_store_python() -> bool:
    """Windows 打 `python` 會跳出 Microsoft Store，裝到的是沙盒版。

    那個版本某些版次缺少可用的 ensurepip，導致 venv 建不起來——
    2026-07-29 在真實 Windows 上實測，Store 版 Python 3.14.2 就是這樣卡住的。
    """
    return os.name == "nt" and "windowsapps" in sys.executable.lower()


def _explain_venv_failure(error: Exception) -> str:
    lines = [f"\n無法建立 Python 環境：{error}\n"]
    if _is_microsoft_store_python() or "ensurepip" in str(error).lower() or "pip" in str(error).lower():
        lines += [
            "最常見的原因是：你現在用的是 Microsoft Store 版的 Python，",
            "那個版本缺少建立虛擬環境需要的元件。",
            "",
            "請改安裝 python.org 的官方版（安裝時記得勾選 Add Python to PATH）：",
            "    https://www.python.org/downloads/",
            "",
            "或在命令提示字元執行：",
            "    winget install -e --id Python.Python.3.12",
            "",
            "裝好後把這個資料夾裡的 .venv 資料夾整個刪掉，再重新雙擊 start.bat。",
        ]
    else:
        lines.append("請確認網路正常，並安裝 Python 3.10 以上版本後再試。")
    return "\n".join(lines)


def prepare_environment() -> Path:
    if not venv_python().exists():
        print("\n[1/3] 第一次啟動：建立 Python 環境…")
        try:
            venv.EnvBuilder(with_pip=True).create(VENV_DIR)
        except Exception as error:
            # 這裡失敗使用者完全看不出原因，訊息一定要直接講「該裝哪一版 Python」
            shutil.rmtree(VENV_DIR, ignore_errors=True)   # 半成品環境留著只會讓下次更難debug
            raise RuntimeError(_explain_venv_failure(error)) from error

    python = venv_python()
    needs_install = not READY_MARKER.exists() or READY_MARKER.stat().st_mtime < REQUIREMENTS.stat().st_mtime
    if needs_install:
        print("[2/3] 安裝必要套件，第一次大約需要 1～2 分鐘…")
        subprocess.run(
            [str(python), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(REQUIREMENTS)],
            cwd=ROOT,
            check=True,
        )
        READY_MARKER.write_text("ready\n", encoding="utf-8")
    else:
        print("\n[1/3] Python 環境已就緒。")
        print("[2/3] 必要套件已安裝。")
    return python


def wait_until_ready(process: subprocess.Popen) -> bool:
    for _attempt in range(60):
        if process.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(f"{URL}/api/health", timeout=0.5) as response:
                return response.status == 200
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    return False


def main() -> int:
    if not check_python_version():
        return 1
    try:
        python = prepare_environment()
    except RuntimeError as error:
        print(error)   # 已經是寫給使用者看的完整說明了
        return 1
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"\n環境安裝失敗：{error}")
        print("請確認網路正常，並安裝 Python 3.10 以上版本後再試。")
        return 1

    print(f"[3/3] 啟動 Live Caption Studio：{URL}")
    process = subprocess.Popen([str(python), str(ROOT / "app.py")], cwd=ROOT)
    if not wait_until_ready(process):
        print(f"\n程式無法啟動。可能是 {PORT} 埠已被占用，請關閉舊版本後再試。")
        if process.poll() is None:
            process.terminate()
        return 1

    if OPEN_BROWSER:
        webbrowser.open(URL)
        print("\n瀏覽器已開啟。要結束程式，請關閉此視窗或按 Ctrl+C。\n")
    else:
        print("\n測試模式：未自動開啟瀏覽器。按 Ctrl+C 可結束程式。\n")
    try:
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
