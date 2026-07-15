# KomaYomi architecture

The Vite/React client is a local reader UI. FastAPI owns persistence, dictionary and grammar analysis, OCR orchestration, and opt-in provider calls. SQLite is the durable source of truth for reader-generated data; original images and generated Mokuro metadata remain filesystem assets.

## Data boundaries

- `server/jobs.py`: one OCR task per volume, restart recovery, durable progress and logs.
- `server/db.py`: ordered schema migrations, backups, corrections, study items, AI history, search index.
- `server/app.py`: validation and HTTP boundary; provider calls occur only on explicit POST actions.
- `src/components/Reader.tsx`: reading workspace and mutually exclusive tools.
- `src/hooks`: browser-local reader state that does not belong in SQLite.

Approved OCR edits layer over immutable Mokuro metadata. Search is rebuilt lazily after transcript changes. Focused AI history is attached to volume/page/block identity so correcting the transcript does not orphan it.

## Release check

Run `npm test`, `npm run build`, Python bytecode compilation, `PRAGMA integrity_check`, and a clean health-check startup. Never commit `.env`, manga pages, the SQLite database, or generated OCR output.
