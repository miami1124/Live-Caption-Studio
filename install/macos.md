# macOS 安裝說明

## 需要什麼

Python 3.10 以上。macOS 通常已經內建，先確認一下：

```bash
python3 --version
```

版本太舊或顯示找不到的話，到 [python.org/downloads](https://www.python.org/downloads/) 下載安裝即可。

## 安裝步驟

1. 到 [Repository 首頁](https://github.com/miami1124/gemini-live-caption) 按 **Code → Download ZIP**
2. 解壓縮，會得到 `gemini-live-caption-main` 資料夾
3. 雙擊 `start.command`

**第一次一定會被擋下來**，跳出「Apple 無法驗證是否為惡意軟體」。這是正常的——因為這是免費開源工具，沒有付費申請 Apple 的開發者簽章。**下面教你怎麼放行，只需要做一次。**

### 放行方式（macOS 15 以上）

> ⚠️ 網路上很多教學說「右鍵 →『打開』就會出現仍要打開」——**那是舊版 macOS 的做法，現在已經沒用了**，對話框只會給你「完成」和「丟到垃圾桶」。

1. 先雙擊 `start.command`，被擋下後按「**完成**」
2. 打開「**系統設定**」→「**隱私權與安全性**」
3. 往下捲到「**安全性**」區塊，會看到一行「已封鎖使用 `start.command`」
4. 按旁邊的「**仍要打開**」
5. 用密碼或 Touch ID 確認，再按一次「**打開**」

之後就可以正常雙擊了，不用再重複。

### 或者：用終端機一行解決

比較快，但要開終端機：

```bash
cd ~/Downloads/gemini-live-caption-main    # 換成你放的位置
xattr -d com.apple.quarantine start.command start.sh
```

這行的意思是「拿掉『從網路下載』的標記」。做完之後雙擊就正常了。

### 或者：完全跳過 Gatekeeper

直接在終端機執行，不透過 Finder 打開就不會被擋：

```bash
cd ~/Downloads/gemini-live-caption-main
./start.sh
```

---

不論用哪種方式，第一次啟動會自動建立 `.venv` 並安裝套件，約 1-2 分鐘。完成後瀏覽器會自動開啟 `http://127.0.0.1:5090`。

> **那個終端機視窗要留著。** 它就是程式本身，關掉程式就結束了。縮到最小沒關係。

## 想讓它一直在背景跑

不希望終端機視窗佔著，或希望關掉終端機程式也不要停：

```bash
cd 你放這個工具的資料夾
nohup .venv/bin/python app.py > /tmp/live-caption.log 2>&1 &
```

要停掉：

```bash
kill $(lsof -ti :5090)
```

錯誤訊息會寫在 `/tmp/live-caption.log`。

## 遇到問題

### 網頁顯示「無法連上這個網站」

程式沒在跑。多半是終端機視窗被關掉了，重新啟動即可。

### 麥克風沒有聲音

第一次使用時，瀏覽器會跳出麥克風權限詢問，要允許。如果不小心按了拒絕，到「系統設定 → 隱私權與安全性 → 麥克風」把瀏覽器打開。

也記得在設定頁按一次「測試聲音」，確認音量條會跳。

---

裝好之後怎麼用，回到 [README](../README.md#怎麼用)。
