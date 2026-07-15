import { useState } from 'react'
import type { RecentLookup } from '../components/LookupHistoryPanel'

export function useRecentLookups(volumeId:string) {
  const key=`komayomi.lookups.${volumeId}`
  const [items,setItems]=useState<RecentLookup[]>(()=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}})
  function add(item:RecentLookup){setItems((current)=>{const next=[item,...current.filter((saved)=>!(saved.text===item.text&&saved.context===item.context&&saved.page===item.page))].slice(0,30);localStorage.setItem(key,JSON.stringify(next));return next})}
  function clear(){setItems([]);localStorage.removeItem(key)}
  return {items,add,clear}
}
