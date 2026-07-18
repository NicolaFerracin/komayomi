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
.venv/bin/uvicorn server.app:app --reload --host 127.0.0.1
npm run dev -- --host 127.0.0.1
```

## Current capabilities

- Import an existing image directory without copying the source pages
- Upload JPG, PNG, or WEBP pages as a new local volume
- Run Mokuro asynchronously with pause/resume, restart recovery, persistent diagnostics, and progress reporting
- Open completed volumes in a right-to-left reader
- Hover bubbles to see selectable web-font text
- Edit OCR lines while preserving the raw transcription, or remove unwanted regions such as page numbers and sound effects
- Store structured ruby spans separately from canonical text
- Look up inflected Japanese locally with JMdict/KANJIDIC data
- Reprocess a cropped text region with OpenAI, Anthropic, or Gemini vision, review the proposal, then explicitly save it
- Repair an entire page's OCR layout with vision and approve replacement regions before they are persisted
- Run opt-in Page Lens analysis with previous-page context, an optional next-page spoiler toggle, questions, and a local cache
- Check your own interpretation of multiple bubbles in one page-level Meaning Check, with separate meaning and literal-alignment feedback
- Run an optional Learning Pass that proposes at most three transferable words, readings, grammar points, or patterns from the page
- Notice saved lessons when they recur and attempt recall before reopening dictionary help
- Save dictionary finds to a no-pressure study inbox and export Anki-compatible TSV
- Search Japanese text or kana readings across a volume using a persistent correction-aware index
- Bookmark pages, keep recent lookups, flag OCR issues, and edit text-region placement
- Save vocabulary, sentences, and grammar notes to a searchable study inbox with TSV export
- Persist reading position, corrections, AI history, and preferences locally
- Back up and safely restore the SQLite database from the Library

Page Lens never sends page data anywhere until the user explicitly invokes it.
Meaning Check is also opt-in: it sends only answered blocks and text context by default, with page artwork behind a separate toggle.
Learning Pass is opt-in and creates nothing automatically. Kept lessons have no schedule or due date; they advance from learning to recognized to familiar only through later manga encounters.

## Optional LLM providers

Copy `.env.example` to `.env`, choose `LLM_PROVIDER`, and add either the generic
`LLM_API_KEY` or one/more provider-specific keys. Multiple configured providers
become selectable in the reader. Consumer chat subscriptions do not normally
include API usage; these integrations use the providers' metered APIs.

## Data and recovery

Source manga images are never modified. Imported folders remain in place; uploaded images live under generated directories in `data/library`, independent of their display titles and original filenames. Uploads are limited to 500 files, 32 MB per image, and 2 GB per volume; image contents are validated before OCR starts. Reader edits and history live in `data/komayomi.db`, while Mokuro output sits beside each source folder. The database upgrades through ordered, transactional schema migrations on startup.

KomaYomi has no user authentication because it is a single-user local application. The development servers bind only to `127.0.0.1`, and the API rejects untrusted hostnames. Do not expose it through a public interface or reverse proxy without adding authentication and request-origin protection.

Use **Backup** before moving machines or making large changes. **Restore** validates SQLite integrity and required tables, creates a safety copy of the current database, swaps the chosen backup atomically, then resumes interrupted OCR jobs.

If OCR fails or appears stuck, open **View log** on its Library card. Restart both development servers with `./dev.sh`; queued or interrupted jobs are recovered automatically.

## Reader controls

- Two-finger scroll or mouse wheel: zoom around the pointer
- Click-drag empty artwork: pan; click or select overlay text: interact with a bubble
- Arrow Left / Right: next / previous page
- `G`: page browser and transcript search
- `L`: Page Lens, `W`: preferred reading workflow, `S`: settings, `H`: recent lookups, `B`: bookmark
- `0`: reset zoom, `?`: complete shortcut guide, `Esc`: close the active tool

## Preferred reading and learning workflow

1. **Read unaided.** Look at the page and form a rough interpretation before opening help.
2. **Resolve only blocking language.** Select the smallest word or phrase preventing comprehension; avoid translating complete bubbles by default.
3. **State your understanding.** Decide what the bubble communicates in your own English.
4. **Run Meaning Check.** Compare meaning coverage, literal structure, omissions, additions, and contextual meaning for the bubbles you attempted.
5. **Investigate important gaps.** Use local vocabulary and grammar first; use AI explanation only when deterministic help is insufficient.
6. **Run Learning Pass.** After understanding the page, request up to three transferable lessons grounded in mistakes, lookups, useful readings, and recurring patterns.
7. **Keep almost nothing.** Keep only what would make another page easier. Zero or one lesson is a healthy default.
8. **Recall inside the manga.** When a kept form recurs, attempt it before revealing vocabulary. Real encounters move it from learning to recognized to familiar.

The loop is: **attempt → selective help → check → keep little → meet it again → recall**.

There are no quotas, streaks, due dates, or overdue reviews. Translation resolves the current page; Learning Pass decides what should improve the next one. Progress means needing less assistance—not completing more cards. This guide is always available from the reader’s **Reading & learning workflow** info button or the `W` shortcut.
