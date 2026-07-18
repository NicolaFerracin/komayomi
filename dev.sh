#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"

trap 'kill 0' INT TERM EXIT
"$ROOT/.venv/bin/uvicorn" server.app:app --reload --host 127.0.0.1 --port 8000 &
npm run dev -- --host 127.0.0.1 &
wait
