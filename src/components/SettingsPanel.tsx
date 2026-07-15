import { Check, Cpu, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { preferredProvider, savePreferredProvider } from '../preferences'
import type { LlmStatus } from '../types'

export function SettingsPanel({onClose}:{onClose:()=>void}) {
  const [status,setStatus]=useState<LlmStatus|null>(null);const [provider,setProvider]=useState('');const [saved,setSaved]=useState(false)
  useEffect(()=>{api.llmStatus().then((value)=>{setStatus(value);setProvider(preferredProvider(value))})},[])
  return <aside className="tool-panel settings-panel"><header><div><span className="eyebrow">LOCAL PREFERENCES</span><h2>Settings</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header>
    <section><div className="section-rule"><span>AI PROVIDER</span></div><p>Choose the default used by bubble vision, Page Lens, and contextual explanations. Every external call remains opt-in.</p>{status?.providers.map((item)=><label className={`provider-card ${provider===item.id?'active':''} ${!item.configured?'disabled':''}`} key={item.id}><input type="radio" name="provider" disabled={!item.configured} checked={provider===item.id} onChange={()=>setProvider(item.id)}/><Cpu size={18}/><div><strong>{item.name}</strong><span>{item.model}</span></div><i>{item.configured?'Ready':'No API key'}</i></label>)}<button className="primary-button" disabled={!provider} onClick={()=>{savePreferredProvider(provider);setSaved(true);setTimeout(()=>setSaved(false),1400)}}>{saved?<><Check size={16}/> Saved</>:'Save default provider'}</button></section>
    <div className="privacy-note"><ShieldCheck size={18}/><div><strong>Keys stay on the local server.</strong><span>Configure them in .env and restart KomaYomi. The browser receives readiness information, never the keys themselves.</span></div></div>
  </aside>
}
