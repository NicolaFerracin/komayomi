import { BookMarked, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { DictionaryResult, RubySpan } from '../types'

export function LookupPanel({ query, rubySpans = [], onClose }: { query: string; rubySpans?: RubySpan[]; onClose: () => void }) {
  const [result, setResult] = useState<DictionaryResult | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    setResult(null); setError('')
    api.dictionary(query).then((data) => active && setResult(data)).catch((reason) => active && setError(reason.message))
    return () => { active = false }
  }, [query])

  return (
    <aside className="tool-panel lookup-panel">
      <header><div><span className="eyebrow">LOCAL DICTIONARY</span><h2>{query}</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
      {!result && !error && <div className="lookup-loading"><LoaderCircle className="spin" size={20}/> Reading locally…</div>}
      {error && <div className="error-note">{error}</div>}
      {result && <>
        {result.tokens.length > 1 && <div className="token-strip">{result.tokens.map((token, index) => { const printed = printedReadings(result, rubySpans)[index]; return <span key={index} className={printed ? 'has-printed-reading' : ''} title={`${token.part_of_speech}${token.inflection ? ` · ${token.inflection}` : ''}`}>{token.surface}<small>{printed || token.reading}</small>{printed && <i>printed</i>}</span> })}</div>}
        <div className="dictionary-entries">
          {result.entries.map((entry, index) => <article className="dictionary-entry" key={entry.id}>
            <div className="dictionary-entry__head"><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{printedForm(entry, result)}</strong><em>{entry.readings.join('、')}</em></div>{entry.matched_by !== printedForm(entry, result) && <i>dictionary form {entry.matched_by}</i>}</div>
            {entry.senses.slice(0, 4).map((sense, senseIndex) => <div className="dictionary-sense" key={senseIndex}><b>{senseIndex + 1}</b><div><p>{sense.glosses.join('; ')}</p><small>{sense.parts_of_speech.join(' · ')}</small></div></div>)}
          </article>)}
          {!result.entries.length && <div className="no-entry">No exact word entry. Individual kanji are shown below.</div>}
        </div>
        {!!result.kanji.length && <section className="kanji-section"><div className="section-rule"><span>KANJI / {result.kanji.length}</span></div>{result.kanji.map((kanji) => <article className="kanji-card" key={kanji.literal}><div className="kanji-card__literal">{kanji.literal}</div><div><strong>{kanji.meanings.slice(0, 5).join(', ')}</strong><dl><dt>ON</dt><dd>{kanji.readings.on.join('、') || '—'}</dd><dt>KUN</dt><dd>{kanji.readings.kun.join('、') || '—'}</dd></dl><div className="kanji-stats"><span>{kanji.strokes} strokes</span>{kanji.grade && <span>grade {kanji.grade}</span>}{kanji.jlpt && <span>JLPT {kanji.jlpt}</span>}</div></div></article>)}</section>}
        <button className="save-word-button" onClick={async () => { const entry = result.entries[0]; await api.saveItem({ text: entry?.writings[0] || query, reading: entry?.readings[0] || result.tokens[0]?.reading || '', meaning: entry?.senses[0]?.glosses.join('; ') || '', context: query }); setSaved(true) }} disabled={saved}><BookMarked size={16}/> {saved ? 'Saved to study inbox' : 'Save for later'} <span>{saved ? 'ready for export' : 'no review debt'}</span></button>
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
