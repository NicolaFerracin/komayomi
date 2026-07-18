import { Clock3, Search, Trash2, X } from 'lucide-react'

export type RecentLookup={text:string;context:string;page:number;createdAt:string}

export function LookupHistoryPanel({items,onChoose,onClear,onClose}:{items:RecentLookup[];onChoose:(item:RecentLookup)=>void;onClear:()=>void;onClose:()=>void}) {
  return <aside className="tool-panel lookup-history"><header><div><span className="eyebrow">LOCAL TRAIL</span><h2>Recent lookups</h2></div><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={19}/></button></header><p>Words you opened recently, kept only in this browser.</p>{!items.length?<div className="lookup-history__empty"><Clock3 size={27}/><strong>No recent lookups</strong><span>Select manga text and choose Look up.</span></div>:<><div className="lookup-history__items">{items.map((item,index)=><button key={`${item.createdAt}-${index}`} onClick={()=>onChoose(item)}><Search size={14}/><div><strong>{item.text}</strong><span>Page {item.page+1} · {new Date(item.createdAt).toLocaleString()}</span><p>{item.context}</p></div></button>)}</div><button className="lookup-history__clear" onClick={onClear}><Trash2 size={13}/> Clear recent lookups</button></>}</aside>
}
