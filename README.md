# KomaYomi

A local-first Japanese manga reader with editable OCR, contextual dictionaries,
and opt-in AI assistance.

## Development

```sh
./dev.sh
```

Then open <http://localhost:5173>. The API runs at <http://localhost:8000>.

### Manual startup

```sh
.venv/bin/uvicorn server.app:app --reload
npm run dev
```

## Current capabilities

- Import an existing image directory without copying the source pages
- Upload JPG, PNG, or WEBP pages as a new local volume
- Run Mokuro asynchronously and watch its progress
- Open completed volumes in a right-to-left reader
- Hover bubbles to see selectable web-font text
- Edit OCR lines while preserving the raw transcription
- Store structured ruby spans separately from canonical text
- Look up inflected Japanese locally with JMdict/KANJIDIC data
- Reprocess a cropped text region with OpenAI, Anthropic, or Gemini vision, review the proposal, then explicitly save it
- Repair an entire page's OCR layout with vision and approve replacement regions before they are persisted
- Run opt-in Page Lens analysis with previous-page context, an optional next-page spoiler toggle, questions, and a local cache
- Save dictionary finds to a no-pressure study inbox and export Anki-compatible TSV
- Persist reading position and corrections in SQLite

Page Lens never sends page data anywhere until the user explicitly invokes it.

## Optional LLM providers

Copy `.env.example` to `.env`, choose `LLM_PROVIDER`, and add either the generic
`LLM_API_KEY` or one/more provider-specific keys. Multiple configured providers
become selectable in the reader. Consumer chat subscriptions do not normally
include API usage; these integrations use the providers' metered APIs.
