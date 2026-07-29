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
3. 在 `start.command` 上**按滑鼠右鍵 →「打開」**

> ⚠️ **第一次一定要用右鍵開啟，不要直接雙擊。**
> macOS 的 Gatekeeper 會擋下從網路下載的執行檔，直接雙擊會跳出「無法打開，因為它來自未識別的開發者」。
> 用右鍵 →「打開」，系統才會給你「仍要打開」的選項。之後就可以正常雙擊了。

第一次會自動建立 `.venv` 並安裝套件，約 1-2 分鐘。完成後瀏覽器會自動開啟 `http://127.0.0.1:5090`。

> **那個終端機視窗要留著。** 它就是程式本身，關掉程式就結束了。縮到最小沒關係。

### 如果右鍵開啟還是被擋

在終端機執行：

```bash
cd 你放這個工具的資料夾
chmod +x start.command start.sh
./start.command
```

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
