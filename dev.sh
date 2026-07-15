#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"

trap 'kill 0' INT TERM EXIT
"$ROOT/.venv/bin/uvicorn" server.app:app --reload --port 8000 &
npm run dev &
wait
