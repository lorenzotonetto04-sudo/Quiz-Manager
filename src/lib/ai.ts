/* eslint-disable @typescript-eslint/no-explicit-any */
import { blankQuestion, newId, validateQuestion, type Q } from './types'

const DEFAULT_POINTS: Record<string, number> = { mcq_single: 1, mcq_multi: 2, true_false: 1, sentence_completion: 2, fill_blank: 2, conjugation: 2, short_answer: 2, transformation: 3, translation: 3, open: 5, matching: 3 }
const strs = (l: unknown, max = 10) => (Array.isArray(l) ? l : []).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max)

// Trasforma una domanda proposta dall'AI in una domanda dell'app. Se è incoerente o incompleta restituisce null.
export function fromAi(it: any): Q | null {
  const type = String(it?.type ?? '')
  if (!(type in DEFAULT_POINTS)) return null
  const text = String(it?.text ?? '').trim()
  if (!text) return null
  const q = blankQuestion(type)
  q.content.text = text.slice(0, 2000)
  q.explanation = String(it?.explanation ?? '').trim().slice(0, 500)
  const pts = Number(it?.points)
  q.points = pts >= 0.25 && pts <= 20 ? Math.round(pts * 4) / 4 : DEFAULT_POINTS[type]

  if (type === 'mcq_single' || type === 'mcq_multi') {
    const options = strs(it.options, 6); if (options.length < 2) return null
    const opts = options.map((t) => ({ id: newId(), text: t }))
    const idx = type === 'mcq_single' ? [Number(it.correct)] : (Array.isArray(it.correct) ? it.correct.map(Number) : [])
    const ok = Array.from(new Set(idx.filter((i: number) => Number.isInteger(i) && i >= 0 && i < opts.length)))
    if (!ok.length || (type === 'mcq_single' && ok.length !== 1)) return null
    q.content.options = opts
    q.solution = type === 'mcq_single' ? { correct: opts[ok[0] as number].id } : { correct: ok.map((i) => opts[i as number].id), partial: true }
  } else if (type === 'true_false') {
    if (typeof it.correct !== 'boolean' && it.correct !== 'true' && it.correct !== 'false') return null
    q.solution = { correct: it.correct === true || it.correct === 'true' }
  } else if (['sentence_completion', 'fill_blank', 'conjugation'].includes(type)) {
    const n = (q.content.text.match(/___/g) || []).length
    const blanks = (Array.isArray(it.blanks) ? it.blanks : []).map((b: unknown) => strs(Array.isArray(b) ? b : [b], 6))
    if (n < 1 || blanks.length !== n || blanks.some((b: string[]) => !b.length)) return null
    q.solution = { blanks }
  } else if (['short_answer', 'translation', 'transformation'].includes(type)) {
    const accepted = strs(it.accepted, 6)
    q.solution = { auto: type === 'short_answer' && it.auto === true && accepted.length > 0, accepted }
  } else if (type === 'open') {
    q.solution = { model: String(it.model ?? '').trim().slice(0, 1500) }
  } else if (type === 'matching') {
    const pairs = (Array.isArray(it.pairs) ? it.pairs : []).map((p: any) => ({ l: String(p?.left ?? '').trim(), r: String(p?.right ?? '').trim() })).filter((p: any) => p.l && p.r).slice(0, 8)
    if (pairs.length < 2) return null
    const left = pairs.map((p: any) => ({ id: newId(), text: p.l })), right = pairs.map((p: any) => ({ id: newId(), text: p.r }))
    q.content.left = left; q.content.right = right
    q.solution = { pairs: Object.fromEntries(left.map((l: any, i: number) => [l.id, right[i].id])), partial: true }
  }
  return validateQuestion(q) ? null : q
}
