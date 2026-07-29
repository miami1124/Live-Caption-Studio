# 給 Claude Code 的指引

安裝與疑難排解的完整說明在 **[AGENTS.md](AGENTS.md)**，請先讀那份再動作。

先確認使用者的作業系統，各自的地雷不一樣：

**Windows**
先跑 `where python`。路徑含 `WindowsApps` 就是 Microsoft Store 版，它缺 `ensurepip`，建立虛擬環境一定失敗——要先改裝 python.org 官方版（`winget install -e --id Python.Python.3.12`），並刪掉失敗的 `.venv` 再重試。

**macOS**
使用者自己雙擊 `start.command` 第一次一定會被 Gatekeeper 擋（「來自未識別的開發者」），要請他改用**右鍵 →「打開」**。你在終端機直接跑 `./start.sh` 不受影響，必要時先 `chmod +x start.command start.sh`。

**Linux**
Debian / Ubuntu 系可能缺 venv 模組：`sudo apt install python3-venv`。

**共通**
指令必須在專案資料夾內執行（有 `app.py` 的那層）。在家目錄下指令會一直「找不到檔案」，這是實測中最常見的浪費時間來源。

驗證是否成功：`curl -s http://127.0.0.1:5090/api/health` 回 200。啟動用的終端機視窗必須保持開啟，關掉程式就結束。
