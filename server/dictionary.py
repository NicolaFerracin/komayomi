"""Local Japanese tokenization and dictionary lookup."""

from __future__ import annotations

import re
import sqlite3
from functools import lru_cache

import fugashi
import jamdict_data

_tagger = fugashi.Tagger()
_kanji_pattern = re.compile(r"[\u3400-\u9fff]")


def connection() -> sqlite3.Connection:
    db = sqlite3.connect(f"file:{jamdict_data.JAMDICT_DB_PATH}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    return db


def tokenize(text: str) -> list[dict]:
    result = []
    for token in _tagger(text):
        feature = token.feature
        result.append({
            "surface": token.surface,
            "lemma": feature.lemma if feature.lemma != "*" else token.surface,
            "reading": feature.kana if feature.kana != "*" else None,
            "part_of_speech": feature.pos1,
            "detail": feature.pos2 if feature.pos2 != "*" else None,
            "inflection": feature.cForm if feature.cForm != "*" else None,
        })
    return result


def entry_ids(db: sqlite3.Connection, term: str) -> list[int]:
    rows = db.execute(
        "SELECT idseq FROM Kanji WHERE text = ? UNION SELECT idseq FROM Kana WHERE text = ? LIMIT 16",
        (term, term),
    ).fetchall()
    return [row[0] for row in rows]


def entry(db: sqlite3.Connection, idseq: int, matched_by: str) -> dict:
    writings = [row[0] for row in db.execute("SELECT text FROM Kanji WHERE idseq = ?", (idseq,))]
    readings = [row[0] for row in db.execute("SELECT text FROM Kana WHERE idseq = ?", (idseq,))]
    senses = []
    for sense in db.execute("SELECT id FROM Sense WHERE idseq = ?", (idseq,)):
        glosses = [row[0] for row in db.execute(
            "SELECT text FROM SenseGloss WHERE sid = ? AND (lang = 'eng' OR lang IS NULL)", (sense[0],)
        )]
        if not glosses:
            continue
        senses.append({
            "glosses": glosses,
            "parts_of_speech": [row[0] for row in db.execute("SELECT text FROM pos WHERE sid = ?", (sense[0],))],
            "misc": [row[0] for row in db.execute("SELECT text FROM misc WHERE sid = ?", (sense[0],))],
        })
    return {"id": idseq, "writings": writings, "readings": readings, "senses": senses, "matched_by": matched_by}


def kanji_details(db: sqlite3.Connection, literal: str) -> dict | None:
    char = db.execute("SELECT * FROM character WHERE literal = ?", (literal,)).fetchone()
    if not char:
        return None
    groups = [row[0] for row in db.execute("SELECT id FROM rm_group WHERE cid = ?", (char["ID"],))]
    readings: dict[str, list[str]] = {"on": [], "kun": []}
    meanings: list[str] = []
    for group in groups:
        for row in db.execute("SELECT r_type, value FROM reading WHERE gid = ?", (group,)):
            if row[0] == "ja_on": readings["on"].append(row[1])
            elif row[0] == "ja_kun": readings["kun"].append(row[1])
        meanings.extend(row[0] for row in db.execute(
            "SELECT value FROM meaning WHERE gid = ? AND (m_lang = '' OR m_lang IS NULL)", (group,)
        ))
    return {
        "literal": literal, "strokes": char["stroke_count"], "grade": char["grade"],
        "frequency": char["freq"], "jlpt": char["jlpt"], "readings": readings,
        "meanings": meanings,
    }


@lru_cache(maxsize=1024)
def lookup(query: str) -> dict:
    query = query.strip()
    if not query or len(query) > 100:
        return {"query": query, "tokens": [], "entries": [], "kanji": []}
    tokens = tokenize(query)
    # Contextual lemmas from the tokenizer are more useful than an unranked
    # list of homophones for kana-only text (e.g. こと -> 事, not 琴/古都).
    contextual = []
    surfaces = []
    for token in tokens:
        if token["part_of_speech"] not in {"助詞", "助動詞", "補助記号", "空白"}:
            contextual.append(token["lemma"])
            surfaces.append(token["surface"])
    candidates = contextual + [query] + surfaces
    candidates = list(dict.fromkeys(candidate for candidate in candidates if candidate))
    results = []
    seen: set[int] = set()
    with connection() as db:
        for candidate in candidates:
            for idseq in entry_ids(db, candidate):
                if idseq in seen:
                    continue
                seen.add(idseq)
                results.append(entry(db, idseq, candidate))
                if len(results) >= 8:
                    break
            if len(results) >= 8:
                break
        kanji = [detail for char in dict.fromkeys(_kanji_pattern.findall(query))
                 if (detail := kanji_details(db, char))]
    return {"query": query, "tokens": tokens, "entries": results, "kanji": kanji}
