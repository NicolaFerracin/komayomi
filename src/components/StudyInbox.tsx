import { BookOpen, Check, Download, Inbox, Pencil, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { SavedItem } from '../types'

export function StudyInbox({ onClose, onOpenSource }: { onClose: () => void; onOpenSource:(volumeId:string,pageIndex:number)=>void }) {
  const [items, setItems] = useState<SavedItem[]>([])
  const [error, setError] = useState('')
  const [query,setQuery]=useState('')
  const [editing,setEditing]=useState<string|null>(null)
  const [draft,setDraft]=useState({reading:'',meaning:'',notes:''})
  useEffect(() => { api.savedItems().then(setItems).catch((reason) => setError(reason.message)) }, [])
  async function remove(id: string) { if(!window.confirm('Delete this saved study item?'))return;await api.deleteSavedItem(id); setItems((current) => current.filter((item) => item.id !== id)) }
  const visible=useMemo(()=>{const needle=query.trim().toLocaleLowerCase();return needle?items.filter((item)=>[item.text,item.reading,item.meaning,item.context,item.notes].some((value)=>value?.toLocaleLowerCase().includes(needle))):items},[items,query])
  function edit(item:SavedItem){setEditing(item.id);setDraft({reading:item.reading||'',meaning:item.meaning||'',notes:item.notes||''})}
  async function save(id:string){const item=await api.updateSavedItem(id,{reading:draft.reading||null,meaning:draft.meaning||null,notes:draft.notes||null});setItems((current)=>current.map((saved)=>saved.id===id?item:saved));setEditing(null)}
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="study-inbox" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="eyebrow">LIGHTWEIGHT CAPTURE</span><h2>Study inbox</h2><p>Keep interesting words without creating daily review debt.</p></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
    {error && <div className="error-note">{error}</div>}
    {!!items.length&&<label className="inbox-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search saved words, meanings, or notes…"/><span>{visible.length} / {items.length}</span></label>}
    {!items.length && !error && <div className="inbox-empty"><Inbox size={34}/><strong>Nothing saved yet.</strong><span>Select text while reading, look it up, then save what feels worth keeping.</span></div>}
    <div className="inbox-items">{visible.map((item) => <article key={item.id}><div><strong>{item.text}</strong><em>{item.reading}</em>{item.page_index!==null&&<i>page {item.page_index+1}</i>}{item.volume_id&&item.page_index!==null&&<button className="inbox-source" onClick={()=>onOpenSource(item.volume_id!,item.page_index!)}><BookOpen size={12}/> Open in manga</button>}</div>{editing===item.id?<div className="inbox-edit"><label><span>READING</span><input value={draft.reading} onChange={(event)=>setDraft({...draft,reading:event.target.value})}/></label><label><span>MEANING</span><textarea value={draft.meaning} onChange={(event)=>setDraft({...draft,meaning:event.target.value})}/></label><label><span>YOUR NOTES</span><textarea value={draft.notes} onChange={(event)=>setDraft({...draft,notes:event.target.value})} placeholder="Why did you save this?"/></label><button className="primary-button" onClick={()=>save(item.id)}><Check size={14}/> Save changes</button></div>:<><p>{item.meaning || 'No meaning saved'}</p>{item.notes&&<blockquote>{item.notes}</blockquote>}{item.context && item.context !== item.text && <small>{item.context}</small>}</>}<div className="inbox-item-actions"><button title="Edit" onClick={() => edit(item)}><Pencil size={14}/></button><button title="Delete" onClick={() => remove(item.id)}><Trash2 size={15}/></button></div></article>)}</div>
    {!!items.length && <a className="primary-button inbox-export" href="/api/saved-items/export.tsv" download><Download size={16}/> Export {items.length} item{items.length === 1 ? '' : 's'} for Anki</a>}
  </section></div>
}
