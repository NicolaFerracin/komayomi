import { Eye, History, LoaderCircle, MessageCircle, ScanText, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AiHistoryItem, LensAnalysis, LlmStatus, MangaPage, PageVisionProposal } from '../types'
import { preferredProvider } from '../preferences'
import { AiProviderStatus } from './AiProviderStatus'
import { MeaningResults } from './MeaningResults'

export function PageLens({ volumeId, page, pageData, initialQuestion='', onClose, onPageApplied }: { volumeId: string; page: number; pageData: MangaPage; initialQuestion?:string; onClose: () => void; onPageApplied: () => void }) {
  const [status, setStatus] = useState<LlmStatus | null>(null)
  const [provider, setProvider] = useState('')
  const [includeNext, setIncludeNext] = useState(false)
  const [question, setQuestion] = useState(initialQuestion)
  const [history,setHistory]=useState<AiHistoryItem[]>([])
  const [openHistory,setOpenHistory]=useState<string|null>(null)
  const [result, setResult] = useState<LensAnalysis | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pageVision, setPageVision] = useState<PageVisionProposal | null>(null)
  const [visionBusy, setVisionBusy] = useState(false)
  useEffect(() => { api.llmStatus().then((value) => { setStatus(value); setProvider(preferredProvider(value)) }).catch((error) => setMessage(error.message)) }, [])
  useEffect(()=>{api.aiHistory(volumeId,page).then(setHistory).catch(()=>undefined)},[volumeId,page,result])
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
  async function removeHistory(item: AiHistoryItem) {
    if(!window.confirm('Delete this saved AI query? This cannot be undone.'))return
    await api.deleteAiHistory(volumeId,page,item.kind,item.id)
    setHistory((items)=>items.filter((saved)=>saved.id!==item.id));if(openHistory===item.id)setOpenHistory(null)
  }
  return (
    <aside className="tool-panel page-lens">
      <header><div><span className="eyebrow">OPT-IN CONTEXT</span><h2>Page Lens</h2></div><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={19}/></button></header>
      {!result && <><div className="lens-orbit"><div><Eye size={30}/></div><i/><i/><i/></div><h3>See what sits beneath the words.</h3>
      <p>Notice creative furigana, wordplay, register, cultural references, and relationships between dialogue and artwork.</p></>}
      <div className="privacy-note"><ShieldCheck size={18}/><div><strong>{result ? 'This analysis was explicitly requested.' : 'Nothing has been shared.'}</strong><span>External processing happens only when you click an action below.</span></div></div>
      <AiProviderStatus status={status} provider={provider}/>
      <section className="lens-task lens-task--analyze"><div className="lens-task__title"><Sparkles size={19}/><div><span>UNDERSTAND</span><h3>Analyze meaning &amp; context</h3></div></div><p>Explain language, unusual readings, wordplay, cultural references, and how the dialogue relates to the artwork.</p><label className="lens-question"><span><MessageCircle size={13}/> WHAT SHOULD IT FOCUS ON? <i>optional</i></span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Leave blank for a general page analysis, or ask a specific question."/></label><label className="spoiler-toggle"><input type="checkbox" checked={includeNext} onChange={(event) => setIncludeNext(event.target.checked)}/><span/><div><strong>Include next page for context</strong><small>Off by default to avoid spoilers</small></div></label><button className="lens-button" onClick={analyze} disabled={busy || !provider}>{busy ? <><LoaderCircle className="spin" size={17}/> Analyzing…</> : <><Sparkles size={17}/>{result ? 'Analyze again' : 'Analyze meaning & context'}</>}</button></section>
      {message && <div className="error-note">{message}</div>}
      {result && <section className="lens-results"><div className="lens-result-meta">ANALYSIS RESULT · {result.provider} · {result.model}{result.cached && ' · cached'}</div><h3>{result.analysis.summary}</h3>{result.analysis.notes.map((note, index) => <article key={index}><span>{note.type} · {Math.round(note.confidence * 100)}%</span><h4>{note.title}</h4><p>{note.explanation}</p><blockquote>{note.evidence}</blockquote></article>)}{!result.analysis.notes.length && <p className="muted">Nothing noteworthy was found on this page—and that is a useful answer too.</p>}</section>}
      <section className="lens-task lens-task--repair"><div className="lens-task__title"><ScanText size={19}/><div><span>REPAIR</span><h3>Fix OCR &amp; text placement</h3></div></div><p>Re-detect every text region and its reading direction. This does not change the page until you review and apply the proposal.</p><button className="secondary-button" onClick={reprocessPage} disabled={visionBusy || !provider}>{visionBusy ? <LoaderCircle className="spin" size={15}/> : <Eye size={15}/>} Create OCR proposal</button></section>
      {pageVision && <section className="page-vision-proposal"><span className="eyebrow">PAGE PROPOSAL · NOT APPLIED</span><h3>{pageVision.proposal.summary}</h3><p>{pageVision.proposal.blocks.length} text regions found · {pageVision.proposal.blocks.filter((block) => block.vertical).length} vertical · {pageVision.proposal.blocks.filter((block) => !block.vertical).length} horizontal</p><div className="page-vision-map"><img src={pageData.image_url} alt="Proposed OCR layout"/>{pageVision.proposal.blocks.map((block, index) => <i key={index} title={block.lines.map((line) => line.text).join(' / ')} style={{left:`${block.box[0]/10}%`,top:`${block.box[1]/10}%`,width:`${(block.box[2]-block.box[0])/10}%`,height:`${(block.box[3]-block.box[1])/10}%`}}><b>{index+1}</b></i>)}</div><div className="page-vision-transcript">{pageVision.proposal.blocks.map((block, index) => <span key={index}><b>{index + 1}</b>{block.lines.map((line) => line.text).join(' / ')}</span>)}</div><button className="primary-button" onClick={applyPage}><Sparkles size={15}/> Replace page regions</button><button className="text-button" onClick={() => setPageVision(null)}>Discard proposal</button></section>}
      <section className="lens-task lens-task--history"><div className="lens-task__title"><History size={19}/><div><span>RECOVER</span><h3>Past AI queries</h3></div></div><p>Reopen page analyses, focused explanations, and Meaning Checks saved for this page.</p><div className="ai-history"><div className="section-rule"><span>{history.length} SAVED</span></div>{!history.length&&<p>No AI questions saved for this page yet.</p>}{history.map((item)=><article key={item.id}><div className="ai-history__head"><button onClick={()=>setOpenHistory(openHistory===item.id?null:item.id)}><span>{item.kind==='page'?'PAGE':item.kind==='comprehension'?'MEANING CHECK':'SELECTION'} · {new Date(item.created_at).toLocaleString()}</span><strong>{item.question}</strong></button><button title="Delete saved query" onClick={()=>removeHistory(item)}><Trash2 size={14}/></button></div>{openHistory===item.id&&item.kind==='comprehension'&&item.details?.evaluations&&<MeaningResults summary={item.details.summary||item.answer} evaluations={item.details.evaluations} answers={Object.fromEntries((item.details.answers||[]).map((answer)=>[answer.block_index,answer.interpretation]))}/>} {openHistory===item.id&&item.kind!=='comprehension'&&<div className="ai-history__result"><small>{item.provider} · {item.model}{item.focus&&` · focus: ${item.focus}`}</small><p>{item.answer}</p>{item.kind==='selection'&&item.details?.breakdown?.map((part,index)=><dl key={index}><dt>{part.part}</dt><dd>{part.role}</dd></dl>)}{item.kind==='selection'&&item.details?.uncertainty&&<aside><strong>Uncertainty</strong>{item.details.uncertainty}</aside>}{item.kind==='page'&&item.details?.notes?.map((note,index)=><section key={index}><span>{note.type} · {Math.round(note.confidence*100)}%</span><strong>{note.title}</strong><p>{note.explanation}</p><blockquote>{note.evidence}</blockquote></section>)}</div>}</article>)}</div></section>
    </aside>
  )
}
