import { Check, RefreshCw, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import type { LlmStatus, RubySpan, TextBlock, VisionProposal } from '../types'
import { preferredProvider } from '../preferences'
import { AiProviderStatus } from './AiProviderStatus'

export function BubbleEditor({ volumeId, pageIndex, blockIndex, block, onClose, onSaved, onDirtyChange }: {
  volumeId: string
  pageIndex: number
  blockIndex: number
  block: TextBlock
  onClose: () => void
  onSaved: (lines: string[], ruby: RubySpan[][]) => void
  onDirtyChange:(dirty:boolean)=>void
}) {
  const [lines, setLines] = useState([...block.lines])
  const [ruby, setRuby] = useState<RubySpan[][]>(block.lines.map((_,index) => [...(block.ruby[index] || [])]))
  const [markups, setMarkups] = useState(() => block.lines.map((line, index) => toMarkup(line, block.ruby[index] || [])))
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<LlmStatus | null>(null)
  const [provider, setProvider] = useState('')
  const [proposal, setProposal] = useState<VisionProposal | null>(null)
  const [visionError, setVisionError] = useState('')
  const [visionBusy, setVisionBusy] = useState(false)

  useEffect(() => {
    setLines([...block.lines])
    setRuby(block.lines.map((_,index) => [...(block.ruby[index] || [])]))
    setMarkups(block.lines.map((line, index) => toMarkup(line, block.ruby[index] || [])))
    onDirtyChange(false)
  }, [block])

  useEffect(() => { api.llmStatus().then((value) => { setStatus(value); setProvider(preferredProvider(value)) }).catch(() => undefined) }, [])

  function updateRuby(line: number, raw: string) {
    onDirtyChange(true)
    setMarkups((current) => current.map((item, index) => index === line ? raw : item))
    const spans = Array.from(raw.matchAll(/\{([^{}|]+)\|([^{}]+)\}/g)).map((match) => ({
      base: match[1].trim(), reading: match[2].trim(), printed: true,
    })).filter((span) => span.base && span.reading)
    setRuby((current) => current.map((item, index) => index === line ? spans : item))
  }

  async function save() {
    await api.blockText(volumeId, pageIndex, blockIndex, lines, ruby)
    setSaved(true); onSaved(lines, ruby);onDirtyChange(false)
    window.setTimeout(() => setSaved(false), 1400)
  }

  async function reprocess() {
    setVisionBusy(true); setVisionError(''); setProposal(null)
    try { setProposal(await api.visionBlock(volumeId, pageIndex, blockIndex, provider)) }
    catch (error) { setVisionError(error instanceof Error ? error.message : 'Vision reprocessing failed.') }
    finally { setVisionBusy(false) }
  }

  function acceptProposal() {
    if (!proposal) return
    const proposed = proposal.proposal.lines
    const nextLines = proposed.map((line) => line.text)
    const nextRuby = proposed.map((line) => line.ruby.map(({base, reading, printed}) => ({base, reading, printed})))
    setLines(nextLines); setRuby(nextRuby); setMarkups(nextLines.map((line, index) => toMarkup(line, nextRuby[index])))
    setProposal(null);onDirtyChange(true)
  }

  return (
    <aside className="tool-panel bubble-editor">
      <header><div><span className="eyebrow">TRANSCRIPTION</span><h2>Bubble {blockIndex + 1}</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
      <p className="muted">The original OCR stays preserved. Your correction becomes the canonical reading everywhere else.</p>
      <div className="editor-lines">
        {lines.map((line, index) => (
          <div className="editor-line" key={index}>
            <div className="editor-line__number">{String(index + 1).padStart(2, '0')}</div>
            <label><span>Canonical Japanese</span><textarea value={line} onChange={(e) => {onDirtyChange(true);setLines((current) => current.map((item, i) => i === index ? e.target.value : item))}}/></label>
            <div className="raw-ocr"><span>RAW OCR</span>{block.raw_lines[index] ?? 'New line from vision'}</div>
            <label className="ruby-field"><span>Furigana markup <i>{'{kanji|reading}'} inside the full sentence</i></span><input value={markups[index]} onChange={(e) => updateRuby(index, e.target.value)} placeholder="{食|た}べる"/></label>
            <div className="ruby-preview"><span>PREVIEW</span><p>{renderRuby(lines[index], ruby[index] || [])}</p></div>
          </div>
        ))}
      </div>
      <div className="panel-actions">
        <button className="secondary-button" onClick={reprocess} disabled={visionBusy || !provider} title={!provider ? 'Configure an API key in .env' : 'Sends only this cropped region after you click'}><RefreshCw className={visionBusy ? 'spin' : ''} size={16}/> {visionBusy ? 'Reading crop…' : 'Reprocess with vision'}</button>
        <button className="primary-button" onClick={save}>{saved ? <><Check size={17}/> Saved</> : 'Save correction'}</button>
      </div>
      <div className="provider-row"><ShieldCheck size={14}/><span>Nothing is sent until you click.</span></div>
      <AiProviderStatus status={status} provider={provider}/>
      {visionError && <div className="error-note">{visionError}</div>}
      {proposal && <section className="vision-proposal"><span className="eyebrow">VISION PROPOSAL · NOT SAVED</span><p>{proposal.proposal.summary}</p>{proposal.proposal.lines.map((line, index) => <div key={index}><small>{Math.round(line.confidence * 100)}% confidence</small><strong>{renderRuby(line.text, line.ruby)}</strong></div>)}<button className="primary-button" onClick={acceptProposal}><Check size={16}/> Use this proposal in editor</button><button className="text-button" onClick={() => setProposal(null)}>Discard</button></section>}
        <button className="text-button" onClick={() => { onDirtyChange(true);setLines([...block.raw_lines]); setRuby(block.raw_lines.map(() => [])); setMarkups([...block.raw_lines]) }}><RotateCcw size={14}/> Restore raw OCR</button>
    </aside>
  )
}

function toMarkup(text: string, spans: RubySpan[]): string {
  let cursor = 0
  let result = ''
  for (const span of spans) {
    const position = text.indexOf(span.base, cursor)
    if (position < 0) continue
    result += text.slice(cursor, position) + `{${span.base}|${span.reading}}`
    cursor = position + span.base.length
  }
  return result + text.slice(cursor)
}

function renderRuby(text: string, spans: RubySpan[]) {
  if (!spans.length) return text
  let cursor = 0
  const nodes: ReactNode[] = []
  for (const [index, span] of spans.entries()) {
    const position = text.indexOf(span.base, cursor)
    if (position < 0) continue
    nodes.push(<Fragment key={`plain-${index}`}>{text.slice(cursor, position)}</Fragment>)
    nodes.push(<ruby key={`ruby-${index}`}>{span.base}<rt>{span.reading}</rt></ruby>)
    cursor = position + span.base.length
  }
  nodes.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>)
  return nodes
}
