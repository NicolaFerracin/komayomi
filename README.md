# KomaYomi

A local-first Japanese manga reader with editable OCR, contextual dictionaries,
and opt-in AI assistance.

## Development

```sh
./dev.sh
```

Then open <http://localhost:5173>. The API runs at <http://localhost:8000>.

Run the complete regression suite with `npm test`, and create a production bundle with `npm run build`.

### Manual startup

```sh
.venv/bin/uvicorn server.app:app --reload
npm run dev
```

## Current capabilities

- Import an existing image directory without copying the source pages
- Upload JPG, PNG, or WEBP pages as a new local volume
- Run Mokuro asynchronously with pause/resume, restart recovery, persistent diagnostics, and progress reporting
- Open completed volumes in a right-to-left reader
- Hover bubbles to see selectable web-font text
- Edit OCR lines while preserving the raw transcription
- Store structured ruby spans separately from canonical text
- Look up inflected Japanese locally with JMdict/KANJIDIC data
- Reprocess a cropped text region with OpenAI, Anthropic, or Gemini vision, review the proposal, then explicitly save it
- Repair an entire page's OCR layout with vision and approve replacement regions before they are persisted
- Run opt-in Page Lens analysis with previous-page context, an optional next-page spoiler toggle, questions, and a local cache
- Save dictionary finds to a no-pressure study inbox and export Anki-compatible TSV
- Search Japanese text or kana readings across a volume using a persistent correction-aware index
- Bookmark pages, keep recent lookups, flag OCR issues, and edit text-region placement
- Save vocabulary, sentences, and grammar notes to a searchable study inbox with TSV export
- Persist reading position, corrections, AI history, and preferences locally
- Back up and safely restore the SQLite database from the Library

Page Lens never sends page data anywhere until the user explicitly invokes it.

## Optional LLM providers

Copy `.env.example` to `.env`, choose `LLM_PROVIDER`, and add either the generic
`LLM_API_KEY` or one/more provider-specific keys. Multiple configured providers
become selectable in the reader. Consumer chat subscriptions do not normally
include API usage; these integrations use the providers' metered APIs.

## Data and recovery

Source manga images are never modified. Imported folders remain in place; uploaded images live under `data/library`. Reader edits and history live in `data/komayomi.db`, while Mokuro output sits beside each source folder. The database upgrades through ordered, transactional schema migrations on startup.

Use **Backup** before moving machines or making large changes. **Restore** validates SQLite integrity and required tables, creates a safety copy of the current database, swaps the chosen backup atomically, then resumes interrupted OCR jobs.

If OCR fails or appears stuck, open **View log** on its Library card. Restart both development servers with `./dev.sh`; queued or interrupted jobs are recovered automatically.

## Reader controls

- Two-finger scroll or mouse wheel: zoom around the pointer
- Click-drag empty artwork: pan; click or select overlay text: interact with a bubble
- Arrow Left / Right: next / previous page
- `G`: page browser and transcript search
- `L`: Page Lens, `S`: settings, `H`: recent lookups, `B`: bookmark
- `0`: reset zoom, `?`: complete shortcut guide, `Esc`: close the active tool
