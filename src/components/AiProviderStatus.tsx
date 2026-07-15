import type { LlmStatus } from '../types'

export function AiProviderStatus({ status, provider }: { status: LlmStatus | null; provider: string }) {
  const active = status?.providers.find((item) => item.id === provider)
  return <div className="ai-provider-status"><span>AI configured in Settings</span><strong>{active ? `${active.name} · ${active.model}` : 'No provider configured'}</strong></div>
}
