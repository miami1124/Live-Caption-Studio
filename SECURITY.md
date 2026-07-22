# Security

## API key

- 不要把 Gemini API key 寫進程式碼、Issue、截圖或 commit。
- 若使用 `.env`，此檔案已由 `.gitignore` 排除。
- 從啟動畫面輸入的 key 只保留在本次 Python 程序記憶體，關閉程式後即清除。
- 如果懷疑 key 外洩，請先建立並驗證新 key，再停用舊 key，並檢查 Google AI Studio 的使用紀錄。

## 回報弱點

請不要在公開 Issue 提供可直接利用的弱點細節或任何有效憑證。可先透過 GitHub 私人安全回報聯絡維護者。

## 資料流

- PDF 上傳目標是 `127.0.0.1` 的本機 Flask 程式，只存在作業系統暫存目錄，關閉程式後清除。
- 麥克風音訊會由本機程式即時轉送至 Google Gemini API。
- 本工具不主動保存音訊、逐字稿或翻譯字幕。
