import { Keyboard, X } from 'lucide-react'

const groups = [
  ['Navigate', [['←', 'Next page'], ['→', 'Previous page'], ['G', 'Browse or search pages']]],
  ['Read', [['+', 'Zoom in'], ['−', 'Zoom out'], ['0', 'Reset zoom']]],
  ['Keep & understand', [['B', 'Bookmark this page'], ['L', 'Open Page Lens'], ['W', 'Reading workflow'], ['?', 'Show these shortcuts'], ['Esc', 'Close the active panel']]],
]

export function ShortcutGuide({onClose}:{onClose:()=>void}) {
  return <div className="shortcut-backdrop" onMouseDown={onClose}><section className="shortcut-guide" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={(event)=>event.stopPropagation()}><header><div><Keyboard size={19}/><div><span>READER CONTROLS</span><h2>Keyboard shortcuts</h2></div></div><button className="icon-button" aria-label="Close keyboard shortcuts" onClick={onClose}><X size={19}/></button></header><div>{groups.map(([title,items])=><section key={title as string}><h3>{title as string}</h3>{(items as string[][]).map(([key,label])=><div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</section>)}</div></section></div>
}
