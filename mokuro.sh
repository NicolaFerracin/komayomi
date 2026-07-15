#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ "$#" -eq 0 ]; then
  echo "Usage: ./mokuro.sh /path/to/volume [more volumes...]" >&2
  echo "       ./mokuro.sh --parent_dir /path/to/series" >&2
  exit 2
fi

exec "$ROOT/.venv/bin/mokuro" "$@"

