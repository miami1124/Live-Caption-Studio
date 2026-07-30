# Linux 安裝說明

## 需要什麼

Python 3.10 以上，以及 `venv` 模組。

```bash
python3 --version
```

Debian / Ubuntu 如果缺 venv：

```bash
sudo apt install python3-venv
```

## 安裝步驟

```bash
git clone https://github.com/miami1124/Live-Caption-Studio.git
cd Live-Caption-Studio
chmod +x start.sh
./start.sh
```

或到 [Repository 首頁](https://github.com/miami1124/Live-Caption-Studio) 按 **Code → Download ZIP** 解壓縮後同樣執行 `./start.sh`。

第一次會自動建立 `.venv` 並安裝套件，約 1-2 分鐘。完成後瀏覽器會開啟 `http://127.0.0.1:5090`。

> **啟動用的終端機視窗要留著。** 它就是程式本身，關掉程式就結束了。

## 想讓它一直在背景跑

```bash
cd 你放這個工具的資料夾
nohup .venv/bin/python app.py > /tmp/live-caption.log 2>&1 &
```

要停掉：

```bash
kill $(lsof -ti :5090)
```

## 遇到問題

### 瀏覽器沒有自動開啟

某些桌面環境的 `webbrowser` 模組叫不動瀏覽器，手動打開 `http://127.0.0.1:5090` 即可。

### 麥克風抓不到

字幕功能需要瀏覽器拿得到麥克風權限。請用 Chrome 或 Chromium 系列，並確認系統的音訊輸入裝置正常（`pactl list sources short` 可以列出）。

### 網頁顯示連線被拒

程式沒在跑，重新執行 `./start.sh`。

---

裝好之後怎麼用，回到 [README](../README.md#怎麼用)。
