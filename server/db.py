from __future__ import annotations

import json
import shutil
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .models import Volume

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "komayomi.db"
SCHEMA_VERSION = 2
REQUIRED_TABLES = {"volumes", "corrections", "lens_analyses", "saved_items", "page_overrides", "block_geometry", "block_text_overrides", "grammar_explanations", "page_bookmarks", "page_reviews"}


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


def create_backup(target: Path) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as source, sqlite3.connect(target) as destination:
        source.backup(destination)


def validate_backup(path: Path) -> None:
    try:
        with sqlite3.connect(path) as candidate:
            if candidate.execute("PRAGMA integrity_check").fetchone()[0] != "ok": raise ValueError("SQLite integrity check failed")
            tables = {row[0] for row in candidate.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    except sqlite3.DatabaseError as error:
        raise ValueError("This is not a valid SQLite backup") from error
    missing = REQUIRED_TABLES - tables
    if missing: raise ValueError(f"Backup is missing required tables: {', '.join(sorted(missing))}")


def restore_backup(source: Path, safety_backup: Path) -> None:
    validate_backup(source)
    create_backup(safety_backup)
    staging = DATA_DIR / ".restore-staging.db"
    try:
        shutil.copy2(source, staging); validate_backup(staging); staging.replace(DB_PATH); initialize()
    finally:
        staging.unlink(missing_ok=True)


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
                context TEXT, notes TEXT, created_at TEXT NOT NULL,
                kind TEXT NOT NULL DEFAULT 'vocabulary'
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
            CREATE TABLE IF NOT EXISTS block_text_overrides (
                volume_id TEXT NOT NULL, page_index INTEGER NOT NULL,
                block_index INTEGER NOT NULL, lines_json TEXT NOT NULL,
                ruby_json TEXT NOT NULL, updated_at TEXT NOT NULL,
                PRIMARY KEY (volume_id, page_index, block_index)
            );
            CREATE TABLE IF NOT EXISTS grammar_explanations (
                id TEXT PRIMARY KEY, sentence TEXT NOT NULL, focus TEXT NOT NULL,
                question TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
                result_json TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS page_bookmarks (
                volume_id TEXT NOT NULL, page_index INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (volume_id, page_index)
            );
            CREATE TABLE IF NOT EXISTS page_reviews (
                volume_id TEXT NOT NULL, page_index INTEGER NOT NULL,
                reviewed_at TEXT NOT NULL,
                PRIMARY KEY (volume_id, page_index)
            );
            """
        )
        db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        db.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES (1)")
        columns = {row[1] for row in db.execute("PRAGMA table_info(saved_items)")}
        if "kind" not in columns: db.execute("ALTER TABLE saved_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'vocabulary'")
        db.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES (2)")


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


def get_volume_by_source(source_path: str) -> Volume | None:
    with connection() as db:
        row = db.execute("SELECT * FROM volumes WHERE source_path=? ORDER BY created_at LIMIT 1", (source_path,)).fetchone()
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


def bookmarks(volume_id: str) -> list[int]:
    with connection() as db:
        rows = db.execute("SELECT page_index FROM page_bookmarks WHERE volume_id=? ORDER BY page_index", (volume_id,)).fetchall()
    return [row["page_index"] for row in rows]


def save_bookmark(volume_id: str, page_index: int, created_at: str) -> None:
    with connection() as db:
        db.execute("INSERT OR REPLACE INTO page_bookmarks VALUES (?, ?, ?)", (volume_id, page_index, created_at))


def delete_bookmark(volume_id: str, page_index: int) -> None:
    with connection() as db:
        db.execute("DELETE FROM page_bookmarks WHERE volume_id=? AND page_index=?", (volume_id, page_index))


def reviewed_pages(volume_id: str) -> set[int]:
    with connection() as db:
        rows = db.execute("SELECT page_index FROM page_reviews WHERE volume_id=?", (volume_id,)).fetchall()
    return {row["page_index"] for row in rows}


def review_page(volume_id: str, page_index: int, reviewed_at: str) -> None:
    with connection() as db:
        db.execute("INSERT OR REPLACE INTO page_reviews VALUES (?, ?, ?)", (volume_id, page_index, reviewed_at))


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
            "INSERT INTO saved_items (id,volume_id,page_index,text,reading,meaning,context,notes,created_at,kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (item["id"], item.get("volume_id"), item.get("page_index"), item["text"],
             item.get("reading"), item.get("meaning"), item.get("context"),
             item.get("notes"), item["created_at"], item.get("kind", "vocabulary")),
        )


def matching_saved_item(text: str, volume_id: str | None, page_index: int | None, context: str | None, kind: str) -> dict | None:
    with connection() as conn:
        row = conn.execute("SELECT * FROM saved_items WHERE text=? AND volume_id IS ? AND page_index IS ? AND context IS ? AND kind=? ORDER BY created_at DESC LIMIT 1",
                           (text, volume_id, page_index, context, kind)).fetchone()
    return dict(row) if row else None


def saved_items() -> list[dict]:
    with connection() as conn:
        rows = conn.execute("SELECT * FROM saved_items ORDER BY created_at DESC").fetchall()
    return [dict(row) for row in rows]


def delete_saved_item(item_id: str) -> bool:
    with connection() as conn:
        cursor = conn.execute("DELETE FROM saved_items WHERE id=?", (item_id,))
    return cursor.rowcount > 0


def update_saved_item(item_id: str, updates: dict) -> dict | None:
    with connection() as conn:
        cursor = conn.execute("UPDATE saved_items SET reading=?, meaning=?, notes=? WHERE id=?",
                              (updates.get("reading"), updates.get("meaning"), updates.get("notes"), item_id))
        row = conn.execute("SELECT * FROM saved_items WHERE id=?", (item_id,)).fetchone()
    return dict(row) if cursor.rowcount and row else None


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


def block_text_overrides(volume_id: str) -> dict[tuple[int, int], dict]:
    with connection() as conn:
        rows = conn.execute("SELECT * FROM block_text_overrides WHERE volume_id=?", (volume_id,)).fetchall()
    return {(row["page_index"], row["block_index"]): {"lines": json.loads(row["lines_json"]), "ruby": json.loads(row["ruby_json"])} for row in rows}


def save_block_text(volume_id: str, page_index: int, block_index: int, lines: list[str], ruby: list[list[dict]], updated_at: str) -> None:
    with connection() as conn:
        conn.execute("INSERT OR REPLACE INTO block_text_overrides VALUES (?, ?, ?, ?, ?, ?)",
                     (volume_id, page_index, block_index, json.dumps(lines, ensure_ascii=False), json.dumps(ruby, ensure_ascii=False), updated_at))


def save_grammar_explanation(item: dict) -> None:
    with connection() as conn:
        conn.execute("INSERT INTO grammar_explanations VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                     (item["id"], item["sentence"], item["focus"], item.get("question"), item["provider"], item["model"], json.dumps(item["explanation"], ensure_ascii=False), item["created_at"]))


def grammar_explanations(sentence: str, focus: str) -> list[dict]:
    with connection() as conn:
        rows = conn.execute("SELECT * FROM grammar_explanations WHERE sentence=? AND focus=? ORDER BY created_at DESC", (sentence, focus)).fetchall()
    return [{**dict(row), "explanation": json.loads(row["result_json"])} for row in rows]


def grammar_explanations_for_sentences(sentences: list[str]) -> list[dict]:
    if not sentences: return []
    placeholders = ",".join("?" for _ in sentences)
    with connection() as conn:
        rows = conn.execute(f"SELECT * FROM grammar_explanations WHERE sentence IN ({placeholders}) ORDER BY created_at DESC", sentences).fetchall()
    return [{**dict(row), "explanation": json.loads(row["result_json"])} for row in rows]


def lens_history(volume_id: str, page_index: int) -> list[dict]:
    with connection() as conn:
        rows = conn.execute("SELECT cache_key, result_json, created_at FROM lens_analyses WHERE volume_id=? AND page_index=? ORDER BY created_at DESC", (volume_id, page_index)).fetchall()
    return [{"id": row["cache_key"], "created_at": row["created_at"], **json.loads(row["result_json"])} for row in rows]


def delete_ai_history(volume_id: str, page_index: int, kind: str, item_id: str, sentences: list[str]) -> bool:
    with connection() as conn:
        if kind == "selection":
            if not sentences: return False
            placeholders = ",".join("?" for _ in sentences)
            cursor = conn.execute(f"DELETE FROM grammar_explanations WHERE id=? AND sentence IN ({placeholders})", [item_id, *sentences])
        else:
            cursor = conn.execute("DELETE FROM lens_analyses WHERE volume_id=? AND page_index=? AND cache_key=?", (volume_id, page_index, item_id))
    return cursor.rowcount > 0
