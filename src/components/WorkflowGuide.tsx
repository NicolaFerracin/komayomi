import { ArrowRight, BookHeart, Brain, CheckCircle2, Route, Search, ShieldCheck, X } from 'lucide-react'

const steps=[
  {number:'01',title:'Read unaided',body:'Look at the artwork and Japanese first. Form a rough interpretation before opening any help.',icon:Brain},
  {number:'02',title:'Resolve only blocking words',body:'Select the smallest word or phrase preventing comprehension. Use vocabulary selectively; avoid translating the whole bubble by default.',icon:Search},
  {number:'03',title:'State your understanding',body:'Decide what the bubble communicates in your own English. It does not need to be a polished translation.',icon:ArrowRight},
  {number:'04',title:'Run Meaning Check',body:'Submit the bubbles you attempted. Compare meaning coverage, literal structure, omissions, additions, and contextual meaning.',icon:CheckCircle2},
  {number:'05',title:'Investigate important gaps',body:'Use local grammar first. Ask AI only when the dictionary and deterministic grammar rules cannot explain a meaningful gap.',icon:ShieldCheck},
  {number:'06',title:'Run Learning Pass',body:'After understanding the page, request up to three transferable lessons drawn from mistakes, lookups, useful readings, and recurring patterns.',icon:BookHeart},
  {number:'07',title:'Keep almost nothing',body:'Keep only what would make another page easier. One lesson is plenty; keeping zero is a valid successful outcome.',icon:BookHeart},
  {number:'08',title:'Recall in the manga',body:'When a kept form appears again, try to recall it before revealing help. Real encounters move it from learning to recognized to familiar.',icon:Brain},
]

export function WorkflowGuide({onClose}:{onClose:()=>void}){
  return <aside className="tool-panel workflow-guide"><header><div><span className="eyebrow">THE PREFERRED METHOD</span><h2>Reading workflow</h2></div><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={19}/></button></header><div className="workflow-manifesto"><Route size={25}/><div><strong>The manga is the activity.</strong><p>Help should resolve friction now and make later pages easier—not turn reading into an endless review system.</p></div></div><div className="workflow-loop"><span>ATTEMPT</span><i>→</i><span>SELECTIVE HELP</span><i>→</i><span>CHECK</span><i>→</i><span>KEEP LITTLE</span><i>→</i><span>RECALL</span></div><div className="workflow-steps">{steps.map(({number,title,body,icon:Icon})=><article key={number}><b>{number}</b><Icon size={18}/><div><h3>{title}</h3><p>{body}</p></div></article>)}</div><section className="workflow-rules"><h3>Guardrails against burnout</h3><ul><li>No daily quota, streak, due date, or overdue pile.</li><li>Learn words in context—not isolated kanji.</li><li>Translation resolves a page; Learning Pass improves the next one.</li><li>Progress means needing less assistance, not completing more cards.</li><li>Skip anything obscure, obvious, or uninteresting.</li></ul></section><div className="workflow-reminder"><strong>Default page outcome</strong><span>Understand the scene, keep zero or one reusable idea, and continue reading.</span></div></aside>
}
