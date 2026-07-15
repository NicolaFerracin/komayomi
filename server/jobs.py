from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from .db import save_volume
from .models import Volume

ROOT = Path(__file__).resolve().parents[1]
MOKURO = ROOT / ".venv" / "bin" / "mokuro"


def output_path(source: Path) -> Path:
    return source.parent / f"{source.name}.mokuro"


def cache_path(source: Path) -> Path:
    return source.parent / "_ocr" / source.name


async def process_volume(volume: Volume) -> None:
    source = Path(volume.source_path)
    volume.status = "processing"
    volume.error = None
    save_volume(volume)

    process = await asyncio.create_subprocess_exec(
        str(MOKURO),
        str(source),
        "--disable_confirmation",
        "--legacy_html=False",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    log: list[str] = []
    while process.returncode is None:
        try:
            line = await asyncio.wait_for(process.stdout.readline(), timeout=1)
            if line:
                log.append(re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", line.decode(errors="replace")))
                log = log[-30:]
        except asyncio.TimeoutError:
            pass
        volume.processed_pages = len(list(cache_path(source).glob("*.json")))
        save_volume(volume)
        if process.returncode is None:
            await asyncio.sleep(0.15)

    await process.wait()
    result = output_path(source)
    if process.returncode == 0 and result.exists():
        payload = json.loads(result.read_text(encoding="utf-8"))
        volume.status = "ready"
        volume.processed_pages = len(payload["pages"])
        volume.page_count = len(payload["pages"])
    else:
        volume.status = "error"
        volume.error = "".join(log)[-2000:] or "Mokuro did not produce an output file."
    save_volume(volume)
