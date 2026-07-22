"""把 16 kHz mono PCM 灌進本機 WebSocket，驗證真實字幕輸出。"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

import websockets


async def run_test(pcm_path: str, language: str, port: int) -> int:
    pcm = Path(pcm_path).read_bytes()
    chunk_size = 16000 // 10 * 2
    input_parts: list[str] = []
    output_parts: list[str] = []
    ready = asyncio.Event()

    async with websockets.connect(f"ws://127.0.0.1:{port}/ws?lang={language}", max_size=None) as websocket:
        async def feed() -> None:
            await asyncio.wait_for(ready.wait(), timeout=10)
            for index in range(0, len(pcm), chunk_size):
                await websocket.send(pcm[index:index + chunk_size])
                await asyncio.sleep(0.1)
            await asyncio.sleep(4)

        async def receive() -> None:
            async for raw in websocket:
                message = json.loads(raw)
                if message.get("type") == "status" and message.get("state") == "ready":
                    ready.set()
                elif message.get("type") == "input":
                    input_parts.append(message.get("text", ""))
                elif message.get("type") == "output":
                    output_parts.append(message.get("text", ""))
                elif message.get("type") == "error":
                    raise RuntimeError(message.get("message", "Gemini error"))

        receiver = asyncio.create_task(receive())
        await feed()
        receiver.cancel()
        await asyncio.gather(receiver, return_exceptions=True)

    source = "".join(input_parts).strip()
    translation = "".join(output_parts).strip()
    print(f"[{language}] 中文辨識：{source}")
    print(f"[{language}] 翻譯字幕：{translation}")
    return 0 if source and translation else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pcm")
    parser.add_argument("--language", choices=("en", "ja", "ko"), default="en")
    parser.add_argument("--port", type=int, default=5090)
    args = parser.parse_args()
    return asyncio.run(asyncio.wait_for(run_test(args.pcm, args.language, args.port), timeout=60))


if __name__ == "__main__":
    raise SystemExit(main())
