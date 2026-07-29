# 給 Claude Code 的指引

安裝與疑難排解的完整說明在 **[AGENTS.md](AGENTS.md)**，請先讀那份再動作。

先確認使用者的作業系統，各自的地雷不一樣：

**Windows**
先跑 `where python`。路徑含 `WindowsApps` 代表 `python` 指到 Microsoft Store 版，它缺 `ensurepip`，建立虛擬環境一定失敗。但**先別叫使用者重裝**——官方版可能早就裝好、只是排在後面，先跑 `py -3.12 --version` 確認。有版本號就一律改用 `py -3.12`；真的沒有才裝（`winget install -e --id Python.Python.3.12`），並刪掉失敗的 `.venv` 再重試。

**⚠️ 如果你在沙盒環境裡**
`ensurepip` 失敗、暫存目錄權限被拒、你開的終端機視窗被關掉——這些是**你的執行環境限制，不是專案問題**。不要繼續繞，直接請使用者自己雙擊 `start.bat`（macOS 右鍵開 `start.command`），兩分鐘就好。實測有 agent 為此繞了十幾分鐘。

**macOS**
使用者自己雙擊 `start.command` 第一次一定會被 Gatekeeper 擋。⚠️ **別叫他用「右鍵 →『打開』」**，macOS 15 之後那個繞道已被移除（macOS 26 實測確認），對話框只剩「完成」和「丟到垃圾桶」。正解是「系統設定 → 隱私權與安全性 → 安全性區塊 → 仍要打開」，或執行 `xattr -d com.apple.quarantine start.command start.sh`。你在終端機直接跑 `./start.sh` 不受影響。

**Linux**
Debian / Ubuntu 系可能缺 venv 模組：`sudo apt install python3-venv`。

**共通**
指令必須在專案資料夾內執行（有 `app.py` 的那層）。在家目錄下指令會一直「找不到檔案」，這是實測中最常見的浪費時間來源。

驗證是否成功：`curl -s http://127.0.0.1:5090/api/health` 回 200。啟動用的終端機視窗必須保持開啟，關掉程式就結束。
