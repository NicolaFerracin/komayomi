from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .models import Volume

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "komayomi.db"


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    try:
        yield db
        db.commit()
    finally:
        db.close()


def initialize() -> None:
    with connection() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS volumes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                series TEXT NOT NULL,
                source_path TEXT NOT NULL,
                status TEXT NOT NULL,
                page_count INTEGER NOT NULL DEFAULT 0,
                processed_pages INTEGER NOT NULL DEFAULT 0,
                cover_filename TEXT,
                current_page INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS corrections (
                volume_id TEXT NOT NULL,
                page_index INTEGER NOT NULL,
                block_index INTEGER NOT NULL,
                line_index INTEGER NOT NULL,
                raw_text TEXT NOT NULL,
                canonical_text TEXT NOT NULL,
                ruby_json TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL,
                PRIMARY KEY (volume_id, page_index, block_index, line_index)
            );
            CREATE TABLE IF NOT EXISTS lens_analyses (
                volume_id TEXT NOT NULL, page_index INTEGER NOT NULL,
                cache_key TEXT NOT NULL, result_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (volume_id, page_index, cache_key)
            );
            CREATE TABLE IF NOT EXISTS saved_items (
                id TEXT PRIMARY KEY, volume_id TEXT, page_index INTEGER,
                text TEXT NOT NULL, reading TEXT, meaning TEXT,
                context TEXT, notes TEXT, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS page_overrides (
                volume_id TEXT NOT NULL, page_index INTEGER NOT NULL,
                blocks_json TEXT NOT NULL, updated_at TEXT NOT NULL,
                PRIMARY KEY (volume_id, page_index)
            );
            CREATE TABLE IF NOT EXISTS block_geometry (
                volume_id TEXT NOT NULL, page_index INTEGER NOT NULL,
                block_index INTEGER NOT NULL, box_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (volume_id, page_index, block_index)
            );
            """
        )


def _volume(row: sqlite3.Row) -> Volume:
    return Volume(**dict(row))


def get_volumes() -> list[Volume]:
    with connection() as db:
        rows = db.execute("SELECT * FROM volumes ORDER BY created_at DESC").fetchall()
    return [_volume(row) for row in rows]


def get_volume(volume_id: str) -> Volume | None:
    with connection() as db:
        row = db.execute("SELECT * FROM volumes WHERE id = ?", (volume_id,)).fetchone()
    return _volume(row) if row else None


def save_volume(volume: Volume) -> None:
    fields = tuple(volume.__dataclass_fields__)
    placeholders = ",".join("?" for _ in fields)
    updates = ",".join(f"{field}=excluded.{field}" for field in fields if field != "id")
    with connection() as db:
        db.execute(
            f"INSERT INTO volumes ({','.join(fields)}) VALUES ({placeholders}) "
            f"ON CONFLICT(id) DO UPDATE SET {updates}",
            [getattr(volume, field) for field in fields],
        )


def save_position(volume_id: str, page: int) -> None:
    with connection() as db:
        db.execute("UPDATE volumes SET current_page = ? WHERE id = ?", (page, volume_id))


def corrections_for(volume_id: str) -> dict[tuple[int, int, int], dict]:
    with connection() as db:
        rows = db.execute(
            "SELECT * FROM corrections WHERE volume_id = ?", (volume_id,)
        ).fetchall()
    return {
        (row["page_index"], row["block_index"], row["line_index"]): {
            "raw_text": row["raw_text"],
            "canonical_text": row["canonical_text"],
            "ruby": json.loads(row["ruby_json"]),
        }
        for row in rows
    }


def save_correction(
    volume_id: str,
    page_index: int,
    block_index: int,
    line_index: int,
    raw_text: str,
    canonical_text: str,
    ruby: list[dict],
    updated_at: str,
) -> None:
    with connection() as db:
        db.execute(
            """
            INSERT INTO corrections VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(volume_id, page_index, block_index, line_index)
            DO UPDATE SET canonical_text=excluded.canonical_text,
                          ruby_json=excluded.ruby_json,
                          updated_at=excluded.updated_at
            """,
            (volume_id, page_index, block_index, line_index, raw_text,
             canonical_text, json.dumps(ruby, ensure_ascii=False), updated_at),
        )


def get_lens_analysis(volume_id: str, page_index: int, cache_key: str) -> dict | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT result_json FROM lens_analyses WHERE volume_id=? AND page_index=? AND cache_key=?",
            (volume_id, page_index, cache_key),
        ).fetchone()
    return json.loads(row["result_json"]) if row else None


def save_lens_analysis(volume_id: str, page_index: int, cache_key: str, result: dict, created_at: str) -> None:
    with connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO lens_analyses VALUES (?, ?, ?, ?, ?)",
            (volume_id, page_index, cache_key, json.dumps(result, ensure_ascii=False), created_at),
        )


def save_item(item: dict) -> None:
    with connection() as conn:
        conn.execute(
            "INSERT INTO saved_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (item["id"], item.get("volume_id"), item.get("page_index"), item["text"],
             item.get("reading"), item.get("meaning"), item.get("context"),
             item.get("notes"), item["created_at"]),
        )


def saved_items() -> list[dict]:
    with connection() as conn:
        rows = conn.execute("SELECT * FROM saved_items ORDER BY created_at DESC").fetchall()
    return [dict(row) for row in rows]


def delete_saved_item(item_id: str) -> bool:
    with connection() as conn:
        cursor = conn.execute("DELETE FROM saved_items WHERE id=?", (item_id,))
    return cursor.rowcount > 0


def page_overrides(volume_id: str) -> dict[int, list[dict]]:
    with connection() as conn:
        rows = conn.execute("SELECT page_index, blocks_json FROM page_overrides WHERE volume_id=?", (volume_id,)).fetchall()
    return {row["page_index"]: json.loads(row["blocks_json"]) for row in rows}


def save_page_override(volume_id: str, page_index: int, blocks: list[dict], updated_at: str) -> None:
    with connection() as conn:
        conn.execute("INSERT OR REPLACE INTO page_overrides VALUES (?, ?, ?, ?)",
                     (volume_id, page_index, json.dumps(blocks, ensure_ascii=False), updated_at))


def block_geometries(volume_id: str) -> dict[tuple[int, int], list[float]]:
    with connection() as conn:
        rows = conn.execute("SELECT page_index, block_index, box_json FROM block_geometry WHERE volume_id=?", (volume_id,)).fetchall()
    return {(row["page_index"], row["block_index"]): json.loads(row["box_json"]) for row in rows}


def save_block_geometry(volume_id: str, page_index: int, block_index: int, box: list[float], updated_at: str) -> None:
    with connection() as conn:
        conn.execute("INSERT OR REPLACE INTO block_geometry VALUES (?, ?, ?, ?, ?)",
                     (volume_id, page_index, block_index, json.dumps(box), updated_at))
