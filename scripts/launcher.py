"""跨平台啟動器：建立虛擬環境、安裝套件、啟動本機網頁。"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import venv
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VENV_DIR = ROOT / ".venv"
REQUIREMENTS = ROOT / "requirements.txt"
READY_MARKER = VENV_DIR / ".requirements-ready"
PORT = int(os.getenv("PORT", "5090"))
URL = f"http://127.0.0.1:{PORT}"
OPEN_BROWSER = os.getenv("NO_BROWSER", "").strip().lower() not in {"1", "true", "yes"}


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def prepare_environment() -> Path:
    if not venv_python().exists():
        print("\n[1/3] 第一次啟動：建立 Python 環境…")
        venv.EnvBuilder(with_pip=True).create(VENV_DIR)

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
    try:
        python = prepare_environment()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"\n環境安裝失敗：{error}")
        print("請確認網路正常，並安裝 Python 3.10 以上版本後再試。")
        return 1

    print(f"[3/3] 啟動 Live Caption Studio：{URL}")
    process = subprocess.Popen([str(python), str(ROOT / "app.py")], cwd=ROOT)
    if not wait_until_ready(process):
        print("\n程式無法啟動。可能是 5090 埠已被占用，請關閉舊版本後再試。")
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
