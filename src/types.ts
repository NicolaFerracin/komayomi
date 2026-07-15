export type Volume = {
  id: string
  title: string
  series: string
  status: 'queued' | 'processing' | 'paused' | 'ready' | 'error'
  page_count: number
  processed_pages: number
  progress: number
  cover_filename: string | null
  current_page: number
  error: string | null
  reused?: boolean
}

export type RubySpan = { base: string; reading: string; printed?: boolean }

export type TextBlock = {
  box: [number, number, number, number]
  vertical: boolean
  font_size: number
  lines_coords: number[][][]
  lines: string[]
  raw_lines: string[]
  ruby: RubySpan[][]
}

export type MangaPage = {
  img_width: number
  img_height: number
  img_path: string
  image_url: string
  blocks: TextBlock[]
  ocr_quality: {
    suspicious: boolean
    reviewed: boolean
    flagged_blocks: number
    reason: string | null
  }
}

export type ReaderData = {
  title: string
  volume: string
  volume_id: string
  current_page: number
  pages: MangaPage[]
}

export type DictionaryResult = {
  query: string
  tokens: Array<{ surface: string; lemma: string; reading: string | null; part_of_speech: string; detail: string | null; inflection: string | null }>
  entries: Array<{
    id: number; writings: string[]; readings: string[]; matched_by: string
    senses: Array<{ glosses: string[]; parts_of_speech: string[]; misc: string[] }>
  }>
  kanji: Array<{
    literal: string; strokes: number; grade: string | null; frequency: string | null; jlpt: string | null
    readings: { on: string[]; kun: string[] }; meanings: string[]
  }>
}

export type LlmStatus = {
  preferred: string
  providers: Array<{ id: string; name: string; model: string; configured: boolean }>
}

export type VisionProposal = {
  proposal: { summary: string; lines: Array<{ text: string; ruby: Array<RubySpan & { printed: boolean }>; confidence: number }> }
  provider: string; model: string; applied: false
}

export type LensAnalysis = {
  analysis: { summary: string; notes: Array<{ type: string; title: string; explanation: string; evidence: string; confidence: number }> }
  provider: string; model: string; cached: boolean
}

export type PageVisionProposal = { proposal: { summary: string; blocks: Array<{ box: number[]; vertical: boolean; lines: Array<{text: string; ruby: Array<RubySpan & {printed: boolean}>}>; confidence: number }> }; provider: string; model: string; applied: false }

export type SavedItem = {
  id: string; text: string; reading: string | null; meaning: string | null
  volume_id: string | null; page_index: number | null; context: string | null; notes: string | null; created_at: string
}

export type GrammarAnalysis = { sentence: string; focus: string | null; needs_context: boolean; matches: Array<{span: string; form: string; title: string; explanation: string; translation_hint: string; confidence: number; source: string}> }
export type GrammarExplanation = { id: string; sentence: string; focus: string; question: string | null; created_at: string; explanation: {interpretation: string; breakdown: Array<{part: string; role: string}>; uncertainty: string}; provider: string; model: string }
export type AiHistoryItem = {id:string;kind:'selection'|'page';question:string;focus:string|null;answer:string;provider:string;model:string;created_at:string;details?:{interpretation?:string;breakdown?:Array<{part:string;role:string}>;uncertainty?:string;summary?:string;notes?:Array<{type:string;title:string;explanation:string;evidence:string;confidence:number}>}}
