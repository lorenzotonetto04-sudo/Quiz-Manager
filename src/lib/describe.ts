/* eslint-disable @typescript-eslint/no-explicit-any */
type Opt = { id: string; text: string }
const optText = (l: Opt[] | undefined, id: string) => l?.find((o) => o.id === id)?.text ?? '—'
const NONE = '(nessuna risposta)'

export function describeAnswer(type: string, c: any, ans: any): string {
  if (ans === null || ans === undefined || ans === '') return NONE
  switch (type) {
    case 'mcq_single': return optText(c.options, ans)
    case 'mcq_multi': return Array.isArray(ans) && ans.length ? ans.map((i: string) => optText(c.options, i)).join(', ') : NONE
    case 'true_false': return ans === true ? 'Vero' : 'Falso'
    case 'matching': { const e = Object.entries(ans || {}); return e.length ? e.map(([l, r]) => `${optText(c.left, l)} → ${optText(c.right, r as string)}`).join('; ') : NONE }
    case 'sentence_completion': case 'fill_blank': case 'conjugation':
      return Array.isArray(ans) ? ans.map((x: string, i: number) => `${i + 1}) ${x || '—'}`).join('   ') : String(ans)
    default: return String(ans)
  }
}

export function describeSolution(type: string, c: any, s: any): string {
  if (!s) return '—'
  switch (type) {
    case 'mcq_single': return optText(c.options, s.correct)
    case 'mcq_multi': return (s.correct || []).map((i: string) => optText(c.options, i)).join(', ') || '—'
    case 'true_false': return s.correct ? 'Vero' : 'Falso'
    case 'matching': return Object.entries(s.pairs || {}).map(([l, r]) => `${optText(c.left, l)} → ${optText(c.right, r as string)}`).join('; ')
    case 'sentence_completion': case 'fill_blank': case 'conjugation':
      return (s.blanks || []).map((b: string[], i: number) => `${i + 1}) ${b.join(' / ')}`).join('   ')
    case 'open': return s.model || '(correzione manuale)'
    default: return (s.accepted || []).join(' / ') || '(correzione manuale)'
  }
}

// Mescolamento ripetibile: lo stesso studente vede sempre lo stesso ordine anche se ricarica la pagina
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  const rnd = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
  const b = [...arr]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}
