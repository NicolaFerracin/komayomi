import { BookMarked, Braces, Check, Eye, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { DictionaryResult, GrammarAnalysis, GrammarExplanation, LlmStatus, RubySpan } from '../types'
import { preferredProvider } from '../preferences'
import { AiProviderStatus } from './AiProviderStatus'

export function LookupPanel({ query, sentence = query, rubySpans = [], volumeId, pageIndex, onClose, onAskAI }: { query: string; sentence?: string; rubySpans?: RubySpan[]; volumeId:string; pageIndex:number; onClose: () => void; onAskAI:(sentence:string,focus:string)=>void }) {
  const [result, setResult] = useState<DictionaryResult | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [sentenceSaved,setSentenceSaved]=useState(false);const[explanationSaved,setExplanationSaved]=useState(false)
  const [grammar, setGrammar] = useState<GrammarAnalysis | null>(null)
  const [llmStatus,setLlmStatus]=useState<LlmStatus|null>(null);const[provider,setProvider]=useState('');const[aiRequest,setAiRequest]=useState('');const[explanation,setExplanation]=useState<GrammarExplanation|null>(null);const[explaining,setExplaining]=useState(false)
  useEffect(() => {
    let active = true
    setResult(null); setError('')
    Promise.all([api.dictionary(query), api.grammar(sentence, query)]).then(([dictionary, analysis]) => { if (active) { setResult(dictionary); setGrammar(analysis) } }).catch((reason) => active && setError(reason.message))
    return () => { active = false }
  }, [query, sentence])
  useEffect(()=>{api.llmStatus().then((status)=>{setLlmStatus(status);setProvider(preferredProvider(status))}).catch(()=>undefined)},[])
  async function explain(){setExplaining(true);setError('');try{setExplanation(await api.explainGrammar(sentence,query,provider,aiRequest))}catch(reason){setError(reason instanceof Error?reason.message:'Could not explain this usage')}finally{setExplaining(false)}}

  return (
    <aside className="tool-panel lookup-panel">
      <header><div><span className="eyebrow">LOCAL DICTIONARY</span><h2>{query}</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
      {!result && !error && <div className="lookup-loading"><LoaderCircle className="spin" size={20}/> Reading locally…</div>}
      {error && <div className="error-note">{error}</div>}
      {result && <>
        {result.tokens.length > 1 && <div className="token-strip">{result.tokens.map((token, index) => { const printed = printedReadings(result, rubySpans)[index]; return <span key={index} className={printed ? 'has-printed-reading' : ''} title={`${token.part_of_speech}${token.inflection ? ` · ${token.inflection}` : ''}`}>{token.surface}<small>{printed || token.reading}</small>{printed && <i>printed</i>}</span> })}</div>}
        {grammar && <section className="grammar-context"><div className="section-rule"><span>IN THIS SENTENCE</span></div>{grammar.matches.map((match, index) => <article key={`${match.form}-${index}`}><div className="grammar-context__head"><Braces size={16}/><div><strong>{match.span}</strong><span>{match.title}</span></div><i>{Math.round(match.confidence * 100)}% · local</i></div><p>{match.explanation}</p><blockquote>{match.translation_hint}</blockquote></article>)}{!grammar.matches.length && <p className="muted">No known local grammar pattern matched this selection. You can still ask AI about the complete block below.</p>}</section>}
        <button className="save-sentence-button" disabled={sentenceSaved} onClick={async()=>{await api.saveItem({text:sentence,context:sentence,volume_id:volumeId,page_index:pageIndex,kind:'sentence'});setSentenceSaved(true)}}><BookMarked size={15}/>{sentenceSaved?'Sentence saved':'Save the whole sentence'}<span>Keep its complete context</span></button>
        <section className="vocab-ai">
          <div className="vocab-ai__head"><Sparkles size={17}/><div><strong>Focused AI explanation</strong><span>Full block context · focus: {query}</span></div></div>
          <div className="vocab-ai__privacy"><ShieldCheck size={14}/> Nothing is shared until you ask.</div><AiProviderStatus status={llmStatus} provider={provider}/>
          <textarea value={aiRequest} onChange={(event)=>setAiRequest(event.target.value)} placeholder="Optional: What specifically should it explain?"/>
          <button className="secondary-button" disabled={!provider||explaining} onClick={explain}>{explaining?<LoaderCircle className="spin" size={15}/>:<Sparkles size={15}/>} Explain this selection</button>
          {explanation&&<><div className="vocab-ai__result"><span>{explanation.provider} · {explanation.model}</span><p>{explanation.explanation.interpretation}</p>{explanation.explanation.breakdown.map((part,index)=><dl key={index}><dt>{part.part}</dt><dd>{part.role}</dd></dl>)}<div className="vocab-ai__saved"><Check size={14}/><strong>Saved locally.</strong> You can always recover this from <button onClick={()=>onAskAI(sentence,query)}>Page Lens → Past Queries</button>.</div></div><button className="secondary-button" disabled={explanationSaved} onClick={async()=>{await api.saveItem({text:query,meaning:explanation.explanation.interpretation,context:sentence,notes:explanation.explanation.breakdown.map((part)=>`${part.part}: ${part.role}`).join('\n'),volume_id:volumeId,page_index:pageIndex,kind:'grammar'});setExplanationSaved(true)}}><BookMarked size={14}/>{explanationSaved?'Explanation saved':'Save explanation to Study Inbox'}</button></>}
          <button className="vocab-ai__open" onClick={()=>onAskAI(sentence,query)}><Eye size={15}/> Open the full Page Lens workspace</button>
        </section>
        <div className="dictionary-entries">
          {result.entries.map((entry, index) => <article className="dictionary-entry" key={entry.id}>
            <div className="dictionary-entry__head"><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{printedForm(entry, result)}</strong><em>{entry.readings.join('、')}</em></div>{entry.matched_by !== printedForm(entry, result) && <i>dictionary form {entry.matched_by}</i>}</div>
            {entry.senses.slice(0, 4).map((sense, senseIndex) => <div className="dictionary-sense" key={senseIndex}><b>{senseIndex + 1}</b><div><p>{sense.glosses.join('; ')}</p><small>{sense.parts_of_speech.join(' · ')}</small></div></div>)}
          </article>)}
          {!result.entries.length && <div className="no-entry">No exact word entry. Individual kanji are shown below.</div>}
        </div>
        {!!result.kanji.length && <section className="kanji-section"><div className="section-rule"><span>KANJI / {result.kanji.length}</span></div>{result.kanji.map((kanji) => <article className="kanji-card" key={kanji.literal}><div className="kanji-card__literal">{kanji.literal}</div><div><strong>{kanji.meanings.slice(0, 5).join(', ')}</strong><dl><dt>ON</dt><dd>{kanji.readings.on.join('、') || '—'}</dd><dt>KUN</dt><dd>{kanji.readings.kun.join('、') || '—'}</dd></dl><div className="kanji-stats"><span>{kanji.strokes} strokes</span>{kanji.grade && <span>grade {kanji.grade}</span>}{kanji.jlpt && <span>JLPT {kanji.jlpt}</span>}</div></div></article>)}</section>}
        <button className="save-word-button" onClick={async () => { const entry = result.entries[0]; const printed = printedReadings(result, rubySpans); await api.saveItem({ text: query, reading: printed.filter(Boolean).join('') || result.tokens.map((token) => token.reading || '').join(''), meaning: entry?.senses[0]?.glosses.join('; ') || '', context: sentence, volume_id:volumeId, page_index:pageIndex }); setSaved(true) }} disabled={saved}><BookMarked size={16}/> {saved ? 'Saved to study inbox' : 'Save for later'} <span>{saved ? 'exact printed form saved' : 'no review debt'}</span></button>
      </>}
    </aside>
  )
}

function printedForm(entry: DictionaryResult['entries'][number], result: DictionaryResult): string {
  const contextualToken = result.tokens.find((token) => token.lemma === entry.matched_by)
  if (contextualToken) return contextualToken.surface
  if (entry.readings.includes(result.query)) return result.query
  return entry.writings[0] || entry.readings[0]
}

function kana(value: string | null): string {
  return (value || '').replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
}

function printedReadings(result: DictionaryResult, spans: RubySpan[]): Array<string | null> {
  const readings: Array<string | null> = result.tokens.map(() => null)
  for (const span of spans) {
    for (let start = 0; start < result.tokens.length; start++) {
      let base = ''
      for (let end = start; end < result.tokens.length; end++) {
        base += result.tokens[end].surface
        if (base === span.base) {
          let remainder = span.reading
          for (let index = start; index <= end; index++) {
            if (index === end) { readings[index] = remainder; break }
            const expected = kana(result.tokens[index].reading)
            if (expected && kana(remainder).startsWith(expected)) {
              readings[index] = remainder.slice(0, expected.length)
              remainder = remainder.slice(expected.length)
            }
          }
          break
        }
        if (!span.base.startsWith(base)) break
      }
    }
  }
  return readings
}
