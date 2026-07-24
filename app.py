"""Gemini 即時翻譯字幕公開版。

所有服務只綁定 127.0.0.1：PDF 留在本機暫存目錄，麥克風音訊則由本機
WebSocket 轉送到 Gemini Live Translate。使用者可從 .env 或啟動畫面提供
自己的 API key；畫面輸入的 key 只保留在本次 Python 程序記憶體。
"""

from __future__ import annotations

import asyncio
import atexit
import base64
import json
import os
import shutil
import ssl
import tempfile
import threading
import uuid
from pathlib import Path
from urllib.parse import urlencode

import certifi
import pypdfium2 as pdfium
import websockets
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_file
from flask_sock import Sock


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024
app.config["TRUSTED_HOSTS"] = ["127.0.0.1", "localhost"]
sock = Sock(app)

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-live-translate-preview")
PORT = int(os.getenv("PORT", "5090"))
ALLOWED_ORIGINS = {
    f"http://127.0.0.1:{PORT}",
    f"http://localhost:{PORT}",
}
SUPPORTED_LANGUAGES = {
    "en": "English",
    "ja": "日本語",
    "ko": "한국어",
}

_ssl_context = ssl.create_default_context(cafile=certifi.where())
_session_api_key = ""
_key_lock = threading.Lock()

_temp_root = Path(tempfile.mkdtemp(prefix="gemini-live-caption-"))
_deck_lock = threading.Lock()
_deck: dict[str, object] = {}


def _cleanup_temp() -> None:
    shutil.rmtree(_temp_root, ignore_errors=True)


atexit.register(_cleanup_temp)


def _get_api_key() -> tuple[str, str]:
    with _key_lock:
        if _session_api_key:
            return _session_api_key, "session"
    env_key = os.getenv("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key, "environment"
    return "", "missing"


def _origin_is_allowed() -> bool:
    """阻擋網頁從其他來源偷連使用者的 localhost 服務。"""
    origin = request.headers.get("Origin", "").rstrip("/")
    return not origin or origin in ALLOWED_ORIGINS


def build_setup(target_language: str) -> dict[str, object]:
    """建立 Gemini Live Translate 官方目前使用的 setup payload。"""
    language = target_language if target_language in SUPPORTED_LANGUAGES else "en"
    return {
        "setup": {
            "model": f"models/{MODEL}",
            # 2026-07-22 實測 v1beta：這兩個欄位仍需放在 setup 根層。
            # Google Live Translate 指南目前顯示於 generationConfig，但實際端點會回 1007。
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "translationConfig": {
                    "targetLanguageCode": language,
                    "echoTargetLanguage": True,
                },
            },
        }
    }


def _gemini_ws_url(api_key: str) -> str:
    query = urlencode({"key": api_key})
    return (
        "wss://generativelanguage.googleapis.com/ws/"
        "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
        f"?{query}"
    )


def _friendly_gemini_error(error: Exception) -> tuple[str, str]:
    raw = str(error)
    lowered = raw.lower()
    if "429" in raw or "quota" in lowered or "resource_exhausted" in lowered:
        return "quota_exhausted", "Gemini 額度或速率限制已用完，請稍後再試或檢查 Google AI Studio。"
    if "401" in raw or "403" in raw or "api key" in lowered or "permission_denied" in lowered:
        return "invalid_api_key", "Gemini API key 無效、被限制或沒有權限，請重新檢查。"
    if "1008" in raw or "model" in lowered and "not found" in lowered:
        return "model_unavailable", "Gemini 翻譯模型目前無法使用，可能已更新或暫時下線。"
    return "connection_failed", "無法連線到 Gemini，請檢查網路後再試。"


async def _send_browser(browser_ws, payload: dict[str, object]) -> None:
    await asyncio.to_thread(browser_ws.send, json.dumps(payload, ensure_ascii=False))


async def _uplink(browser_ws, gemini_ws) -> None:
    while True:
        try:
            message = await asyncio.to_thread(browser_ws.receive)
        except Exception:
            return
        if message is None:
            return
        if isinstance(message, (bytes, bytearray)):
            audio = base64.b64encode(message).decode("ascii")
            await gemini_ws.send(
                json.dumps(
                    {
                        "realtimeInput": {
                            "audio": {
                                "data": audio,
                                "mimeType": "audio/pcm;rate=16000",
                            }
                        }
                    }
                )
            )


async def _downlink(browser_ws, gemini_ws) -> None:
    async for raw in gemini_ws:
        try:
            message = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            continue

        if message.get("setupComplete") is not None:
            await _send_browser(browser_ws, {"type": "status", "state": "ready"})

        server_content = message.get("serverContent") or {}
        input_text = (server_content.get("inputTranscription") or {}).get("text")
        output_text = (server_content.get("outputTranscription") or {}).get("text")

        if input_text:
            await _send_browser(browser_ws, {"type": "input", "text": input_text})
        if output_text:
            await _send_browser(browser_ws, {"type": "output", "text": output_text})

        for part in (server_content.get("modelTurn") or {}).get("parts", []):
            if part.get("text"):
                await _send_browser(browser_ws, {"type": "output", "text": part["text"]})

        if server_content.get("turnComplete") or server_content.get("generationComplete"):
            await _send_browser(browser_ws, {"type": "turn_complete"})

        if message.get("goAway") is not None:
            await _send_browser(
                browser_ws,
                {"type": "status", "state": "reconnecting", "message": "Gemini 要求重新建立連線。"},
            )


async def _bridge(browser_ws, target_language: str) -> None:
    api_key, _source = _get_api_key()
    if not api_key:
        await _send_browser(
            browser_ws,
            {"type": "error", "code": "missing_api_key", "message": "請先設定自己的 Gemini API key。"},
        )
        return

    try:
        async with websockets.connect(
            _gemini_ws_url(api_key),
            max_size=None,
            ping_interval=20,
            ping_timeout=20,
            ssl=_ssl_context,
        ) as gemini_ws:
            await gemini_ws.send(json.dumps(build_setup(target_language)))
            await _send_browser(browser_ws, {"type": "status", "state": "connecting"})
            uplink = asyncio.create_task(_uplink(browser_ws, gemini_ws))
            downlink = asyncio.create_task(_downlink(browser_ws, gemini_ws))
            done, pending = await asyncio.wait(
                {uplink, downlink}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*done, *pending, return_exceptions=True)
    except Exception as error:  # WebSocket 套件的錯誤類型會隨版本變動
        code, message = _friendly_gemini_error(error)
        try:
            await _send_browser(browser_ws, {"type": "error", "code": code, "message": message})
        except Exception:
            pass


@app.get("/")
def index():
    return render_template("index.html")


@app.after_request
def add_security_headers(response):
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "connect-src 'self' ws://127.0.0.1:* ws://localhost:*; "
        "img-src 'self' data: blob:; style-src 'self'; script-src 'self'; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "microphone=(self)"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.before_request
def reject_cross_site_mutations():
    if (
        request.path.startswith("/api/")
        and request.method not in {"GET", "HEAD", "OPTIONS"}
        and not _origin_is_allowed()
    ):
        return jsonify({"ok": False, "message": "已拒絕其他網站連線到本機字幕工具。"}), 403


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "model": MODEL})


@app.get("/api/config")
def config():
    _key, source = _get_api_key()
    return jsonify(
        {
            "hasApiKey": source != "missing",
            "apiKeySource": source,
            "model": MODEL,
            "languages": SUPPORTED_LANGUAGES,
        }
    )


@app.post("/api/config/key")
def set_session_key():
    payload = request.get_json(silent=True) or {}
    key = str(payload.get("apiKey", "")).strip()
    if len(key) < 20 or len(key) > 512 or any(character.isspace() for character in key):
        return jsonify({"ok": False, "message": "API key 格式不正確，請重新貼上完整金鑰。"}), 400

    global _session_api_key
    with _key_lock:
        _session_api_key = key
    return jsonify({"ok": True, "source": "session"})


@app.delete("/api/config/key")
def clear_session_key():
    global _session_api_key
    with _key_lock:
        _session_api_key = ""
    _key, source = _get_api_key()
    return jsonify({"ok": True, "hasApiKey": source != "missing", "source": source})


def _reset_deck() -> None:
    old_dir = _deck.get("directory")
    if old_dir:
        shutil.rmtree(Path(str(old_dir)), ignore_errors=True)
    _deck.clear()


@app.post("/api/deck")
def upload_deck():
    uploaded = request.files.get("pdf")
    if uploaded is None or not uploaded.filename:
        return jsonify({"ok": False, "message": "請選擇 PDF 檔案。"}), 400

    first_bytes = uploaded.stream.read(5)
    uploaded.stream.seek(0)
    if first_bytes != b"%PDF-":
        return jsonify({"ok": False, "message": "這不是有效的 PDF 檔案。"}), 400

    deck_id = uuid.uuid4().hex
    deck_dir = _temp_root / deck_id
    deck_dir.mkdir(parents=True, exist_ok=False)
    pdf_path = deck_dir / "slides.pdf"
    uploaded.save(pdf_path)

    try:
        document = pdfium.PdfDocument(str(pdf_path))
        page_count = len(document)
        if page_count < 1:
            raise ValueError("PDF 沒有頁面")
        if page_count > 200:
            raise ValueError("PDF 超過 200 頁")

        sizes: list[dict[str, float]] = []
        for index in range(page_count):
            page = document[index]
            width, height = page.get_size()
            sizes.append({"width": round(width, 2), "height": round(height, 2)})
            page.close()
        document.close()
    except Exception as error:
        shutil.rmtree(deck_dir, ignore_errors=True)
        message = "無法讀取 PDF，請確認檔案未加密且沒有損毀。"
        if "200" in str(error):
            message = "PDF 最多支援 200 頁，請拆分後再試。"
        return jsonify({"ok": False, "message": message}), 400

    with _deck_lock:
        _reset_deck()
        _deck.update(
            {
                "id": deck_id,
                "directory": str(deck_dir),
                "path": str(pdf_path),
                "page_count": page_count,
                "filename": Path(uploaded.filename).name,
                "sizes": sizes,
            }
        )

    return jsonify(
        {
            "ok": True,
            "deckId": deck_id,
            "filename": Path(uploaded.filename).name,
            "pageCount": page_count,
            "sizes": sizes,
        }
    )


@app.get("/api/deck/<deck_id>/page/<int:page_number>.png")
def deck_page(deck_id: str, page_number: int):
    with _deck_lock:
        if deck_id != _deck.get("id"):
            return jsonify({"ok": False, "message": "這份 PDF 已失效，請重新上傳。"}), 404
        page_count = int(_deck.get("page_count", 0))
        if page_number < 1 or page_number > page_count:
            return jsonify({"ok": False, "message": "找不到這一頁。"}), 404

        deck_dir = Path(str(_deck["directory"]))
        image_path = deck_dir / f"page-{page_number:03d}.png"
        if not image_path.exists():
            document = pdfium.PdfDocument(str(_deck["path"]))
            page = document[page_number - 1]
            bitmap = page.render(scale=2.0)
            image = bitmap.to_pil()
            image.save(image_path, format="PNG", optimize=True)
            image.close()
            bitmap.close()
            page.close()
            document.close()

    return send_file(image_path, mimetype="image/png", conditional=True, max_age=3600)


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"ok": False, "message": "PDF 不可超過 50 MB。"}), 413


@sock.route("/ws")
def websocket_handler(browser_ws):
    if not _origin_is_allowed():
        try:
            browser_ws.close()
        except Exception:
            pass
        return
    language = request.args.get("lang", "en")
    if language not in SUPPORTED_LANGUAGES:
        language = "en"
    try:
        asyncio.run(_bridge(browser_ws, language))
    finally:
        try:
            browser_ws.close()
        except Exception:
            pass


if __name__ == "__main__":
    print(f"\n  Gemini 即時翻譯字幕已啟動：http://127.0.0.1:{PORT}\n")
    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False, threaded=True)
