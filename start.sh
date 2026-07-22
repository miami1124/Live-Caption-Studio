#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/launcher.py
elif command -v python >/dev/null 2>&1; then
  exec python scripts/launcher.py
else
  echo "找不到 Python。請先安裝 Python 3.10 以上版本：https://www.python.org/downloads/"
  exit 1
fi
