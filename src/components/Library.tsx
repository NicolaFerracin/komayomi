import { BookMarked, BookOpen, Clock3, Pencil, Plus, Sparkles } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Brand } from './Brand'
import type { Volume } from '../types'

export function Library({ volumes, onImport, onOpen, onStudy, onEdit }: {
  volumes: Volume[]
  onImport: () => void
  onOpen: (volume: Volume) => void
  onStudy: () => void
  onEdit: (volume: Volume) => void
}) {
  return (
    <main className="library-shell">
      <header className="library-header">
        <Brand/>
        <div className="library-actions"><button className="secondary-button" onClick={onStudy}><BookMarked size={16}/> Study inbox</button><button className="primary-button primary-button--small" onClick={onImport}><Plus size={17}/> Add volume</button></div>
      </header>

      <section className="library-hero">
        <div>
          <div className="eyebrow"><span>私の本棚</span> YOUR READING DESK</div>
          <h1>Read the story.<br/><em>Notice the language.</em></h1>
        </div>
        <p>Japanese manga, kept local and made legible—without turning every page into homework.</p>
      </section>

      <div className="section-rule"><span>LIBRARY / {String(volumes.length).padStart(2, '0')}</span></div>

      {volumes.length === 0 ? (
        <button className="empty-library" onClick={onImport}>
          <div className="empty-library__mark"><BookOpen size={32}/></div>
          <div><strong>Your desk is waiting.</strong><span>Import a folder of manga pages to begin.</span></div>
          <Plus size={22}/>
        </button>
      ) : (
        <section className="volume-grid">
          {volumes.map((volume, index) => (
            <article className="volume-card" key={volume.id} style={{'--delay': `${index * 60}ms`} as CSSProperties}>
              <button className="volume-card__cover" disabled={volume.status !== 'ready'} onClick={() => onOpen(volume)}>
                {volume.cover_filename
                  ? <img src={`/api/volumes/${volume.id}/images/${encodeURIComponent(volume.cover_filename)}`} alt=""/>
                  : <div className="cover-placeholder">読</div>}
                <span className="volume-card__index">{String(index + 1).padStart(2, '0')}</span>
                {volume.status === 'ready' && <span className="open-cue"><BookOpen size={17}/> Open</span>}
              </button>
              <div className="volume-card__meta">
                <div className="volume-card__meta-head"><div className="eyebrow">{volume.series}</div><button title="Edit volume details" onClick={()=>onEdit(volume)}><Pencil size={13}/></button></div>
                <h3>{volume.title}</h3>
                {volume.status === 'ready' ? (
                  <div className="volume-status"><Clock3 size={14}/>{volume.page_count} pages <i/> {Math.round(volume.current_page / Math.max(volume.page_count, 1) * 100)}% read</div>
                ) : (
                  <div className="processing-status">
                    <div><Sparkles size={14}/> {volume.status === 'error' ? 'Needs attention' : 'Reading the ink'}<span>{Math.round(volume.progress * 100)}%</span></div>
                    <div className="progress-track"><span style={{width: `${volume.progress * 100}%`}}/></div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
