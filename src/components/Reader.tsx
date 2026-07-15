import { ArrowLeft, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Eye, Grid3X3, Highlighter, Library as LibraryIcon, Maximize2, Minimize2, Move, Pencil, Search, Settings2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRef } from 'react'
import type { ClipboardEvent as ReactClipboardEvent, CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react'
import { api } from '../api'
import type { ReaderData, RubySpan, TextBlock } from '../types'
import { Brand } from './Brand'
import { BubbleEditor } from './BubbleEditor'
import { PageLens } from './PageLens'
import { LookupPanel } from './LookupPanel'
import { SettingsPanel } from './SettingsPanel'
import { PageNavigator } from './PageNavigator'
import { ShortcutGuide } from './ShortcutGuide'
import { readerPreferences, type ReaderPreferences } from '../preferences'
import { LookupHistoryPanel, type RecentLookup } from './LookupHistoryPanel'

function RubyText({ text, spans }: { text: string; spans: RubySpan[] }) {
  if (!spans.length) return <>{text}</>
  let cursor = 0
  const nodes: ReactNode[] = []
  spans.forEach((span, index) => {
    const position = text.indexOf(span.base, cursor)
    if (position < 0) return
    if (position > cursor) nodes.push(text.slice(cursor, position))
    nodes.push(<ruby key={`${span.base}-${index}`}>{span.base}<rt>{span.reading}</rt></ruby>)
    cursor = position + span.base.length
  })
  nodes.push(text.slice(cursor))
  return <>{nodes}</>
}

function BubbleOverlay({ block, pageWidth, pageHeight, textScale, active, layoutMode, onClick, onSelection, onGeometryChange }: {
  block: TextBlock; pageWidth: number; pageHeight: number; onClick: () => void
  onSelection: (text: string, ruby: RubySpan[], context: string, x: number, y: number) => void
  active: boolean; layoutMode: boolean; textScale:number; onGeometryChange: (box: [number, number, number, number], commit: boolean, original?: [number, number, number, number]) => void
}) {
  const geometryDrag = useRef<{x: number; y: number; box: [number, number, number, number]; resize: boolean} | null>(null)
  const [rawX1, rawY1, rawX2, rawY2] = block.box
  // Mokuro boxes hug glyphs tightly. Vertical text needs extra room on the
  // trailing (left) edge, where the final column otherwise gets clipped.
  const x1 = Math.max(0, rawX1 - block.font_size * (block.vertical ? 2.2 : .45))
  const x2 = Math.min(pageWidth, rawX2 + block.font_size * .45)
  const y1 = Math.max(0, rawY1 - block.font_size * .45)
  const y2 = Math.min(pageHeight, rawY2 + block.font_size * .55)
  const style = {
    left: `${x1 / pageWidth * 100}%`, top: `${y1 / pageHeight * 100}%`,
    width: `${(x2 - x1) / pageWidth * 100}%`, height: `${(y2 - y1) / pageHeight * 100}%`,
    '--ocr-size': `${Math.max(1.25, block.font_size / pageWidth * 100)*textScale}cqw`,
  } as CSSProperties

  function copyWithoutNestedRuby(event: ReactClipboardEvent<HTMLSpanElement>) {
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return

    const elementFor = (node: Node | null) =>
      node instanceof Element ? node : node?.parentElement
    const anchorRuby = elementFor(selection.anchorNode)?.closest('rt')
    const focusRuby = elementFor(selection.focusNode)?.closest('rt')

    // A deliberate selection wholly inside one furigana reading should keep it.
    if (anchorRuby && anchorRuby === focusRuby) return

    const fragment = selection.getRangeAt(0).cloneContents()
    fragment.querySelectorAll('rt').forEach((reading) => reading.remove())
    event.preventDefault()
    event.clipboardData.setData('text/plain', fragment.textContent || '')
  }
  function geometryStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (!layoutMode || event.button !== 0) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    geometryDrag.current = {x: event.clientX, y: event.clientY, box: [...block.box], resize: Boolean((event.target as Element).closest('.bubble-resize-handle'))}
  }
  function geometryMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = geometryDrag.current
    if (!drag) return
    const pageRect = event.currentTarget.parentElement!.getBoundingClientRect()
    const dx = (event.clientX - drag.x) * pageWidth / pageRect.width
    const dy = (event.clientY - drag.y) * pageHeight / pageRect.height
    let [bx1, by1, bx2, by2] = drag.box
    if (drag.resize) { bx2 = Math.max(bx1 + 12, Math.min(pageWidth, bx2 + dx)); by2 = Math.max(by1 + 12, Math.min(pageHeight, by2 + dy)) }
    else { const width = bx2 - bx1, height = by2 - by1; bx1 = Math.max(0, Math.min(pageWidth - width, bx1 + dx)); by1 = Math.max(0, Math.min(pageHeight - height, by1 + dy)); bx2 = bx1 + width; by2 = by1 + height }
    onGeometryChange([bx1, by1, bx2, by2], false)
  }
  function geometryEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = geometryDrag.current; if (!drag) return
    event.currentTarget.releasePointerCapture(event.pointerId); geometryDrag.current = null
    onGeometryChange([...block.box], true, drag.box)
  }
  return (
    <div aria-label={layoutMode ? 'Movable text region' : 'Selectable detected text'} className={`bubble-overlay ${block.vertical ? 'vertical' : ''} ${active ? 'is-pinned' : ''} ${layoutMode ? 'is-layout-editing' : ''}`} style={style} onPointerDown={geometryStart} onPointerMove={geometryMove} onPointerUp={geometryEnd} onPointerCancel={geometryEnd} onDoubleClick={(event) => event.stopPropagation()} onMouseUp={(event) => {
      if (layoutMode) return
      event.stopPropagation()
      const selection = window.getSelection()
      const text = selection?.toString().trim()
      if (text && selection?.rangeCount) {
        const rect = selection.getRangeAt(0).getBoundingClientRect()
        onSelection(text, block.ruby.flat().filter((span) => text.includes(span.base)), block.lines.join(''), rect.right, rect.bottom)
      }
    }}>
      <span className="bubble-overlay__ink" onCopy={copyWithoutNestedRuby}>
        {block.lines.map((line, index) => <Fragment key={index}><span><RubyText text={line} spans={block.ruby[index] || []}/></span></Fragment>)}
      </span>
      <button className="bubble-edit-trigger" aria-label="Edit transcription" title="Edit transcription" onClick={(event) => { event.stopPropagation(); onClick() }}><Pencil size={11}/></button>
      {layoutMode && <span className="bubble-resize-handle" title="Resize region"/>}
    </div>
  )
}

export function Reader({ data: initialData, onExit }: { data: ReaderData; onExit: () => void }) {
  const [data, setData] = useState(initialData)
  const [pageIndex, setPageIndex] = useState(initialData.current_page)
  const [zoom, setZoom] = useState(1)
  const [showOverlays, setShowOverlays] = useState(true)
  const [layoutMode, setLayoutMode] = useState(false)
  const [panning, setPanning] = useState(false)
  const [editor, setEditor] = useState<number | null>(null)
  const [editorDirty,setEditorDirty]=useState(false)
  const [lens, setLens] = useState(false)
  const [lensSeed, setLensSeed] = useState('')
  const [settings, setSettings] = useState(false)
  const [navigator, setNavigator] = useState(false)
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [shortcuts, setShortcuts] = useState(false)
  const [lookupHistory,setLookupHistory]=useState(false)
  const [recentLookups,setRecentLookups]=useState<RecentLookup[]>(()=>{try{return JSON.parse(localStorage.getItem(`komayomi.lookups.${initialData.volume_id}`)||'[]')}catch{return[]}})
  const [fullscreen,setFullscreen]=useState(Boolean(document.fullscreenElement))
  const [searchMatch,setSearchMatch]=useState<{page:number;block:number}|null>(null)
  const [display,setDisplay]=useState<ReaderPreferences>(readerPreferences)
  const [lookup, setLookup] = useState<{text: string; ruby: RubySpan[]; context: string; block: number} | null>(null)
  const [selectionAction, setSelectionAction] = useState<{text: string; ruby: RubySpan[]; context: string; block: number; x: number; y: number} | null>(null)
  const [layoutHistory, setLayoutHistory] = useState<Array<{page:number;block:number;box:[number,number,number,number]}>>([])
  const stageRef = useRef<HTMLElement>(null)
  const dragRef = useRef({ x: 0, y: 0, left: 0, top: 0 })
  const page = data.pages[pageIndex]

  useEffect(()=>{api.bookmarks(data.volume_id).then((items)=>setBookmarks(new Set(items))).catch(()=>undefined)},[data.volume_id])
  useEffect(()=>{const update=(event:Event)=>setDisplay((event as CustomEvent<ReaderPreferences>).detail);window.addEventListener('komayomi:reader-preferences',update);return()=>window.removeEventListener('komayomi:reader-preferences',update)},[])
  useEffect(()=>{for(const index of [pageIndex-1,pageIndex+1]){const source=data.pages[index]?.image_url;if(source){const image=new Image();image.src=source}}},[data.pages,pageIndex])
  useEffect(()=>{const change=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change)},[])

  function move(delta: number) {
    if(!closeEditor())return
    const next = Math.min(data.pages.length - 1, Math.max(0, pageIndex + delta))
    setPageIndex(next);setSearchMatch(null); setLens(false); setNavigator(false);setLookupHistory(false); setSelectionAction(null); setLookup(null)
    api.position(data.volume_id, next).catch(() => undefined)
  }

  function goToPage(next: number,block?:number) {
    if(!closeEditor())return
    setPageIndex(next);setSearchMatch(block===undefined?null:{page:next,block}); setLens(false); setNavigator(false);setLookupHistory(false); setSelectionAction(null); setLookup(null)
    api.position(data.volume_id, next).catch(() => undefined)
  }

  function openLookup() {
    if (!selectionAction) return
    if(!closeEditor())return
    setLookup({text: selectionAction.text, ruby: selectionAction.ruby, context: selectionAction.context, block: selectionAction.block})
    const recent={text:selectionAction.text,context:selectionAction.context,page:pageIndex,createdAt:new Date().toISOString()};setRecentLookups((items)=>{const next=[recent,...items.filter((item)=>!(item.text===recent.text&&item.context===recent.context&&item.page===recent.page))].slice(0,30);localStorage.setItem(`komayomi.lookups.${data.volume_id}`,JSON.stringify(next));return next})
    setLens(false); setNavigator(false); setSettings(false); setSelectionAction(null)
  }

  function closeEditor() {
    if(editor===null)return true
    if(editorDirty&&!window.confirm('Discard your unsaved transcription changes?'))return false
    setEditorDirty(false);setEditor(null);return true
  }

  function toggleBookmark() {
    const active = bookmarks.has(pageIndex)
    setBookmarks((current)=>{const next=new Set(current);active?next.delete(pageIndex):next.add(pageIndex);return next})
    const action = active ? api.removeBookmark(data.volume_id,pageIndex) : api.addBookmark(data.volume_id,pageIndex)
    action.catch(()=>setBookmarks((current)=>{const next=new Set(current);active?next.add(pageIndex):next.delete(pageIndex);return next}))
  }

  async function markReviewed() {
    await api.reviewPage(data.volume_id,pageIndex)
    setData((current)=>({...current,pages:current.pages.map((item,index)=>index===pageIndex?{...item,ocr_quality:{...item.ocr_quality,reviewed:true}}:item)}))
  }
  async function reopenReview(){await api.unreviewPage(data.volume_id,pageIndex);setData((current)=>({...current,pages:current.pages.map((item,index)=>index===pageIndex?{...item,ocr_quality:{...item.ocr_quality,reviewed:false}}:item)}))}

  function reopenLookup(item:RecentLookup){if(!closeEditor())return;setPageIndex(item.page);api.position(data.volume_id,item.page).catch(()=>undefined);setLookup({text:item.text,context:item.context,ruby:[],block:-1});setLookupHistory(false);setLens(false);setNavigator(false);setSettings(false)}

  async function toggleFullscreen(){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowLeft') move(1)
      if (event.key === 'ArrowRight') move(-1)
      if (event.key === 'Escape') { if(!closeEditor())return;setLens(false); setNavigator(false);setLookupHistory(false); setSettings(false); setLookup(null); setShortcuts(false) }
      if (event.key === '?' ) setShortcuts((value)=>!value)
      if (event.key.toLowerCase() === 'g') { if(!closeEditor())return;setNavigator(true); setLens(false); setSettings(false); setLookup(null) }
      if (event.key.toLowerCase() === 'l') { if(!closeEditor())return;setLens(true); setLensSeed(''); setNavigator(false); setSettings(false) }
      if (event.key.toLowerCase() === 'b') toggleBookmark()
      if (event.key.toLowerCase() === 'o') setShowOverlays((value)=>!value)
      if (event.key === '+' || event.key === '=') zoomAt(zoom + .1)
      if (event.key === '-') zoomAt(zoom - .1)
      if (event.key === '0') zoomAt(1)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const selectedBlock = useMemo(() => editor === null ? null : page.blocks[editor], [editor, page])

  function saveBlock(lines: string[], ruby: RubySpan[][]) {
    if (editor === null) return
    setData((current) => ({...current, pages: current.pages.map((item, p) => p !== pageIndex ? item : ({
      ...item, blocks: item.blocks.map((block, b) => b !== editor ? block : ({...block, lines, ruby})),
    }))}))
  }

  function changeGeometry(blockIndex: number, box: [number, number, number, number], commit: boolean, original?: [number, number, number, number]) {
    setData((current) => ({...current, pages: current.pages.map((item, p) => p !== pageIndex ? item : ({...item, blocks: item.blocks.map((block, b) => b === blockIndex ? {...block, box} : block)}))}))
    if (commit) { if(original)setLayoutHistory((items)=>[...items,{page:pageIndex,block:blockIndex,box:original}]); api.blockGeometry(data.volume_id, pageIndex, blockIndex, box).catch(() => undefined) }
  }

  function undoLayout(){const previous=layoutHistory.at(-1);if(!previous)return;setData((current)=>({...current,pages:current.pages.map((item,p)=>p!==previous.page?item:({...item,blocks:item.blocks.map((block,b)=>b===previous.block?{...block,box:previous.box}:block)}))}));api.blockGeometry(data.volume_id,previous.page,previous.block,previous.box).catch(()=>undefined);setLayoutHistory((items)=>items.slice(0,-1))}

  function beginPan(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    const target = event.target as Element
    // OCR regions own their gestures: drag selects text and the pencil edits.
    // Everywhere else in the reading canvas owns drag-to-pan.
    if (target.closest('.bubble-overlay, button, input, textarea, select, a')) return
    const stage = stageRef.current
    if (!stage) return
    event.preventDefault(); stage.setPointerCapture(event.pointerId); setPanning(true)
    dragRef.current = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop }
  }

  function movePan(event: ReactPointerEvent<HTMLElement>) {
    if (!panning) return
    const stage = stageRef.current
    if (!stage) return
    stage.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x)
    stage.scrollTop = dragRef.current.top - (event.clientY - dragRef.current.y)
  }

  function endPan(event: ReactPointerEvent<HTMLElement>) {
    if (!panning) return
    stageRef.current?.releasePointerCapture(event.pointerId); setPanning(false)
  }

  function zoomAt(next: number, clientX?: number, clientY?: number) {
    const stage = stageRef.current
    const bounded = Math.min(2.5, Math.max(.6, next))
    if (!stage || bounded === zoom) return setZoom(bounded)
    const rect = stage.getBoundingClientRect()
    const x = (clientX ?? rect.left + rect.width / 2) - rect.left + stage.scrollLeft
    const y = (clientY ?? rect.top + rect.height / 2) - rect.top + stage.scrollTop
    const ratio = bounded / zoom
    setZoom(bounded)
    requestAnimationFrame(() => { stage.scrollLeft = x * ratio - ((clientX ?? rect.left + rect.width / 2) - rect.left); stage.scrollTop = y * ratio - ((clientY ?? rect.top + rect.height / 2) - rect.top) })
  }

  function wheelZoom(event: ReactWheelEvent<HTMLElement>) {
    event.preventDefault()
    // A two-finger vertical trackpad scroll reports deltaY: upward is negative.
    // Mouse wheels get the same predictable behavior.
    zoomAt(zoom * Math.exp(-event.deltaY * .0035), event.clientX, event.clientY)
  }

  return (
    <main className="reader-shell" style={{'--tool-panel-width':`${display.panelWidth}px`} as CSSProperties}>
      <header className="reader-header">
        <div className="reader-header__left"><button className="icon-button dark" onClick={()=>{if(closeEditor())onExit()}}><ArrowLeft size={19}/></button><Brand compact/><div className="reader-title"><span>{data.title}</span><strong>{data.volume}</strong></div></div>
        <button className="reader-progress" title="Browse pages" onClick={()=>{if(!closeEditor())return;setNavigator(true);setLens(false);setLookup(null);setSettings(false);setLookupHistory(false)}}><span>{String(pageIndex + 1).padStart(3, '0')}</span><div><i style={{width: `${(pageIndex + 1) / data.pages.length * 100}%`}}/></div><span>{String(data.pages.length).padStart(3, '0')}</span></button>
        <div className="reader-tools">
          <button className={showOverlays ? 'active' : ''} onClick={() => setShowOverlays(!showOverlays)} title="Toggle text overlays"><Highlighter size={18}/></button>
          <button className={layoutMode ? 'active layout-tool' : 'layout-tool'} onClick={() => { if(!closeEditor())return;setLayoutMode(!layoutMode); setShowOverlays(true); setLens(false); setNavigator(false); setLookup(null);setLookupHistory(false); setSelectionAction(null) }} title="Edit text region layout"><Move size={18}/></button>
          <button onClick={() => zoomAt(zoom - .1)}><ZoomOut size={18}/></button>
          <button onClick={() => zoomAt(zoom + .1)}><ZoomIn size={18}/></button>
          <button className={lens ? 'active lens-tool' : 'lens-tool'} onClick={() => { if(!closeEditor())return;setLens(!lens); setLensSeed(''); setNavigator(false); setSettings(false);setLookupHistory(false) }}><Eye size={18}/><span>Page Lens</span></button>
          <button className={navigator?'active':''} title="Browse pages" onClick={()=>{if(!closeEditor())return;setNavigator(!navigator);setLens(false);setLookup(null);setSettings(false);setLookupHistory(false)}}><Grid3X3 size={18}/></button>
          <button className={bookmarks.has(pageIndex)?'active':''} title={bookmarks.has(pageIndex)?'Remove page bookmark':'Bookmark this page'} onClick={toggleBookmark}><Bookmark size={18} fill={bookmarks.has(pageIndex)?'currentColor':'none'}/></button>
          <button className={lookupHistory?'active':''} title="Recent lookups" onClick={()=>{if(!closeEditor())return;setLookupHistory(!lookupHistory);setSettings(false);setLens(false);setNavigator(false);setLookup(null)}}><Clock3 size={18}/></button>
          <button className={settings?'active':''} title="Reader settings" onClick={()=>{if(!closeEditor())return;setSettings(!settings);setLens(false);setNavigator(false);setLookup(null);setLookupHistory(false)}}><Settings2 size={18}/></button>
          <button title={fullscreen?'Exit full screen':'Enter full screen'} onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>
          <button title="Keyboard shortcuts (?)" onClick={()=>setShortcuts(true)}><CircleHelp size={18}/></button>
        </div>
      </header>

      <section ref={stageRef} className={`reader-stage ${(editor !== null || lens || lookup || settings || navigator || lookupHistory) ? 'with-panel' : ''} ${panning ? 'is-panning' : ''}`} onMouseDown={() => setSelectionAction(null)} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onWheel={wheelZoom}>
        {layoutMode && <div className="layout-mode-banner"><Move size={15}/><div><strong>Layout edit</strong><span>Drag a region to move it · pull its corner to resize · changes save on release</span></div><button onClick={undoLayout} disabled={!layoutHistory.length}><Undo2 size={13}/> Undo</button><button onClick={() => setLayoutMode(false)}>Done</button></div>}
        {page.ocr_quality?.suspicious && !page.ocr_quality.reviewed && (
          <div className="ocr-warning">
            <span>OCR uncertain</span>
            <p>This page has overlapping or unusually large text regions.</p>
            <div><button onClick={() => { if(!closeEditor())return;setLens(true) }}>Repair with Page Lens</button><button onClick={markReviewed}>Mark reviewed</button></div>
          </div>
        )}
        {page.ocr_quality?.suspicious&&page.ocr_quality.reviewed&&<div className="ocr-reviewed-chip"><Check size={12}/> OCR reviewed <button onClick={reopenReview}>Reopen issue</button></div>}
        <button className="page-turn page-turn--prev" onClick={() => move(-1)} disabled={pageIndex === 0}><ChevronRight/></button>
        <div className="page-wrap" style={{
          width: `calc((100vh - 172px) * ${page.img_width / page.img_height} * ${zoom})`,
          height: `calc((100vh - 172px) * ${zoom})`,
        }}>
          <img src={page.image_url} alt={`Page ${pageIndex + 1}`}/>
          {showOverlays && page.blocks.map((block, index) => <BubbleOverlay key={index} block={block} pageWidth={page.img_width} pageHeight={page.img_height} textScale={display.overlayScale} active={layoutMode || selectionAction?.block === index || lookup?.block === index || (searchMatch?.page===pageIndex&&searchMatch.block===index)} layoutMode={layoutMode} onGeometryChange={(box, commit) => changeGeometry(index, box, commit)} onSelection={(text, ruby, context, x, y) => setSelectionAction({text, ruby, context, block: index, x, y})} onClick={() => { if(!closeEditor())return;setEditor(index); setLens(false); setNavigator(false); setLookup(null); setSelectionAction(null) }}/>) }
        </div>
        <button className="page-turn page-turn--next" onClick={() => move(1)} disabled={pageIndex === data.pages.length - 1}><ChevronLeft/></button>
      </section>

      {selectedBlock && <BubbleEditor volumeId={data.volume_id} pageIndex={pageIndex} blockIndex={editor!} block={selectedBlock} onClose={closeEditor} onSaved={saveBlock} onDirtyChange={setEditorDirty}/>}
      {lens && <PageLens
        volumeId={data.volume_id}
        page={pageIndex}
        pageData={page}
        initialQuestion={lensSeed}
        onClose={() => setLens(false)}
        onPageApplied={() => { api.reader(data.volume_id).then(setData).catch(() => undefined) }}
      />}
      {settings && <SettingsPanel onClose={()=>setSettings(false)}/>}
      {navigator && <PageNavigator volumeId={data.volume_id} pages={data.pages} current={pageIndex} bookmarks={bookmarks} onChoose={goToPage} onClose={()=>setNavigator(false)}/>}
      {lookupHistory&&<LookupHistoryPanel items={recentLookups} onChoose={reopenLookup} onClose={()=>setLookupHistory(false)} onClear={()=>{setRecentLookups([]);localStorage.removeItem(`komayomi.lookups.${data.volume_id}`)}}/>}
      {shortcuts && <ShortcutGuide onClose={()=>setShortcuts(false)}/>}
      {selectionAction && !editor && <button className="selection-action" style={{left: Math.min(selectionAction.x, window.innerWidth - 150), top: Math.min(selectionAction.y + 8, window.innerHeight - 48)}} onMouseDown={(event) => event.stopPropagation()} onClick={openLookup}><Search size={13}/> Look up <span>{selectionAction.text}</span></button>}
      {lookup && editor === null && !lens && !navigator && !settings && <LookupPanel query={lookup.text} sentence={lookup.context} rubySpans={lookup.ruby} volumeId={data.volume_id} pageIndex={pageIndex} onClose={() => setLookup(null)} onAskAI={(sentence,focus)=>{setLensSeed(`Explain “${focus}” in this block:\n${sentence}`);setLookup(null);setLens(true)}}/>}

      <footer className="reader-footer"><span><LibraryIcon size={14}/> {data.title}</span><span>← next page · previous page →</span><button onClick={()=>setNavigator(true)}><BookOpen size={14}/> {pageIndex + 1} / {data.pages.length}</button></footer>
    </main>
  )
}
