import type { AiHistoryItem, DictionaryResult, GrammarAnalysis, GrammarExplanation, LearningPassResult, LearningProgress, LensAnalysis, Lesson, LessonProposal, LlmStatus, MeaningCheckResult, PageVisionProposal, ReaderData, RubySpan, SavedItem, TextBlock, VisionProposal, Volume, VolumeSearchHit } from './types'

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
  updateVolume: (id: string, title: string, series: string) => request<Volume>(`/api/volumes/${id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,series})}),
  processVolume: (id:string)=>request<Volume>(`/api/volumes/${id}/process`,{method:'POST'}),
  pauseVolume: (id:string)=>request<Volume>(`/api/volumes/${id}/pause`,{method:'POST'}),
  processingLog: (id:string)=>request<Array<{message:string;created_at:string}>>(`/api/volumes/${id}/processing-log`,{cache:'no-store'}),
  restoreBackup: (file:File)=>{const form=new FormData();form.append('file',file);return request<{ok:boolean;volumes:number;recovered_jobs:number;safety_backup:string}>('/api/restore',{method:'POST',body:form})},
  dictionary: (query: string) => request<DictionaryResult>(`/api/dictionary?q=${encodeURIComponent(query)}`),
  grammar: (sentence: string, focus: string) => request<GrammarAnalysis>(`/api/grammar?sentence=${encodeURIComponent(sentence)}&focus=${encodeURIComponent(focus)}`),
  explainGrammar: (sentence: string, focus: string, provider?: string, question?: string, location?: {volume_id:string;page_index:number;block_index:number}) => request<GrammarExplanation>('/api/grammar/explain', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({sentence, focus, provider: provider || null, question: question || null, ...location})}),
  grammarExplanationHistory: (sentence: string, focus: string) => request<GrammarExplanation[]>(`/api/grammar/explanations?sentence=${encodeURIComponent(sentence)}&focus=${encodeURIComponent(focus)}`),
  llmStatus: () => request<LlmStatus>('/api/llm/status'),
  reader: (id: string) => request<ReaderData>(`/api/volumes/${id}/reader`),
  searchVolume:(id:string,query:string)=>request<VolumeSearchHit[]>(`/api/volumes/${id}/search?q=${encodeURIComponent(query)}`),
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
  bookmarks: (id: string) => request<number[]>(`/api/volumes/${id}/bookmarks`, {cache:'no-store'}),
  addBookmark: (id: string, page: number) => request<{ok:boolean}>(`/api/volumes/${id}/bookmarks/${page}`, {method:'PUT'}),
  removeBookmark: (id: string, page: number) => request<{ok:boolean}>(`/api/volumes/${id}/bookmarks/${page}`, {method:'DELETE'}),
  reviewPage: (id:string,page:number)=>request<{ok:boolean}>(`/api/volumes/${id}/pages/${page}/reviewed`,{method:'PUT'}),
  unreviewPage: (id:string,page:number)=>request<{ok:boolean}>(`/api/volumes/${id}/pages/${page}/reviewed`,{method:'DELETE'}),
  correction: (
    id: string, page_index: number, block_index: number, line_index: number,
    raw_text: string, canonical_text: string, ruby: RubySpan[],
  ) => request<{ ok: boolean }>(`/api/volumes/${id}/corrections`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_index, block_index, line_index, raw_text, canonical_text, ruby }),
  }),
  blockGeometry: (id: string, page: number, block: number, box: number[]) => request<{ok: boolean; box: number[]}>(`/api/volumes/${id}/pages/${page}/blocks/${block}/geometry`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({box}),
  }),
  blockText: (id: string, page: number, block: number, lines: string[], ruby: RubySpan[][]) => request<{ok: boolean}>(`/api/volumes/${id}/pages/${page}/blocks/${block}/text`, {
    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({lines, ruby}),
  }),
  deleteBlock: (id:string,page:number,block:number)=>request<{ok:boolean;blocks:TextBlock[]}>(`/api/volumes/${id}/pages/${page}/blocks/${block}`,{method:'DELETE'}),
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
  meaningCheck:(id:string,page:number,answers:Array<{block_index:number;interpretation:string;unable?:boolean}>,include_artwork=false,question?:string,provider?:string)=>request<MeaningCheckResult>(`/api/volumes/${id}/pages/${page}/meaning-check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers,include_artwork,question:question||null,provider:provider||null})}),
  learningPass:(id:string,page:number,provider?:string)=>request<LearningPassResult>(`/api/volumes/${id}/pages/${page}/learning-pass`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:provider||null})}),
  lessonMatches:(id:string,page:number)=>request<Lesson[]>(`/api/volumes/${id}/pages/${page}/lesson-matches`,{cache:'no-store'}),
  lessons:()=>request<Lesson[]>('/api/lessons',{cache:'no-store'}),
  keepLesson:(id:string,page:number,lesson:LessonProposal)=>request<Lesson>(`/api/volumes/${id}/pages/${page}/lessons`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(lesson)}),
  dismissLesson:(id:string,page:number,key:string)=>request<{ok:boolean}>(`/api/volumes/${id}/pages/${page}/lesson-dismissals/${key}`,{method:'POST'}),
  recallLesson:(id:string,success:boolean)=>request<Lesson>(`/api/lessons/${id}/recall`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({success})}),
  assistance:(id:string,page:number,event_type:string,block_index?:number,lesson_id?:string)=>request<{ok:boolean}>(`/api/volumes/${id}/pages/${page}/assistance`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type,block_index,lesson_id})}),
  learningProgress:(id?:string)=>request<LearningProgress>(`/api/learning-progress${id?`?volume_id=${id}`:''}`,{cache:'no-store'}),
  aiHistory: (id:string,page:number)=>request<AiHistoryItem[]>(`/api/volumes/${id}/pages/${page}/ai-history`, {cache:'no-store'}),
  deleteAiHistory: (id:string,page:number,kind:AiHistoryItem['kind'],item:string)=>request<{ok:boolean}>(`/api/volumes/${id}/pages/${page}/ai-history/${kind}/${item}`, {method:'DELETE'}),
  saveItem: (item: {text: string; reading?: string; meaning?: string; volume_id?: string; page_index?: number; context?: string; notes?: string;kind?:SavedItem['kind']}) =>
    request<SavedItem>('/api/saved-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }),
  savedItems: () => request<SavedItem[]>('/api/saved-items'),
  deleteSavedItem: (id: string) => request<{ok: boolean}>(`/api/saved-items/${id}`, { method: 'DELETE' }),
  updateSavedItem: (id:string, item:{reading:string|null;meaning:string|null;notes:string|null}) => request<SavedItem>(`/api/saved-items/${id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)}),
}
