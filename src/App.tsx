import { useEffect, useState } from 'react'
import { api } from './api'
import { ImportDialog } from './components/ImportDialog'
import { Library } from './components/Library'
import { Reader } from './components/Reader'
import { StudyInbox } from './components/StudyInbox'
import { EditVolumeDialog } from './components/EditVolumeDialog'
import type { ReaderData, Volume } from './types'

export default function App() {
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [reader, setReader] = useState<ReaderData | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [studying, setStudying] = useState(false)
  const [editing, setEditing] = useState<Volume | null>(null)

  async function refresh() {
    try { setVolumes(await api.volumes()); setError('') }
    catch { setError('KomaYomi could not reach its local server.') }
  }

  useEffect(() => {
    refresh()
    const timer = window.setInterval(() => {
      if (volumes.some((volume) => volume.status === 'processing' || volume.status === 'queued')) refresh()
    }, 1800)
    return () => window.clearInterval(timer)
  }, [volumes.some((volume) => volume.status === 'processing' || volume.status === 'queued')])

  async function open(volume: Volume) {
    try { setReader(await api.reader(volume.id)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open volume') }
  }

  if (reader) return <Reader data={reader} onExit={() => { setReader(null); refresh() }}/>
  return <>
    {error && <div className="global-error">{error}</div>}
    <Library volumes={volumes} onImport={() => setImporting(true)} onStudy={() => setStudying(true)} onEdit={setEditing} onOpen={open}/>
    {importing && <ImportDialog onClose={() => setImporting(false)} onImported={(volume) => { setVolumes((items) => [volume, ...items]); setImporting(false) }}/>} 
    {studying && <StudyInbox onClose={() => setStudying(false)}/>} 
    {editing && <EditVolumeDialog volume={editing} onClose={()=>setEditing(null)} onSaved={(updated)=>{setVolumes((items)=>items.map((item)=>item.id===updated.id?updated:item));setEditing(null)}}/>}
  </>
}
