# 給 Claude Code 的指引

安裝與疑難排解的完整說明在 **[AGENTS.md](AGENTS.md)**，請先讀那份再動作。

兩件最常見的失敗，先確認可以省下大量時間：

1. **Windows 使用者的 Python 來源**。先跑 `where python`，路徑含 `WindowsApps` 就是 Microsoft Store 版，缺 `ensurepip`，建立虛擬環境一定失敗。要先改裝 python.org 官方版。
2. **指令必須在專案資料夾內執行**（有 `app.py` 的那層）。在家目錄下指令會一直「找不到檔案」。

驗證是否成功：`curl -s http://127.0.0.1:5090/api/health` 回 200。啟動用的終端機視窗必須保持開啟，關掉程式就結束。
