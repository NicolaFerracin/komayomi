from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from .db import get_volume, get_volumes, save_volume
from .models import Volume

ROOT = Path(__file__).resolve().parents[1]
MOKURO = ROOT / ".venv" / "bin" / "mokuro"
ACTIVE_TASKS: dict[str, asyncio.Task[None]] = {}


def output_path(source: Path) -> Path:
    return source.parent / f"{source.name}.mokuro"


def cache_path(source: Path) -> Path:
    return source.parent / "_ocr" / source.name


async def process_volume(volume: Volume) -> None:
    source = Path(volume.source_path)
    result = output_path(source)
    if result.exists():
        try:
            payload = json.loads(result.read_text(encoding="utf-8"))
            volume.status = "ready"; volume.error = None
            volume.processed_pages = len(payload["pages"]); volume.page_count = len(payload["pages"])
            save_volume(volume); return
        except (OSError, json.JSONDecodeError, KeyError, TypeError):
            pass
    volume.status = "processing"
    volume.error = None
    save_volume(volume)

    process: asyncio.subprocess.Process | None = None
    log: list[str] = []
    try:
        if not source.is_dir(): raise FileNotFoundError(f"Source directory no longer exists: {source}")
        if not MOKURO.exists(): raise FileNotFoundError(f"Mokuro executable not found: {MOKURO}")
        process = await asyncio.create_subprocess_exec(
            str(MOKURO), str(source), "--disable_confirmation", "--legacy_html=False",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
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
            if process.returncode is None: await asyncio.sleep(0.15)
        await process.wait()
        if process.returncode == 0 and result.exists():
            payload = json.loads(result.read_text(encoding="utf-8"))
            volume.status = "ready"; volume.error = None
            volume.processed_pages = len(payload["pages"]); volume.page_count = len(payload["pages"])
        else:
            volume.status = "error"
            volume.error = "".join(log)[-2000:] or "Mokuro did not produce an output file."
    except asyncio.CancelledError:
        if process and process.returncode is None:
            process.terminate()
            try: await asyncio.wait_for(process.wait(), timeout=3)
            except asyncio.TimeoutError: process.kill(); await process.wait()
        volume.status = "queued"; volume.error = None
        save_volume(volume)
        raise
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        volume.status = "error"
        volume.error = str(error)
    save_volume(volume)


def start_volume(volume: Volume) -> bool:
    current = ACTIVE_TASKS.get(volume.id)
    if current and not current.done(): return False
    task = asyncio.create_task(process_volume(volume), name=f"mokuro-{volume.id}")
    ACTIVE_TASKS[volume.id] = task
    task.add_done_callback(lambda finished, volume_id=volume.id: ACTIVE_TASKS.pop(volume_id, None) if ACTIVE_TASKS.get(volume_id) is finished else None)
    return True


def recover_interrupted() -> int:
    recovered = 0
    for volume in get_volumes():
        if volume.status in {"queued", "processing"}:
            volume.status = "queued"; volume.error = None; save_volume(volume)
            recovered += int(start_volume(volume))
    return recovered


async def stop_all() -> None:
    tasks = list(ACTIVE_TASKS.values())
    for task in tasks: task.cancel()
    if tasks: await asyncio.gather(*tasks, return_exceptions=True)


async def pause_volume(volume_id: str) -> bool:
    task = ACTIVE_TASKS.get(volume_id)
    if task and not task.done():
        task.cancel(); await asyncio.gather(task, return_exceptions=True)
    volume = get_volume(volume_id)
    if not volume or volume.status == "ready": return False
    volume.status = "paused"; volume.error = None; save_volume(volume)
    return True
