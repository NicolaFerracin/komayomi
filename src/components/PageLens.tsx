import { Eye, LoaderCircle, MessageCircle, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { LensAnalysis, LlmStatus, MangaPage, PageVisionProposal } from '../types'
import { preferredProvider } from '../preferences'

export function PageLens({ volumeId, page, pageData, onClose, onPageApplied }: { volumeId: string; page: number; pageData: MangaPage; onClose: () => void; onPageApplied: () => void }) {
  const [status, setStatus] = useState<LlmStatus | null>(null)
  const [provider, setProvider] = useState('')
  const [includeNext, setIncludeNext] = useState(false)
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<LensAnalysis | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pageVision, setPageVision] = useState<PageVisionProposal | null>(null)
  const [visionBusy, setVisionBusy] = useState(false)
  useEffect(() => { api.llmStatus().then((value) => { setStatus(value); setProvider(preferredProvider(value)) }).catch((error) => setMessage(error.message)) }, [])
  async function analyze() {
    setBusy(true); setMessage('')
    try { setResult(await api.pageLens(volumeId, page, provider, includeNext, question)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Page Lens is not configured.') }
    finally { setBusy(false) }
  }
  async function reprocessPage() {
    setVisionBusy(true); setMessage(''); setPageVision(null)
    try { setPageVision(await api.visionPage(volumeId, page, provider)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Page OCR failed.') }
    finally { setVisionBusy(false) }
  }
  async function applyPage() {
    if (!pageVision) return
    await api.applyVisionPage(volumeId, page, pageVision.proposal.blocks); onPageApplied(); onClose()
  }
  return (
    <aside className="tool-panel page-lens">
      <header><div><span className="eyebrow">OPT-IN CONTEXT</span><h2>Page Lens</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
      {!result && <><div className="lens-orbit"><div><Eye size={30}/></div><i/><i/><i/></div><h3>See what sits beneath the words.</h3>
      <p>Notice creative furigana, wordplay, register, cultural references, and relationships between dialogue and artwork.</p></>}
      <div className="privacy-note"><ShieldCheck size={18}/><div><strong>{result ? 'This analysis was explicitly requested.' : 'Nothing has been shared.'}</strong><span>Only after you click Analyze: this page image, its transcript, and the previous page transcript are sent. The next page stays off by default.</span></div></div>
      {status && <label className="provider-select"><span>VISION PROVIDER</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">No provider configured</option>{status.providers.map((item) => <option key={item.id} disabled={!item.configured} value={item.id}>{item.name} · {item.model}{!item.configured ? ' (no key)' : ''}</option>)}</select></label>}
      <label className="spoiler-toggle"><input type="checkbox" checked={includeNext} onChange={(event) => setIncludeNext(event.target.checked)}/><span/><div><strong>Include next page</strong><small>Off by default to avoid spoilers</small></div></label>
      <label className="lens-question"><span><MessageCircle size={13}/> OPTIONAL QUESTION</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Why does this character use that reading?"/></label>
      {message && <div className="error-note">{message}</div>}
      <button className="lens-button" onClick={analyze} disabled={busy || !provider}>{busy ? <><LoaderCircle className="spin" size={17}/> Analyzing…</> : <><Sparkles size={17}/>{result ? 'Analyze again' : 'Analyze this page'}</>}</button>
      <div className="page-vision-action"><div><strong>OCR &amp; layout repair</strong><span>Find all regions and their reading direction. You review before replacing Mokuro’s result.</span></div><button className="secondary-button" onClick={reprocessPage} disabled={visionBusy || !provider}>{visionBusy ? <LoaderCircle className="spin" size={15}/> : <Eye size={15}/>} Re-read full page</button></div>
      {pageVision && <section className="page-vision-proposal"><span className="eyebrow">PAGE PROPOSAL · NOT APPLIED</span><h3>{pageVision.proposal.summary}</h3><p>{pageVision.proposal.blocks.length} text regions found · {pageVision.proposal.blocks.filter((block) => block.vertical).length} vertical · {pageVision.proposal.blocks.filter((block) => !block.vertical).length} horizontal</p><div className="page-vision-map"><img src={pageData.image_url} alt="Proposed OCR layout"/>{pageVision.proposal.blocks.map((block, index) => <i key={index} title={block.lines.map((line) => line.text).join(' / ')} style={{left:`${block.box[0]/10}%`,top:`${block.box[1]/10}%`,width:`${(block.box[2]-block.box[0])/10}%`,height:`${(block.box[3]-block.box[1])/10}%`}}><b>{index+1}</b></i>)}</div><div className="page-vision-transcript">{pageVision.proposal.blocks.map((block, index) => <span key={index}><b>{index + 1}</b>{block.lines.map((line) => line.text).join(' / ')}</span>)}</div><button className="primary-button" onClick={applyPage}><Sparkles size={15}/> Replace page regions</button><button className="text-button" onClick={() => setPageVision(null)}>Discard proposal</button></section>}
      {result && <section className="lens-results"><div className="lens-result-meta">{result.provider} · {result.model}{result.cached && ' · cached'}</div><h3>{result.analysis.summary}</h3>{result.analysis.notes.map((note, index) => <article key={index}><span>{note.type} · {Math.round(note.confidence * 100)}%</span><h4>{note.title}</h4><p>{note.explanation}</p><blockquote>{note.evidence}</blockquote></article>)}{!result.analysis.notes.length && <p className="muted">Nothing noteworthy was found on this page—and that is a useful answer too.</p>}</section>}
    </aside>
  )
}
