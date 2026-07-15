import type { DictionaryResult, LensAnalysis, LlmStatus, PageVisionProposal, ReaderData, RubySpan, SavedItem, VisionProposal, Volume } from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

export const api = {
  volumes: () => request<Volume[]>('/api/volumes'),
  dictionary: (query: string) => request<DictionaryResult>(`/api/dictionary?q=${encodeURIComponent(query)}`),
  llmStatus: () => request<LlmStatus>('/api/llm/status'),
  reader: (id: string) => request<ReaderData>(`/api/volumes/${id}/reader`),
  importLocal: (path: string, title?: string, series?: string) =>
    request<Volume>('/api/volumes/import-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, title: title || null, series: series || null, process: true }),
    }),
  upload: (title: string, series: string, files: File[]) => {
    const form = new FormData()
    form.append('title', title)
    form.append('series', series)
    files.forEach((file) => form.append('files', file))
    return request<Volume>('/api/volumes/upload', { method: 'POST', body: form })
  },
  position: (id: string, page: number) => request<{ ok: boolean }>(`/api/volumes/${id}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page }),
  }),
  correction: (
    id: string, page_index: number, block_index: number, line_index: number,
    raw_text: string, canonical_text: string, ruby: RubySpan[],
  ) => request<{ ok: boolean }>(`/api/volumes/${id}/corrections`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_index, block_index, line_index, raw_text, canonical_text, ruby }),
  }),
  visionBlock: (id: string, page: number, block: number, provider?: string) => request<VisionProposal>(`/api/volumes/${id}/pages/${page}/blocks/${block}/vision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: provider || null }),
  }),
  visionPage: (id: string, page: number, provider?: string) => request<PageVisionProposal>(`/api/volumes/${id}/pages/${page}/vision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({provider: provider || null}) }),
  applyVisionPage: (id: string, page: number, blocks: PageVisionProposal['proposal']['blocks']) => request<{ok: boolean}>(`/api/volumes/${id}/pages/${page}/vision`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({blocks}) }),
  pageLens: (id: string, page: number, provider?: string, include_next = false, question?: string) => request<LensAnalysis>(`/api/volumes/${id}/pages/${page}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: provider || null, include_next, question: question || null }),
  }),
  saveItem: (item: {text: string; reading?: string; meaning?: string; volume_id?: string; page_index?: number; context?: string; notes?: string}) =>
    request<SavedItem>('/api/saved-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }),
  savedItems: () => request<SavedItem[]>('/api/saved-items'),
  deleteSavedItem: (id: string) => request<{ok: boolean}>(`/api/saved-items/${id}`, { method: 'DELETE' }),
}
