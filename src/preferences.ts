import type { LlmStatus } from './types'

const PROVIDER_KEY = 'komayomi.defaultProvider'
const READER_KEY = 'komayomi.readerPreferences'
export type ReaderPreferences = {overlayScale:number;panelWidth:number}

export function preferredProvider(status: LlmStatus): string {
  const saved = localStorage.getItem(PROVIDER_KEY)
  return status.providers.find((item) => item.id === saved && item.configured)?.id
    || status.providers.find((item) => item.id === status.preferred && item.configured)?.id
    || status.providers.find((item) => item.configured)?.id || ''
}

export function savePreferredProvider(provider: string) {
  if (provider) localStorage.setItem(PROVIDER_KEY, provider)
  else localStorage.removeItem(PROVIDER_KEY)
}

export function readerPreferences():ReaderPreferences {
  try { const saved=JSON.parse(localStorage.getItem(READER_KEY)||'{}');return {overlayScale:Number(saved.overlayScale)||1,panelWidth:Number(saved.panelWidth)||620} }
  catch { return {overlayScale:1,panelWidth:620} }
}

export function saveReaderPreferences(value:ReaderPreferences) {
  localStorage.setItem(READER_KEY,JSON.stringify(value));window.dispatchEvent(new CustomEvent('komayomi:reader-preferences',{detail:value}))
}
