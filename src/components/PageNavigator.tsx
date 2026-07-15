import { BookOpen, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MangaPage } from '../types'

export function PageNavigator({ pages, current, onChoose, onClose }: { pages: MangaPage[]; current: number; onChoose: (page: number) => void; onClose: () => void }) {
  const [value, setValue] = useState(String(current + 1))
  const [query, setQuery] = useState('')
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { activeRef.current?.scrollIntoView({block: 'center'}) }, [])
  function jump() {
    const page = Math.min(pages.length, Math.max(1, Number.parseInt(value, 10) || current + 1)) - 1
    onChoose(page)
  }
  const matches = useMemo(() => {
    const needle = query.trim().normalize('NFKC').toLocaleLowerCase()
    if (!needle) return pages.map((page, index) => ({page, index, excerpt: ''}))
    return pages.flatMap((page, index) => {
      const lines = page.blocks.flatMap((block) => block.lines)
      const found = lines.find((line) => line.normalize('NFKC').toLocaleLowerCase().includes(needle))
      return found ? [{page, index, excerpt: found}] : []
    })
  }, [pages, query])
  return <aside className="tool-panel page-navigator">
    <header><div><span className="eyebrow">GO TO PAGE</span><h2>Pages</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
    <form className="page-jump" onSubmit={(event) => { event.preventDefault(); jump() }}><label><span>PAGE</span><input value={value} inputMode="numeric" onChange={(event) => setValue(event.target.value)} onFocus={(event) => event.target.select()}/></label><span>of {pages.length}</span><button className="primary-button">Go</button></form>
    <label className="page-search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search Japanese transcript…"/><span>{query.trim() ? `${matches.length} pages` : `${pages.length} pages`}</span></label>
    {!matches.length && <div className="page-search-empty"><Search size={22}/><strong>No transcript matches</strong><span>OCR errors can prevent a page from appearing here.</span></div>}
    <div className="page-grid" aria-label="Page thumbnails">{matches.map(({page,index,excerpt}) => <button ref={index === current ? activeRef : undefined} className={index === current ? 'active' : ''} key={index} onClick={() => onChoose(index)} aria-label={`Open page ${index + 1}`}><div><img loading="lazy" src={page.image_url} alt=""/>{page.ocr_quality?.suspicious && <i title="OCR may need attention">!</i>}</div><span>{String(index + 1).padStart(3, '0')}</span>{excerpt&&<em title={excerpt}>{excerpt}</em>}{index === current && <small><BookOpen size={10}/> reading</small>}</button>)}</div>
  </aside>
}
