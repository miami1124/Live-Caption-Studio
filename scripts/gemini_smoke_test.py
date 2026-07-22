"""以目前環境變數的 API key 驗證 Gemini Live Translate 握手。"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import websockets  # noqa: E402

from app import _gemini_ws_url, _ssl_context, build_setup  # noqa: E402


async def test_language(api_key: str, language: str) -> bool:
    async with websockets.connect(_gemini_ws_url(api_key), ssl=_ssl_context) as websocket:
        await websocket.send(json.dumps(build_setup(language)))
        for _attempt in range(10):
            response = json.loads(await asyncio.wait_for(websocket.recv(), timeout=10))
            if response.get("setupComplete") is not None:
                print(f"{language}: Gemini Live Translate 握手成功。")
                return True
    return False


async def main() -> int:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("略過：目前環境沒有 GEMINI_API_KEY。")
        return 0

    results = [await test_language(api_key, language) for language in ("en", "ja", "ko")]
    if all(results):
        return 0
    print("至少一種字幕語言沒有回傳 setupComplete。")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
