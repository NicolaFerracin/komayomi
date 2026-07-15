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
  const [restoring,setRestoring]=useState(false)
  const [notice,setNotice]=useState('')

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

  async function openSaved(volumeId:string,pageIndex:number) {
    try { const data=await api.reader(volumeId);await api.position(volumeId,pageIndex);setStudying(false);setReader({...data,current_page:pageIndex}) }
    catch (reason) { setError(reason instanceof Error?reason.message:'Could not open the saved page') }
  }
  async function changeProcessing(volume:Volume,action:'start'|'pause') {
    try { const updated=action==='start'?await api.processVolume(volume.id):await api.pauseVolume(volume.id);setVolumes((items)=>items.map((item)=>item.id===updated.id?updated:item));if(action==='start')window.setTimeout(refresh,500) }
    catch(reason){setError(reason instanceof Error?reason.message:'Could not change processing state')}
  }
  async function restoreBackup(file:File){if(!window.confirm('Restore this backup? KomaYomi will create a safety copy of the current database first.'))return;setRestoring(true);try{const result=await api.restoreBackup(file);await refresh();window.alert(`Backup restored. A safety copy was kept as ${result.safety_backup}.`)}catch(reason){setError(reason instanceof Error?reason.message:'Could not restore backup')}finally{setRestoring(false)}}

  if (reader) return <Reader data={reader} onExit={() => { setReader(null); refresh() }}/>
  return <>
    {error && <div className="global-error">{error}</div>}
    {notice&&<div className="global-notice">{notice}</div>}
    <Library volumes={volumes} restoring={restoring} onRestore={restoreBackup} onImport={() => setImporting(true)} onStudy={() => setStudying(true)} onEdit={setEditing} onOpen={open} onRetry={(volume)=>changeProcessing(volume,'start')} onPause={(volume)=>changeProcessing(volume,'pause')}/>
    {importing && <ImportDialog onClose={() => setImporting(false)} onImported={(volume) => {
      setVolumes((items) => [volume, ...items.filter((item)=>item.id!==volume.id)])
      setNotice(volume.reused?'That folder is already in your library. KomaYomi reused its existing volume.':'Volume added to your library.')
      window.setTimeout(()=>setNotice(''),3500); setImporting(false)
    }}/>} {studying && <StudyInbox onClose={() => setStudying(false)} onOpenSource={openSaved}/>}
    {editing && <EditVolumeDialog volume={editing} onClose={()=>setEditing(null)} onSaved={(updated)=>{setVolumes((items)=>items.map((item)=>item.id===updated.id?updated:item));setEditing(null)}}/>}
  </>
}
