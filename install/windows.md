# Windows 安裝說明

## ⚠️ 先看這一段，可以省下最多時間

**一定要裝 [python.org](https://www.python.org/downloads/) 的官方版 Python。**

不要用在命令列打 `python` 時跳出來的 **Microsoft Store 版**——那個版本缺少建立虛擬環境需要的元件（`ensurepip`），本工具會裝不起來。這是實測中最常見的失敗原因（Store 版 Python 3.14 就會卡住）。

想確認自己裝的是哪一種，開命令提示字元執行：

```
where python
```

路徑裡如果出現 `WindowsApps`，那就是 Store 版，請改裝官方版。

### 安裝官方版

到 [python.org/downloads](https://www.python.org/downloads/) 下載，安裝時**勾選 Add Python to PATH**。

或用一行指令：

```
winget install -e --id Python.Python.3.12
```

裝完**關掉命令提示字元再重開**，然後確認：

```
py -3.12 --version
```

## 安裝步驟

1. 到 [Repository 首頁](https://github.com/miami1124/gemini-live-caption) 按 **Code → Download ZIP**
2. 解壓縮，會得到 `gemini-live-caption-main` 資料夾
3. 打開資料夾，**雙擊 `start.bat`**

### 如果 Windows 跳出安全性警告

可能會看到「**Windows 已保護您的電腦**」（SmartScreen）或「**您要執行這個檔案嗎？**」。

那句話的意思不是「我檢查過，這東西有問題」，而是「**這個檔案沒有付費的程式碼簽章，我沒得驗證**」。免費的開源工具通常不會買簽章憑證。

要繼續的話按「**其他資訊**」→「**仍要執行**」。

**但在放行之前，建議你先自己確認一下。** 這個工具原始碼完全公開，最快的驗證方式是把連結丟給你的 AI：

```text
請幫我檢查這個開源專案有沒有安全疑慮：
https://github.com/miami1124/gemini-live-caption
我想知道它會不會偷傳我的資料、會不會動到系統設定或刪我的檔案。
```

> 這個工具實際上只會在專案資料夾裡建一個 `.venv`（放 Python 套件），以及在系統暫存區放 PDF 轉出來的圖。不改系統設定、不裝全域套件，解除安裝就是把資料夾刪掉。

第一次會自動建立 `.venv` 並安裝套件，約 1-2 分鐘。完成後瀏覽器會自動開啟 `http://127.0.0.1:5090`。

> **那個黑色視窗要留著。** 它就是程式本身，關掉程式就結束了。縮到最小沒關係。

## 遇到問題

### 雙擊 `start.bat` 沒有任何反應

先確認你下載的是**最新版**（舊版本有換行格式的問題，已於 2026-07-29 修正）。

如果還是不行，在資料夾空白處**按住 Shift + 滑鼠右鍵 →「在終端機中開啟」**，然後執行：

```
py -3.12 scripts\launcher.py
```

這樣視窗不會關掉，錯誤訊息看得到。

### 出現 `ensurepip is not available` 或建立環境失敗

就是上面說的 Store 版 Python 問題。改裝官方版後，**把資料夾裡的 `.venv` 整個刪掉**再重試：

```
rmdir /s /q .venv
py -3.12 scripts\launcher.py
```

> `.venv` 是自動產生的，刪掉可以安全重建。

### 出現「找不到指定的檔案」

多半是**在錯誤的資料夾下指令**。指令必須在有 `app.py` 和 `start.bat` 的那層執行。

最快的方法：在檔案總管打開專案資料夾，點上方的**地址列**，輸入 `cmd` 按 Enter，命令提示字元就會直接開在正確位置。用 `dir` 確認看得到 `app.py`。

### 網頁顯示 `ERR_CONNECTION_REFUSED`

程式沒在跑。多半是那個黑色視窗被關掉了，重新啟動即可。

---

裝好之後怎麼用，回到 [README](../README.md#怎麼用)。
