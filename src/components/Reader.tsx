import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Eye, Highlighter, Library as LibraryIcon, Move, Pencil, Search, Settings2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
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

function BubbleOverlay({ block, pageWidth, pageHeight, active, layoutMode, onClick, onSelection, onGeometryChange }: {
  block: TextBlock; pageWidth: number; pageHeight: number; onClick: () => void
  onSelection: (text: string, ruby: RubySpan[], context: string, x: number, y: number) => void
  active: boolean; layoutMode: boolean; onGeometryChange: (box: [number, number, number, number], commit: boolean, original?: [number, number, number, number]) => void
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
    '--ocr-size': `${Math.max(1.25, block.font_size / pageWidth * 100)}cqw`,
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
  const [lens, setLens] = useState(false)
  const [settings, setSettings] = useState(false)
  const [lookup, setLookup] = useState<{text: string; ruby: RubySpan[]; context: string; block: number} | null>(null)
  const [selectionAction, setSelectionAction] = useState<{text: string; ruby: RubySpan[]; context: string; block: number; x: number; y: number} | null>(null)
  const [layoutHistory, setLayoutHistory] = useState<Array<{page:number;block:number;box:[number,number,number,number]}>>([])
  const stageRef = useRef<HTMLElement>(null)
  const dragRef = useRef({ x: 0, y: 0, left: 0, top: 0 })
  const page = data.pages[pageIndex]

  function move(delta: number) {
    const next = Math.min(data.pages.length - 1, Math.max(0, pageIndex + delta))
    setPageIndex(next); setEditor(null); setLens(false); setSelectionAction(null); setLookup(null)
    api.position(data.volume_id, next).catch(() => undefined)
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') move(1)
      if (event.key === 'ArrowRight') move(-1)
      if (event.key === 'Escape' && (editor !== null || lens)) { setEditor(null); setLens(false) }
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
    <main className="reader-shell">
      <header className="reader-header">
        <div className="reader-header__left"><button className="icon-button dark" onClick={onExit}><ArrowLeft size={19}/></button><Brand compact/><div className="reader-title"><span>{data.title}</span><strong>{data.volume}</strong></div></div>
        <div className="reader-progress"><span>{String(pageIndex + 1).padStart(3, '0')}</span><div><i style={{width: `${(pageIndex + 1) / data.pages.length * 100}%`}}/></div><span>{String(data.pages.length).padStart(3, '0')}</span></div>
        <div className="reader-tools">
          <button className={showOverlays ? 'active' : ''} onClick={() => setShowOverlays(!showOverlays)} title="Toggle text overlays"><Highlighter size={18}/></button>
          <button className={layoutMode ? 'active layout-tool' : 'layout-tool'} onClick={() => { setLayoutMode(!layoutMode); setShowOverlays(true); setEditor(null); setLens(false); setLookup(null); setSelectionAction(null) }} title="Edit text region layout"><Move size={18}/></button>
          <button onClick={() => zoomAt(zoom - .1)}><ZoomOut size={18}/></button>
          <button onClick={() => zoomAt(zoom + .1)}><ZoomIn size={18}/></button>
          <button className={lens ? 'active lens-tool' : 'lens-tool'} onClick={() => { setLens(!lens); setEditor(null) }}><Eye size={18}/><span>Page Lens</span></button>
          <button className={settings?'active':''} title="Reader settings" onClick={()=>{setSettings(!settings);setLens(false);setEditor(null);setLookup(null)}}><Settings2 size={18}/></button>
        </div>
      </header>

      <section ref={stageRef} className={`reader-stage ${(editor !== null || lens || lookup || settings) ? 'with-panel' : ''} ${panning ? 'is-panning' : ''}`} onMouseDown={() => setSelectionAction(null)} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onWheel={wheelZoom}>
        {layoutMode && <div className="layout-mode-banner"><Move size={15}/><div><strong>Layout edit</strong><span>Drag a region to move it · pull its corner to resize · changes save on release</span></div><button onClick={undoLayout} disabled={!layoutHistory.length}><Undo2 size={13}/> Undo</button><button onClick={() => setLayoutMode(false)}>Done</button></div>}
        {page.ocr_quality?.suspicious && (
          <div className="ocr-warning">
            <span>OCR uncertain</span>
            <p>This page has overlapping or unusually large text regions.</p>
            <button onClick={() => { setLens(true); setEditor(null) }}>Page-level vision will help</button>
          </div>
        )}
        <button className="page-turn page-turn--prev" onClick={() => move(-1)} disabled={pageIndex === 0}><ChevronRight/></button>
        <div className="page-wrap" style={{
          width: `calc((100vh - 172px) * ${page.img_width / page.img_height} * ${zoom})`,
          height: `calc((100vh - 172px) * ${zoom})`,
        }}>
          <img src={page.image_url} alt={`Page ${pageIndex + 1}`}/>
          {showOverlays && page.blocks.map((block, index) => <BubbleOverlay key={index} block={block} pageWidth={page.img_width} pageHeight={page.img_height} active={layoutMode || selectionAction?.block === index || lookup?.block === index} layoutMode={layoutMode} onGeometryChange={(box, commit) => changeGeometry(index, box, commit)} onSelection={(text, ruby, context, x, y) => setSelectionAction({text, ruby, context, block: index, x, y})} onClick={() => { setEditor(index); setLens(false); setLookup(null); setSelectionAction(null) }}/>) }
        </div>
        <button className="page-turn page-turn--next" onClick={() => move(1)} disabled={pageIndex === data.pages.length - 1}><ChevronLeft/></button>
      </section>

      {selectedBlock && <BubbleEditor volumeId={data.volume_id} pageIndex={pageIndex} blockIndex={editor!} block={selectedBlock} onClose={() => setEditor(null)} onSaved={saveBlock}/>} 
      {lens && <PageLens
        volumeId={data.volume_id}
        page={pageIndex}
        pageData={page}
        onClose={() => setLens(false)}
        onPageApplied={() => { api.reader(data.volume_id).then(setData).catch(() => undefined) }}
      />}
      {settings && <SettingsPanel onClose={()=>setSettings(false)}/>}
      {selectionAction && !editor && !lens && <button className="selection-action" style={{left: Math.min(selectionAction.x, window.innerWidth - 150), top: Math.min(selectionAction.y + 8, window.innerHeight - 48)}} onMouseDown={(event) => event.stopPropagation()} onClick={() => { setLookup({text: selectionAction.text, ruby: selectionAction.ruby, context: selectionAction.context, block: selectionAction.block}); setSelectionAction(null) }}><Search size={13}/> Look up <span>{selectionAction.text}</span></button>}
      {lookup && editor === null && !lens && <LookupPanel query={lookup.text} sentence={lookup.context} rubySpans={lookup.ruby} onClose={() => setLookup(null)}/>}

      <footer className="reader-footer"><span><LibraryIcon size={14}/> {data.title}</span><span>← next page · previous page →</span><span><BookOpen size={14}/> {pageIndex + 1} / {data.pages.length}</span></footer>
    </main>
  )
}
