# 給 AI 助手的安裝指引

這份是寫給「幫使用者安裝這個工具的 AI」看的。人類請看 [README.md](README.md)。

**這個專案是什麼**：本機執行的即時翻譯字幕工具。使用者講中文，畫面上疊出英文／日文／韓文字幕在他的 PDF 簡報上。Flask + vanilla JS，只綁 `127.0.0.1`，使用者自備 Gemini API key。

---

## 安裝流程

### 前置檢查（先做這步，可以省下大量除錯時間）

```bash
python3 --version   # macOS / Linux
py --version        # Windows
```

需要 **3.10 以上**。

**Windows 額外必須確認這件事**——這是實測中最常見的失敗原因：

```
where python
```

如果路徑裡包含 `WindowsApps`，代表這是 **Microsoft Store 版的 Python**，它缺少 `ensurepip`，**建立虛擬環境一定會失敗**。請先讓使用者改裝官方版：

```
winget install -e --id Python.Python.3.12
```

裝完要關掉並重開命令提示字元，然後用 `py -3.12` 而不是 `py -3`。

### 啟動

⚠️ **所有指令都必須在專案資料夾內執行**（就是有 `app.py` 和 `start.bat` 的那層）。實測中最常見的錯誤是在 `C:\Users\<使用者>` 或家目錄下執行，導致「找不到檔案」。

```bash
# macOS / Linux
cd /path/to/gemini-live-caption
./start.sh

# Windows（在專案資料夾按住 Shift + 右鍵 →「在終端機中開啟」）
py -3.12 scripts\launcher.py
```

**macOS 額外注意**：如果使用者是自己雙擊 `start.command`，第一次一定會被 Gatekeeper 擋下（「無法打開，因為它來自未識別的開發者」）。要請他改用**右鍵 →「打開」**才會出現「仍要打開」的選項。你直接在終端機跑 `./start.sh` 則不受影響，但可能需要先給執行權限：

```bash
chmod +x start.command start.sh
```

**Linux 額外注意**：Debian / Ubuntu 系可能缺 venv 模組，會在建立虛擬環境時失敗：

```bash
sudo apt install python3-venv
```

第一次會自動建立 `.venv` 並安裝套件，約 1-2 分鐘。

### 怎麼確認成功

終端機出現 `[3/3]` 和 `http://127.0.0.1:5090` 就是成功了。也可以另開一個終端機驗證：

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5090/api/health
```

回 `200` 代表服務正常。

**啟動用的那個視窗必須保持開啟**——它就是程式本身，關掉程式就結束。

---

## 已知失敗模式

實測踩過的坑，遇到直接對照，不用重新診斷：

| 現象 | 原因 | 處理 |
|---|---|---|
| 雙擊 `start.bat` 完全沒反應 | 舊版本的 `.bat` 是 LF 換行，`cmd.exe` 找不到 `goto` 標籤。已於 2026-07-29 修正 | 重新下載最新版 ZIP |
| `ensurepip is not available` / venv 建立失敗 | Microsoft Store 版 Python | 改裝 python.org 官方版，**並刪掉專案資料夾內失敗的 `.venv`** 再重試 |
| `ERR_CONNECTION_REFUSED` | 程式沒在跑（多半是啟動視窗被關掉） | 重新啟動，並提醒使用者視窗要留著 |
| 終端機出現亂碼或 `UnicodeEncodeError` | Windows 主控台編碼。已於 2026-07-29 修正 | 重新下載最新版 |
| 找不到 `app.py` / `.venv` | 在錯誤的資料夾下指令 | `cd` 到專案資料夾再執行 |
| macOS：「無法打開，因為它來自未識別的開發者」 | Gatekeeper 擋下從網路下載的執行檔 | 請使用者用**右鍵 →「打開」**；或在終端機 `chmod +x start.command start.sh` 後執行 |
| Linux：建立虛擬環境失敗 | 缺 venv 模組 | `sudo apt install python3-venv` |

## 安裝後使用者還需要做的事

1. 到 https://aistudio.google.com/app/apikey 取得 Gemini API key
2. 在網頁的「聲音與連線」貼上（關掉程式就清除，不會寫入檔案）
3. **請使用者按一次「測試聲音」**，確認音量條會跳。跳過這步有機率遇到上台後沒有字幕
4. 選一份 PDF，三項亮綠燈後就能開始

瀏覽器請用最新版 Chrome 或 Edge。

## 不要做的事

- 不要嘗試把服務綁到 `0.0.0.0` 或對外開放，它刻意只聽 `127.0.0.1`
- 不要把使用者的 API key 寫進任何會進版控的檔案
- 不要建議改用其他語音模型，`gemini-3.5-live-translate-preview` 是目前唯一支援這個 WebSocket 端點的模型

## 開發者資訊

```bash
python -m unittest discover -s tests -v   # 19 個測試
```

改 `templates/` 下的檔案後要重開 server（Flask 非 debug 模式會快取模板）；改 CSS / JS 只要重整瀏覽器。
