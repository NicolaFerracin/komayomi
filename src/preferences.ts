import type { LlmStatus } from './types'

const PROVIDER_KEY = 'komayomi.defaultProvider'

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
