import { Brain, Check, Eye, Search, X } from 'lucide-react'
import { useState } from 'react'
import type { Lesson } from '../types'

export function RecallPrompt({lesson,context,onAnswer,onContinue,onClose}:{lesson:Lesson;context:string;onAnswer:(success:boolean)=>Promise<void>;onContinue:()=>void;onClose:()=>void}){
  const[revealed,setRevealed]=useState(false);const[answered,setAnswered]=useState(false)
  async function answer(success:boolean){if(answered)return;setAnswered(true);await onAnswer(success);setRevealed(true)}
  return <aside className="tool-panel recall-prompt"><header><div><span className="eyebrow">SEEN BEFORE</span><h2>Try to recall</h2></div><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={19}/></button></header><div className="recall-mark"><Brain size={28}/></div><p className="recall-context">{context}</p><div className="recall-target"><span>{lesson.kind}</span><strong>{lesson.form}</strong>{lesson.reading&&revealed&&<i>{lesson.reading}</i>}</div>{!revealed?<><p className="recall-question">What does this contribute here? Take a moment before revealing it.</p><div className="recall-actions"><button onClick={()=>answer(false)}><Eye size={15}/> Reveal it</button><button onClick={()=>answer(true)}><Check size={15}/> I remembered</button></div></>:<div className="recall-reveal"><span>{lesson.status} · encountered {lesson.encounters+1} times</span><h3>{lesson.meaning}</h3><p>{lesson.explanation}</p><blockquote>{lesson.example_japanese}<small>{lesson.example_english}</small></blockquote><button className="primary-button" onClick={onContinue}><Search size={15}/> Continue to vocabulary</button></div>}</aside>
}
