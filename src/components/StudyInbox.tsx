import { Download, Inbox, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { SavedItem } from '../types'

export function StudyInbox({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<SavedItem[]>([])
  const [error, setError] = useState('')
  useEffect(() => { api.savedItems().then(setItems).catch((reason) => setError(reason.message)) }, [])
  async function remove(id: string) { await api.deleteSavedItem(id); setItems((current) => current.filter((item) => item.id !== id)) }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="study-inbox" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="eyebrow">LIGHTWEIGHT CAPTURE</span><h2>Study inbox</h2><p>Keep interesting words without creating daily review debt.</p></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
    {error && <div className="error-note">{error}</div>}
    {!items.length && !error && <div className="inbox-empty"><Inbox size={34}/><strong>Nothing saved yet.</strong><span>Select text while reading, look it up, then save what feels worth keeping.</span></div>}
    <div className="inbox-items">{items.map((item) => <article key={item.id}><div><strong>{item.text}</strong><em>{item.reading}</em></div><p>{item.meaning || 'No meaning saved'}</p>{item.context && item.context !== item.text && <small>{item.context}</small>}<button title="Delete" onClick={() => remove(item.id)}><Trash2 size={15}/></button></article>)}</div>
    {!!items.length && <a className="primary-button inbox-export" href="/api/saved-items/export.tsv" download><Download size={16}/> Export {items.length} item{items.length === 1 ? '' : 's'} for Anki</a>}
  </section></div>
}
