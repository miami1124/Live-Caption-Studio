# Live Caption Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-5b9a7e?style=flat-square&labelColor=2e3632)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows_|_macOS_|_Linux-5b9a7e?style=flat-square&labelColor=2e3632)](#開始使用)
[![Python](https://img.shields.io/badge/python-3.10+-5b9a7e?style=flat-square&labelColor=2e3632)](https://www.python.org/downloads/)
[![Tests](https://img.shields.io/github/actions/workflow/status/miami1124/gemini-live-caption/test.yml?style=flat-square&label=tests&labelColor=2e3632&color=5b9a7e)](https://github.com/miami1124/gemini-live-caption/actions/workflows/test.yml)

用中文報告，台下即時看到英文、日文或韓文字幕——字幕直接疊在你的 PDF 簡報上。

這是一套**在你自己電腦上執行**的開源工具。你用自己的 Gemini API key，上傳簡報PDF就可以成功使用。

![Live Caption Studio 實際運作：講中文，英文字幕即時浮現在簡報上](assets/demo.gif)

*實際錄影：講者說中文，翻譯字幕即時出現在投影片下方。*

## 💡 讓 AI 幫你安裝（最省事）

不想自己研究的話，**把下面這段整個複製給你的 AI**（ChatGPT、Claude、Gemini、Codex、Cursor 都可以）：

```text
請幫我安裝這個工具：https://github.com/miami1124/gemini-live-caption

請先讀該 repo 的 AGENTS.md 再動作（如果你是 Claude Code，讀 CLAUDE.md），
裡面有完整安裝流程和各系統的已知地雷。

請先確認我的作業系統，再照對應的注意事項處理：

【Windows】
先跑 where python。路徑含 WindowsApps 代表 python 指到 Microsoft Store 版，
它缺少 ensurepip，虛擬環境會建不起來。
但先別叫我重裝——官方版可能早就裝好、只是排在後面。
請先跑 py -3.12 --version 確認：有版本號就一律改用 py -3.12，
真的沒有才安裝官方版。

【如果你是在沙盒或受限環境裡執行】
遇到 ensurepip 失敗、暫存目錄權限被拒、或你開的視窗被系統關掉，
那是你的執行環境限制，不是這個專案的問題。
請不要繼續想辦法繞過，直接叫我自己雙擊 start.bat 就好，兩分鐘的事。

【macOS】
start.command 第一次要用「右鍵 → 打開」，直接雙擊會被 Gatekeeper 擋下。
必要時先執行 chmod +x start.command start.sh。

【Linux】
可能要先安裝 python3-venv。

【共通】
所有指令都必須在專案資料夾內執行（有 app.py 的那層），不要在家目錄下指令。

裝好後請告訴我：要打開哪個網址、以及啟動用的終端機視窗能不能關掉。
```

> 這個專案為此準備了 [AGENTS.md](AGENTS.md)（Codex、Cursor 等）與 [CLAUDE.md](CLAUDE.md)（Claude Code），裡面是精確到資料夾的指令、已知失敗模式對照表和驗證方式。
>
> 已經自己下載好 ZIP 的話，直接在那個資料夾開啟 AI 工具，跟它說「讀 AGENTS.md 幫我安裝」就好。

## 適合什麼場合

上台報告時台下有聽不懂中文的人。在台上可以講中文，翻譯字幕就可以顯示在簡報上，跨越語言的問題，讓全場人都能聽懂你的簡報。

---

## 開始使用

### 1. 依你的系統安裝

各系統的地雷不一樣，請照著自己的那份走：

| 系統 | 安裝說明 | 特別注意 |
|---|---|---|
| **Windows** | [install/windows.md](install/windows.md) | ⚠️ 一定要裝 python.org 官方版，不能用 Microsoft Store 版 |
| **macOS** | [install/macos.md](install/macos.md) | 第一次要用右鍵開啟，不能直接雙擊 |
| **Linux** | [install/linux.md](install/linux.md) | 可能要先裝 `python3-venv` |

共通條件：**Python 3.10 以上**，瀏覽器用**最新版 Chrome 或 Edge**。

第一次啟動會自動建立環境並安裝套件（約 1-2 分鐘），完成後瀏覽器會開啟 `http://127.0.0.1:5090`。

### 2. 取得 Gemini API key

到 [Google AI Studio](https://aistudio.google.com/app/apikey) 建立一組。免費額度就能用，用量與費用都算在你自己的 Google 專案上。

### 3. 填入 API key

程式打開後，展開畫面上的「聲音與連線」，把剛剛複製的 key 貼進去就好。

key 只留在程式的記憶體裡，**關掉程式就自動清除，不會寫進電腦裡任何檔案**。下次開啟再貼一次即可。

如果 key 不小心外流了，到 [Google AI Studio](https://aistudio.google.com/app/apikey) 把它刪掉重建一組就好。

---

## 怎麼用

### 開始前設定

畫面上三項，全部亮綠燈才能進簡報：

1. **簡報檔案** — 拖曳或選擇 PDF。Keynote / PowerPoint / Google Slides 都請先匯出成 PDF
2. **字幕語言** — 台下會看到的語言（你講的還是中文）
3. **聲音與連線** — 選麥克風、貼 API key

**強烈建議按一次「測試聲音」**。右邊的條會跳，就代表收得到你的聲音。跳過這步偶爾會遇到上台後按了翻譯卻沒字幕。

### 簡報進行中

進去後畫面上**什麼都沒有**——因為投影幕就是這個畫面，台下也在看。

- **控制列**：把滑鼠移到畫面**最下面**才會浮出來，停幾秒自己收掉。翻頁、按快捷鍵都不會叫它出來
- **字幕位置**：用滑鼠**直接拖**字幕到你想要的地方，位置會記住。拖丟了就到設定面板按「字幕位置歸位」
- **斷線**：只有連線出問題才會從上面滑下一條提示，同時把字幕調暗，讓你知道螢幕上那句是舊的

### 快捷鍵

| 按鍵 | 功能 |
|---|---|
| `M` | 開始／停止翻譯 |
| `S` | 開關設定面板 |
| `C` | 顯示／隱藏中文對照 |
| `P` | 開關字幕浮窗（需 Chrome 116+／Edge）|
| `F` | 全螢幕 |
| `←` `→`、空白鍵 | 投影片翻頁 |
| `+` `-` | 字幕放大／縮小 |

沒有 PDF 也想先試？用 [`sample/sample-presentation.pdf`](sample/sample-presentation.pdf)。

---

## 遇到問題

### 過一陣子回來，網頁變成「無法連上這個網站」

**啟動時開的那個終端機視窗，就是程式本身。** 視窗關掉、終端機 App 關掉、或按了 `Ctrl+C`，程式就結束了——就像關掉 Word 視窗，Word 就關了一樣。

所以用 `start.command` / `start.bat` / `start.sh` 啟動後，**那個視窗要留著**。縮到最小沒關係，關掉就是結束。

如果你希望它在背景一直跑、關掉終端機也不受影響（macOS／Linux）：

```bash
cd 你放這個工具的資料夾
nohup .venv/bin/python app.py > /tmp/live-caption.log 2>&1 &
```

之後要停掉：

```bash
kill $(lsof -ti :5090)
```

要看它有沒有出錯，訊息都在 `/tmp/live-caption.log`。

### 按了「開始翻譯」但完全沒字幕

1. 回到設定頁按「**測試聲音**」，確認音量條會跳
2. 檢查瀏覽器有沒有擋掉麥克風權限（網址列左邊的圖示）
3. 用的是藍牙耳機或外接麥克風？在「聲音與連線」的下拉選單改選正確的裝置
4. 翻譯中如果連續十幾秒收不到任何聲音，畫面上方會自己跳出提示

### 找不到「開始翻譯」按鈕

把滑鼠移到畫面**最底部**，控制列就會浮出來。或直接按 `M`。

### 字幕擋到投影片內容

用滑鼠抓著字幕拖走就好，它會記住新位置。

### 字幕跟不上／延遲很久

檢查網路。音訊是即時傳到 Google 的，網路不穩就會延遲或斷線。

### 出現「額度用完」

你的 Google 專案額度或速率限制到了，到 Google AI Studio 查看。

### 出現「API key 無效」或「翻譯模型無法使用」

先確認 key 沒貼錯、沒多空格。如果確定沒錯，問題可能是**你的 key 沒有這個預覽模型的存取權限**——Live Translate 還在 public preview，不是每組 key 都開放。到 [Google AI Studio](https://aistudio.google.com/app/apikey) 用同一個帳號重新建一組最新的 key 再試。

---

## 你的資料去了哪裡

只有一件事會離開你的電腦，就是**你講話的聲音**：

- **簡報 PDF 完全不會上網。** 它只在你自己的電腦裡轉成圖片，暫存在系統的暫存資料夾，關掉程式就自動刪掉
- **麥克風收到的聲音會傳給 Google Gemini。** 這是翻譯必要的——沒有它就沒有字幕
- 本工具**不會**保存你的錄音、逐字稿或字幕，講完就沒了
- 聲音送到 Google 之後怎麼處理，就依照 Google 自己的服務條款與隱私政策
- 這個程式只在你這台電腦上開放，**同一個 Wi-Fi 底下的其他人也連不進來**

## 這個工具能做到什麼、做不到什麼

先講清楚範圍，免得你裝好才發現不合用：

**做得到**：你講中文，台下即時看到英文／日文／韓文字幕，疊在你的 PDF 簡報上。

**做不到**：
- 講中文以外的語言（來源語言固定中文）
- 輸出英日韓以外的語言
- 保證專有名詞正確——公司名、人名、術語會被翻錯，而且每次錯法不一樣
- 讀取加密、損毀、超過 50 MB 或超過 200 頁的 PDF
- 字幕換行（一律單行，太長的句子會自動縮小字級）

**需要注意**：字幕浮窗需要 Chrome 116 以上或 Edge；用其他瀏覽器字幕還是會正常疊在投影片上，只是沒有浮窗。API 的額度、速率限制與可能的費用，都算在你自己的 Google 專案上。

---

## 開發

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python app.py
```

### 每次都要重貼 key 很煩？

常常使用的話，可以把 key 寫進專案資料夾裡的 `.env`，程式啟動時會自動讀取：

```bash
cp -n .env.example .env    # -n 的意思是「已經有就不要覆蓋」，別省略
```

然後編輯 `.env`（macOS `open -e .env`／Windows `notepad .env`）填入：

```dotenv
GEMINI_API_KEY=你的_API_key
```

這個檔案只存在你自己的電腦裡。`.gitignore` 已經排除它，正常操作不會誤傳到 GitHub。

### 其他

若環境裡已有 `GEMINI_API_KEY`，可以驗證 Gemini Live Translate 握手：

```bash
python scripts/gemini_smoke_test.py
```

> 改 `templates/` 底下的檔案後**要重開 server**才會生效（Flask 在非 debug 模式會快取模板）。改 CSS / JS 只要重整瀏覽器。

回報問題請開 [Issue](../../issues)。安全性問題請看 [SECURITY.md](SECURITY.md)。

---

## 關於作者

**SAM（張莆崧）** — AI 自動化工作者，用 n8n 和 Claude Code 做自動化與工具。

這個工具的起點是一場真實的需求：在中研院用中文做報告，台下有聽不懂中文的外國學者。實際上台用過之後，才慢慢補成現在這個樣子。

- GitHub：[@miami1124](https://github.com/miami1124)
- Threads：[@pusung.ai](https://www.threads.net/@pusung.ai)
- Instagram：[@pusung.ai](https://www.instagram.com/pusung.ai/)

歡迎回報使用狀況，特別是**卡住的地方**——那些是我自己一台電腦測不出來的。

## 授權

[MIT License](LICENSE)。PDF 轉圖使用 [pypdfium2](https://github.com/pypdfium2-team/pypdfium2)，其本身採 Apache-2.0／BSD-3-Clause，並包含 PDFium 的第三方授權。
