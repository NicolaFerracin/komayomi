from __future__ import annotations

import asyncio
import hashlib
import io
import json
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

from . import db
from .jobs import output_path, process_volume
from .models import Volume
from .dictionary import lookup
from .llm import public_status, structured_text, structured_vision
from .grammar import analyze as analyze_grammar

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
UPLOAD_ROOT = db.DATA_DIR / "library"


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.initialize()
    yield


app = FastAPI(title="KomaYomi", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class LocalImport(BaseModel):
    path: str
    title: str | None = None
    series: str | None = None
    process: bool = True


class Position(BaseModel):
    page: int


class Correction(BaseModel):
    page_index: int
    block_index: int
    line_index: int
    raw_text: str
    canonical_text: str
    ruby: list[dict] = []


class VisionRequest(BaseModel):
    provider: str | None = None


class LensRequest(BaseModel):
    provider: str | None = None
    include_next: bool = False
    question: str | None = None


class SavedItem(BaseModel):
    text: str
    reading: str | None = None
    meaning: str | None = None
    volume_id: str | None = None
    page_index: int | None = None
    context: str | None = None
    notes: str | None = None


class PageOverride(BaseModel):
    blocks: list[dict]


class BlockGeometry(BaseModel):
    box: list[float]


class BlockText(BaseModel):
    lines: list[str]
    ruby: list[list[dict]]


class GrammarExplain(BaseModel):
    sentence: str
    focus: str | None = None
    question: str | None = None
    provider: str | None = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_volume(volume_id: str) -> Volume:
    volume = db.get_volume(volume_id)
    if not volume:
        raise HTTPException(404, "Volume not found")
    return volume


def image_files(source: Path) -> list[Path]:
    return sorted(path for path in source.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES)


def create_volume(source: Path, title: str, series: str) -> Volume:
    pages = image_files(source)
    if not pages:
        raise HTTPException(400, "The selected directory contains no supported page images.")
    generated = output_path(source)
    status = "ready" if generated.exists() else "queued"
    count = len(pages)
    volume = Volume(
        id=uuid.uuid4().hex,
        title=title,
        series=series,
        source_path=str(source),
        status=status,
        page_count=count,
        processed_pages=count if status == "ready" else 0,
        cover_filename=pages[0].name,
        current_page=0,
        error=None,
        created_at=now(),
    )
    db.save_volume(volume)
    return volume


def reader_payload(volume: Volume) -> dict:
    metadata = output_path(Path(volume.source_path))
    if not metadata.exists():
        raise HTTPException(409, "This volume has not finished processing.")
    return json.loads(metadata.read_text(encoding="utf-8"))


def page_image(volume: Volume, page: dict) -> tuple[bytes, str]:
    path = Path(volume.source_path) / Path(page["img_path"]).name
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return path.read_bytes(), mime


def transcript(page: dict) -> str:
    return "\n".join(
        f"Block {index + 1}: " + " / ".join(block.get("lines", []))
        for index, block in enumerate(page.get("blocks", []))
    )


def apply_saved_text(payload: dict, volume_id: str) -> None:
    """Hydrate raw Mokuro metadata with approved page layouts and line edits."""
    corrections = db.corrections_for(volume_id)
    overrides = db.page_overrides(volume_id)
    geometries = db.block_geometries(volume_id)
    text_overrides = db.block_text_overrides(volume_id)
    for page_index, page in enumerate(payload.get("pages", [])):
        if page_index in overrides:
            page["blocks"] = overrides[page_index]
        for block_index, block in enumerate(page.get("blocks", [])):
            if (page_index, block_index) in geometries:
                block["box"] = geometries[(page_index, block_index)]
            if (page_index, block_index) in text_overrides:
                block.update(text_overrides[(page_index, block_index)])
            for line_index in range(len(block.get("lines", []))):
                correction = corrections.get((page_index, block_index, line_index))
                if correction:
                    block["lines"][line_index] = correction["canonical_text"]
                    block.setdefault("ruby", [[] for _ in block["lines"]])[line_index] = correction["ruby"]


@app.get("/api/health")
def health():
    return {"status": "ok", "mokuro": True}


@app.get("/api/llm/status")
def llm_status():
    return public_status()


@app.get("/api/dictionary")
def dictionary_lookup(q: str):
    return lookup(q)


@app.get("/api/grammar")
def grammar_lookup(sentence: str, focus: str | None = None):
    return analyze_grammar(sentence, focus)


GRAMMAR_EXPLANATION_SCHEMA = {"type": "object", "additionalProperties": False, "properties": {
    "interpretation": {"type": "string"}, "breakdown": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {"part": {"type": "string"}, "role": {"type": "string"}}, "required": ["part", "role"]}}, "uncertainty": {"type": "string"},
}, "required": ["interpretation", "breakdown", "uncertainty"]}


@app.post("/api/grammar/explain")
async def explain_grammar(payload: GrammarExplain):
    prompt = f"""Explain the focused Japanese expression as it functions in this exact manga sentence. Do not replace kana with inferred kanji. Separate literal structure from natural meaning, mention ambiguity honestly, and be concise.
SENTENCE: {payload.sentence}
FOCUS: {payload.focus or payload.sentence}"""
    if payload.question:
        prompt += f"\nREADER REQUEST: {payload.question}"
    try: result, provider = await structured_text(payload.provider, prompt, GRAMMAR_EXPLANATION_SCHEMA)
    except (ValueError, httpx.HTTPError, json.JSONDecodeError) as error: raise HTTPException(503, str(error))
    return {"explanation": result, "provider": provider.id, "model": provider.model}


@app.get("/api/volumes")
def volumes():
    return [volume.json() for volume in db.get_volumes()]


@app.post("/api/volumes/import-local")
async def import_local(payload: LocalImport):
    source = Path(payload.path).expanduser().resolve()
    if not source.is_dir():
        raise HTTPException(400, "Path must be an existing directory.")
    volume = create_volume(source, payload.title or source.name, payload.series or source.parent.name)
    if volume.status != "ready" and payload.process:
        asyncio.create_task(process_volume(volume))
    return volume.json()


@app.post("/api/volumes/upload")
async def upload_volume(
    title: Annotated[str, Form()],
    series: Annotated[str, Form()],
    files: Annotated[list[UploadFile], File()],
):
    volume_id = uuid.uuid4().hex
    source = UPLOAD_ROOT / volume_id / title
    source.mkdir(parents=True, exist_ok=True)
    for upload in files:
        name = Path(upload.filename or "page.jpg").name
        suffix = Path(name).suffix.lower()
        if suffix not in IMAGE_SUFFIXES:
            continue
        with (source / name).open("wb") as target:
            shutil.copyfileobj(upload.file, target)
    volume = create_volume(source, title, series)
    asyncio.create_task(process_volume(volume))
    return volume.json()


@app.post("/api/volumes/{volume_id}/process")
async def start_processing(volume_id: str):
    volume = require_volume(volume_id)
    if volume.status == "processing":
        return volume.json()
    asyncio.create_task(process_volume(volume))
    return volume.json()


@app.get("/api/volumes/{volume_id}/reader")
def reader(volume_id: str):
    volume = require_volume(volume_id)
    payload = reader_payload(volume)
    corrections = db.corrections_for(volume_id)
    overrides = db.page_overrides(volume_id)
    geometries = db.block_geometries(volume_id)
    text_overrides = db.block_text_overrides(volume_id)
    for page_index, page in enumerate(payload["pages"]):
        if page_index in overrides:
            page["blocks"] = overrides[page_index]
            page["vision_override"] = True
        page["image_url"] = f"/api/volumes/{volume_id}/images/{Path(page['img_path']).name}"
        page_area = max(1, page["img_width"] * page["img_height"])
        suspicious_blocks = 0
        for block in page["blocks"]:
            x1, y1, x2, y2 = block["box"]
            area_ratio = max(0, x2 - x1) * max(0, y2 - y1) / page_area
            if block["font_size"] > 80 or area_ratio > 0.24:
                suspicious_blocks += 1
        page["ocr_quality"] = {
            "suspicious": suspicious_blocks >= 2,
            "flagged_blocks": suspicious_blocks,
            "reason": "The text detector found unusually large or overlapping regions. Page-level vision OCR is recommended."
            if suspicious_blocks >= 2 else None,
        }
        for block_index, block in enumerate(page["blocks"]):
            if (page_index, block_index) in geometries:
                block["box"] = geometries[(page_index, block_index)]
            block["raw_lines"] = list(block.get("raw_lines", block["lines"]))
            if (page_index, block_index) in text_overrides:
                block.update(text_overrides[(page_index, block_index)])
            block["ruby"] = block.get("ruby") or [[] for _ in block["lines"]]
            for line_index in range(len(block["lines"])):
                correction = corrections.get((page_index, block_index, line_index))
                if correction:
                    block["lines"][line_index] = correction["canonical_text"]
                    block["ruby"][line_index] = correction["ruby"]
    payload["volume_id"] = volume_id
    payload["current_page"] = volume.current_page
    return payload


@app.get("/api/volumes/{volume_id}/images/{filename}")
def image(volume_id: str, filename: str):
    volume = require_volume(volume_id)
    safe_name = Path(filename).name
    path = Path(volume.source_path) / safe_name
    if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
        raise HTTPException(404, "Page not found")
    return FileResponse(path)


@app.put("/api/volumes/{volume_id}/position")
def position(volume_id: str, payload: Position):
    require_volume(volume_id)
    db.save_position(volume_id, max(0, payload.page))
    return {"ok": True}


@app.put("/api/volumes/{volume_id}/corrections")
def correction(volume_id: str, payload: Correction):
    require_volume(volume_id)
    db.save_correction(
        volume_id, payload.page_index, payload.block_index, payload.line_index,
        payload.raw_text, payload.canonical_text, payload.ruby, now(),
    )
    return {"ok": True}


@app.put("/api/volumes/{volume_id}/pages/{page_index}/blocks/{block_index}/geometry")
def save_geometry(volume_id: str, page_index: int, block_index: int, payload: BlockGeometry):
    volume = require_volume(volume_id); metadata = reader_payload(volume)
    if not 0 <= page_index < len(metadata["pages"]): raise HTTPException(404, "Page not found")
    page = metadata["pages"][page_index]
    if len(payload.box) != 4: raise HTTPException(400, "A box must contain four coordinates")
    x1, y1, x2, y2 = payload.box
    box = [max(0, min(page["img_width"], x1)), max(0, min(page["img_height"], y1)),
           max(0, min(page["img_width"], x2)), max(0, min(page["img_height"], y2))]
    if box[2] - box[0] < 4 or box[3] - box[1] < 4: raise HTTPException(400, "The text region is too small")
    db.save_block_geometry(volume_id, page_index, block_index, box, now())
    return {"ok": True, "box": box}


@app.put("/api/volumes/{volume_id}/pages/{page_index}/blocks/{block_index}/text")
def save_block_text(volume_id: str, page_index: int, block_index: int, payload: BlockText):
    require_volume(volume_id)
    if not payload.lines or len(payload.lines) != len(payload.ruby):
        raise HTTPException(400, "Each transcription line needs a corresponding ruby list")
    db.save_block_text(volume_id, page_index, block_index, payload.lines, payload.ruby, now())
    return {"ok": True}


RUBY_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"base": {"type": "string"}, "reading": {"type": "string"}, "printed": {"type": "boolean"}},
    "required": ["base", "reading", "printed"],
}
VISION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "lines": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
            "text": {"type": "string"}, "ruby": {"type": "array", "items": RUBY_SCHEMA}, "confidence": {"type": "number"},
        }, "required": ["text", "ruby", "confidence"]}},
    }, "required": ["summary", "lines"],
}
LENS_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "notes": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
            "type": {"type": "string"}, "title": {"type": "string"}, "explanation": {"type": "string"},
            "evidence": {"type": "string"}, "confidence": {"type": "number"},
        }, "required": ["type", "title", "explanation", "evidence", "confidence"]}},
    }, "required": ["summary", "notes"],
}
PAGE_VISION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "blocks": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
            "box": {"type": "array", "items": {"type": "number"}}, "vertical": {"type": "boolean"},
            "lines": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
                "text": {"type": "string"}, "ruby": {"type": "array", "items": RUBY_SCHEMA},
            }, "required": ["text", "ruby"]}}, "confidence": {"type": "number"},
        }, "required": ["box", "vertical", "lines", "confidence"]}},
    }, "required": ["summary", "blocks"],
}


@app.post("/api/volumes/{volume_id}/pages/{page_index}/blocks/{block_index}/vision")
async def reprocess_block(volume_id: str, page_index: int, block_index: int, request: VisionRequest):
    volume = require_volume(volume_id)
    payload = reader_payload(volume)
    try:
        page, block = payload["pages"][page_index], payload["pages"][page_index]["blocks"][block_index]
    except IndexError:
        raise HTTPException(404, "Page or text region not found")
    image_bytes, _ = page_image(volume, page)
    with Image.open(io.BytesIO(image_bytes)) as source:
        x1, y1, x2, y2 = block["box"]
        margin = max(24, int(block.get("font_size", 20) * 1.5))
        crop = source.crop((max(0, x1-margin), max(0, y1-margin), min(source.width, x2+margin), min(source.height, y2+margin)))
        output = io.BytesIO(); crop.convert("RGB").save(output, "JPEG", quality=92)
    prompt = f"""Transcribe this Japanese manga text region precisely. Preserve punctuation and line/column order.
Return kanji in canonical text, never replace kanji with its reading. Record furigana separately; printed=true only when visibly printed, otherwise false.
There are currently {len(block.get('lines', []))} OCR lines: {json.dumps(block.get('lines', []), ensure_ascii=False)}.
The lines array should follow the natural reading order. Summary should briefly flag uncertainty."""
    try:
        result, provider = await structured_vision(request.provider, prompt, output.getvalue(), "image/jpeg", VISION_SCHEMA)
    except (ValueError, httpx.HTTPError, json.JSONDecodeError) as error:
        raise HTTPException(503, str(error))
    return {"proposal": result, "provider": provider.id, "model": provider.model, "applied": False}


@app.post("/api/volumes/{volume_id}/pages/{page_index}/vision")
async def reprocess_page(volume_id: str, page_index: int, request: VisionRequest):
    volume = require_volume(volume_id); payload = reader_payload(volume)
    if not 0 <= page_index < len(payload["pages"]): raise HTTPException(404, "Page not found")
    page = payload["pages"][page_index]; image_bytes, mime = page_image(volume, page)
    prompt = """Detect and transcribe every Japanese text region on this entire manga page. This may be dialogue, narration, a table of contents, signage, or sound effects. Do not assume all text is vertical. Group text into coherent regions in natural Japanese reading order. Box coordinates must be [x1,y1,x2,y2] normalized from 0 to 1000. Preserve kanji in text and record visible furigana separately with printed=true. Never invent a kanji merely from a phonetic reading. Summary should describe the page layout and uncertainties."""
    try: result, provider = await structured_vision(request.provider, prompt, image_bytes, mime, PAGE_VISION_SCHEMA)
    except (ValueError, httpx.HTTPError, json.JSONDecodeError) as error: raise HTTPException(503, str(error))
    result["blocks"] = normalize_contents_proposal(result.get("blocks", []))
    return {"proposal": result, "provider": provider.id, "model": provider.model, "applied": False}


@app.put("/api/volumes/{volume_id}/pages/{page_index}/vision")
def apply_page_vision(volume_id: str, page_index: int, request: PageOverride):
    volume = require_volume(volume_id); payload = reader_payload(volume)
    if not 0 <= page_index < len(payload["pages"]): raise HTTPException(404, "Page not found")
    width, height = payload["pages"][page_index]["img_width"], payload["pages"][page_index]["img_height"]
    blocks = []
    proposed_blocks = normalize_contents_proposal(request.blocks)
    for proposed in proposed_blocks:
        box = proposed.get("box", [])
        if len(box) != 4: continue
        coords = [max(0, min(1000, float(value))) for value in box]
        lines = proposed.get("lines", [])
        blocks.append({
            "box": [coords[0]/1000*width, coords[1]/1000*height, coords[2]/1000*width, coords[3]/1000*height],
            "vertical": bool(proposed.get("vertical")), "font_size": max(12, min(width, height) * .025),
            "lines_coords": [], "lines": [line.get("text", "") for line in lines],
            "raw_lines": [line.get("text", "") for line in lines],
            "ruby": [[{"base": span.get("base", ""), "reading": span.get("reading", ""), "printed": bool(span.get("printed"))} for span in line.get("ruby", [])] for line in lines],
        })
    blocks = repair_contents_layout(blocks, width, height)
    if not blocks: raise HTTPException(400, "The proposal contains no valid text regions")
    db.save_page_override(volume_id, page_index, blocks, now())
    return {"ok": True, "blocks": blocks}


def repair_contents_layout(blocks: list[dict], width: int, height: int) -> list[dict]:
    """Vision models often transcribe TOCs correctly but invent their boxes.

    A contents page is a regular typographic grid, so use its reading order to
    anchor columns right-to-left instead of trusting ungrounded coordinates.
    """
    if len(blocks) < 9 or not blocks:
        return blocks
    def line_text(line): return line if isinstance(line, str) else line.get("text", "")
    first_text = "".join(line_text(line) for line in blocks[0].get("lines", [])).lower()
    columns = blocks[1:]
    if "contents" not in first_text or not all(block.get("vertical") for block in columns):
        return blocks
    blocks[0]["box"] = [width * .60, height * .385, width * .97, height * .445]
    right, left = width * .985, width * .015
    total_columns = sum(max(1, len(block.get("lines", []))) for block in columns)
    step = (right - left) / max(1, total_columns)
    top = height * .50
    cursor = right
    for block in columns:
        line_count = max(1, len(block.get("lines", [])))
        glyphs = max((len(line_text(line)) for line in block.get("lines", [])), default=5)
        column_width = step * line_count * .9
        block["box"] = [max(0, cursor - column_width), top, min(width, cursor), min(height * .94, top + glyphs * height * .043)]
        block["font_size"] = width * .052
        cursor -= step * line_count
    return blocks


def normalize_contents_proposal(blocks: list[dict]) -> list[dict]:
    """Split LLM proposals that collapse an entire TOC into one region.

    Models alternate between one block per chapter and one block containing
    every chapter as separate lines. Normalize both shapes before preview so
    the review accurately represents what will be applied.
    """
    if len(blocks) < 2:
        return blocks
    title_index = next((index for index, block in enumerate(blocks)
                        if "contents" in "".join(line.get("text", "") for line in block.get("lines", [])).lower()), None)
    if title_index is None:
        return blocks
    title = blocks[title_index]
    chapters: list[dict] = []
    for index, block in enumerate(blocks):
        if index == title_index:
            continue
        lines = block.get("lines", [])
        if len(lines) == 1 and "/" in lines[0].get("text", ""):
            parts = [part.strip() for part in lines[0]["text"].split("/") if part.strip()]
            lines = [{"text": part, "ruby": []} for part in parts]
        if len(lines) >= 5:
            chapters.extend({**block, "vertical": True, "lines": [line]} for line in lines)
        else:
            chapters.append({**block, "vertical": True})
    if len(chapters) < 8:
        return blocks
    return repair_contents_layout([title, *chapters], 1000, 1000)


@app.post("/api/volumes/{volume_id}/pages/{page_index}/analyze")
async def analyze_page(volume_id: str, page_index: int, request: LensRequest):
    volume = require_volume(volume_id)
    payload = reader_payload(volume)
    apply_saved_text(payload, volume_id)
    if not 0 <= page_index < len(payload["pages"]):
        raise HTTPException(404, "Page not found")
    page = payload["pages"][page_index]
    context = []
    if page_index > 0: context.append("PREVIOUS PAGE:\n" + transcript(payload["pages"][page_index - 1]))
    context.append("CURRENT PAGE:\n" + transcript(page))
    if request.include_next and page_index + 1 < len(payload["pages"]):
        context.append("NEXT PAGE (explicitly included):\n" + transcript(payload["pages"][page_index + 1]))
    if request.question: context.append("READER QUESTION:\n" + request.question)
    image_bytes, mime = page_image(volume, page)
    prompt = """You are Page Lens, a careful Japanese manga reading companion. Explain only genuinely useful context: unusual/creative furigana, wordplay, register, cultural references, visual-text relationships, and implied meaning. Distinguish observation from inference. Avoid future spoilers. Evidence must quote only a very short relevant Japanese fragment.\n\n""" + "\n\n".join(context)
    cache_key = hashlib.sha256(((request.provider or "default") + str(request.include_next) + (request.question or "") + prompt).encode()).hexdigest()
    cached = db.get_lens_analysis(volume_id, page_index, cache_key)
    if cached: return {**cached, "cached": True}
    try:
        result, provider = await structured_vision(request.provider, prompt, image_bytes, mime, LENS_SCHEMA)
    except (ValueError, httpx.HTTPError, json.JSONDecodeError) as error:
        raise HTTPException(503, str(error))
    response = {"analysis": result, "provider": provider.id, "model": provider.model, "cached": False}
    db.save_lens_analysis(volume_id, page_index, cache_key, response, now())
    return response


@app.get("/api/saved-items")
def list_saved_items():
    return db.saved_items()


@app.post("/api/saved-items")
def create_saved_item(payload: SavedItem):
    item = {**payload.model_dump(), "id": uuid.uuid4().hex, "created_at": now()}
    db.save_item(item)
    return item


@app.delete("/api/saved-items/{item_id}")
def delete_saved_item(item_id: str):
    if not db.delete_saved_item(item_id): raise HTTPException(404, "Saved item not found")
    return {"ok": True}


@app.get("/api/saved-items/export.tsv", response_class=PlainTextResponse)
def export_saved_items():
    def clean(value): return str(value or "").replace("\t", " ").replace("\n", " ")
    rows = ["Expression\tReading\tMeaning\tContext\tNotes"]
    rows += ["\t".join(clean(item.get(key)) for key in ("text", "reading", "meaning", "context", "notes")) for item in db.saved_items()]
    return PlainTextResponse("\n".join(rows), headers={"Content-Disposition": "attachment; filename=komayomi-items.tsv"})
