import { FolderOpen, Images, LoaderCircle, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../api'
import type { Volume } from '../types'

export function ImportDialog({ onClose, onImported }: {
  onClose: () => void
  onImported: (volume: Volume) => void
}) {
  const [mode, setMode] = useState<'local' | 'upload'>('local')
  const [path, setPath] = useState('')
  const [title, setTitle] = useState('')
  const [series, setSeries] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function submit() {
    setBusy(true); setError('')
    try {
      const volume = mode === 'local'
        ? await api.importLocal(path, title, series)
        : await api.upload(title || 'Untitled volume', series || 'My library', files)
      onImported(volume)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="import-card" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button import-card__close" aria-label="Close import" onClick={onClose}><X size={18}/></button>
        <div className="eyebrow">NEW MATERIAL</div>
        <h2 id="import-title">Bring in a volume</h2>
        <p className="muted">Pages stay on this Mac. KomaYomi runs the first OCR pass locally.</p>
        <div className="mode-switch">
          <button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}><FolderOpen size={17}/> Existing folder</button>
          <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}><Images size={17}/> Upload pages</button>
        </div>
        {mode === 'local' ? (
          <label className="field"><span>Folder path</span><input autoFocus value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/you/Manga/Volume 01"/></label>
        ) : (
          <button className="drop-zone" onClick={() => input.current?.click()}>
            <Images size={28}/><strong>{files.length ? `${files.length} pages selected` : 'Choose manga pages'}</strong><span>JPG, PNG or WEBP · ordered by filename</span>
            <input ref={input} hidden multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles(Array.from(e.target.files || []).sort((left,right)=>left.name.localeCompare(right.name,undefined,{numeric:true})))}/>
          </button>
        )}
        <div className="field-row">
          <label className="field"><span>Volume title <i>optional</i></span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Volume 01"/></label>
          <label className="field"><span>Series <i>optional</i></span><input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Dragon Ball"/></label>
        </div>
        {error && <div className="error-note">{error}</div>}
        <button className="primary-button" aria-busy={busy} disabled={busy || (mode === 'local' ? !path : !files.length)} onClick={submit}>
          {busy ? <><LoaderCircle className="spin" size={18}/> Preparing volume…</> : 'Import & process'}
        </button>
      </section>
    </div>
  )
}
