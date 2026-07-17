import { BookHeart, Check, GraduationCap, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { preferredProvider } from '../preferences'
import type { LearningProgress, Lesson, LessonProposal, LlmStatus } from '../types'
import { AiProviderStatus } from './AiProviderStatus'

export function LearningPass({volumeId,pageIndex,onClose,onLessonsChanged}:{volumeId:string;pageIndex:number;onClose:()=>void;onLessonsChanged:()=>void}){
  const[status,setStatus]=useState<LlmStatus|null>(null);const[provider,setProvider]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[summary,setSummary]=useState('');const[proposals,setProposals]=useState<LessonProposal[]>([]);const[lessons,setLessons]=useState<Lesson[]>([]);const[progress,setProgress]=useState<LearningProgress|null>(null)
  useEffect(()=>{Promise.all([api.llmStatus(),api.lessons(),api.learningProgress(volumeId)]).then(([llm,known,stats])=>{setStatus(llm);setProvider(preferredProvider(llm));setLessons(known);setProgress(stats)}).catch((reason)=>setError(reason.message))},[volumeId])
  async function generate(){setBusy(true);setError('');try{const result=await api.learningPass(volumeId,pageIndex,provider);setSummary(result.summary);setProposals(result.proposals)}catch(reason){setError(reason instanceof Error?reason.message:'Could not create the Learning Pass')}finally{setBusy(false)}}
  async function keep(item:LessonProposal){const lesson=await api.keepLesson(volumeId,pageIndex,item);setLessons((all)=>[lesson,...all.filter((saved)=>saved.id!==lesson.id)]);setProposals((all)=>all.filter((proposal)=>proposal.proposal_key!==item.proposal_key));onLessonsChanged()}
  async function dismiss(item:LessonProposal){await api.dismissLesson(volumeId,pageIndex,item.proposal_key);setProposals((all)=>all.filter((proposal)=>proposal.proposal_key!==item.proposal_key))}
  return <aside className="tool-panel learning-pass"><header><div><span className="eyebrow">KEEP ONLY WHAT TRAVELS</span><h2>Learning Pass</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
    <section className="learning-compass"><GraduationCap size={25}/><div><strong>Manga first. Learning second.</strong><p>Extract up to three ideas that can unlock future pages. No due dates, streaks, or backlog.</p></div>{progress&&<div className="learning-compass__stats"><span><b>{Object.values(progress.lessons).reduce((a,b)=>a+b,0)}</b> kept</span><span><b>{progress.lessons.familiar||0}</b> familiar</span><span title="Successful recalls and Meaning Checks at 80% or above, as a share of recorded learning/assistance events"><b>{progress.independent_rate}%</b> independent</span></div>}</section>
    {!summary&&!busy&&<><div className="learning-privacy"><ShieldCheck size={15}/> Nothing is shared until you request this page’s pass.</div><AiProviderStatus status={status} provider={provider}/></>}
    {!summary&&!busy&&<button className="primary-button learning-generate" disabled={!provider} onClick={generate}><Sparkles size={17}/> Find what is worth learning</button>}
    {busy&&<div className="learning-loading"><LoaderCircle className="spin"/><strong>Looking for transferable language…</strong><span>Meaning Check mistakes and saved lookups come first.</span></div>}
    {error&&<div className="error-note">{error}</div>}{summary&&<div className="learning-summary"><span>THIS PAGE</span><p>{summary}</p></div>}
    <div className="lesson-proposals">{proposals.map((item)=><article key={item.proposal_key}><div className="lesson-kind">{item.kind}</div><h3>{item.reading?<ruby>{item.form}<rt>{item.reading}</rt></ruby>:item.form}</h3><strong>{item.meaning}</strong><p>{item.explanation}</p><blockquote>{item.example_japanese}<span>{item.example_english}</span></blockquote>{item.why_now&&<small>{item.why_now}</small>}<div><button onClick={()=>dismiss(item)}>Not useful</button><button onClick={()=>keep(item)}><BookHeart size={14}/> Keep lesson</button></div></article>)}</div>
    {summary&&!proposals.length&&<div className="learning-clear"><Check size={24}/><strong>Nothing else to keep from this pass.</strong><span>That is a successful outcome—not every page needs to become study material.</span></div>}
    {!!lessons.length&&<section className="known-lessons"><div className="section-rule"><span>YOUR FIELD NOTES / {lessons.length}</span></div>{lessons.slice(0,12).map((item)=><article key={item.id}><i>{item.status}</i><strong>{item.form}</strong><span>{item.meaning}</span><small>{item.successful_recalls} recalled · {item.encounters} encounters</small></article>)}</section>}
  </aside>
}
