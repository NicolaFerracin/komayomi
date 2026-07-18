import { Check, PencilLine, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import type { Volume } from '../types'

export function EditVolumeDialog({volume,onClose,onSaved}:{volume:Volume;onClose:()=>void;onSaved:(volume:Volume)=>void}){
  const[title,setTitle]=useState(volume.title);const[series,setSeries]=useState(volume.series);const[busy,setBusy]=useState(false);const[error,setError]=useState('')
  async function save(){setBusy(true);setError('');try{onSaved(await api.updateVolume(volume.id,title,series))}catch(reason){setError(reason instanceof Error?reason.message:'Could not rename volume')}finally{setBusy(false)}}
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="edit-volume-card" role="dialog" aria-modal="true" aria-label="Rename volume" onMouseDown={(event)=>event.stopPropagation()}><button className="icon-button edit-volume-card__close" aria-label="Close volume details" onClick={onClose}><X size={18}/></button><span className="eyebrow">LIBRARY DETAILS</span><div className="edit-volume-mark"><PencilLine size={23}/></div><h2>Rename volume</h2><p>The source folder and processed pages stay exactly where they are.</p><label className="field"><span>Series name</span><input autoFocus value={series} onChange={(event)=>setSeries(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&save()}/></label><label className="field"><span>Volume title</span><input value={title} onChange={(event)=>setTitle(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&save()}/></label>{error&&<div className="error-note">{error}</div>}<button className="primary-button" disabled={busy||!title.trim()||!series.trim()} onClick={save}><Check size={16}/>{busy?'Saving…':'Save details'}</button></section></div>
}
