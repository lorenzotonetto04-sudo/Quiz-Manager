export const TYPES: Record<string, string> = {
  mcq_single: 'Scelta multipla (una risposta)',
  mcq_multi: 'Scelta multipla (più risposte)',
  true_false: 'Vero o falso',
  sentence_completion: 'Completamento di frasi',
  fill_blank: 'Parole mancanti',
  short_answer: 'Risposta breve',
  open: 'Risposta aperta',
  translation: 'Traduzione',
  conjugation: 'Coniugazione dei verbi',
  transformation: 'Trasformazione di frasi',
  matching: 'Abbinamento',
}
export const BLANK_TYPES = ['sentence_completion', 'fill_blank', 'conjugation']
export const TEXT_TYPES = ['short_answer', 'translation', 'transformation']
export const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
export const newId = () => crypto.randomUUID()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Q = { id: string; type: string; points: number; content: any; solution: any; explanation: string }

export function blankQuestion(type: string): Q {
  const base = { id: newId(), type, points: 1, explanation: '' }
  switch (type) {
    case 'mcq_single': case 'mcq_multi': {
      const a = newId(), b = newId()
      return { ...base, content: { text: '', options: [{ id: a, text: '' }, { id: b, text: '' }] },
        solution: type === 'mcq_single' ? { correct: a } : { correct: [], partial: false } }
    }
    case 'true_false': return { ...base, content: { text: '' }, solution: { correct: true } }
    case 'matching': {
      const l = newId(), r = newId()
      return { ...base, content: { text: '', left: [{ id: l, text: '' }], right: [{ id: r, text: '' }] },
        solution: { pairs: { [l]: r }, partial: true } }
    }
    case 'open': return { ...base, points: 5, content: { text: '' }, solution: { model: '' } }
    default:
      if (BLANK_TYPES.includes(type)) return { ...base, content: { text: '' }, solution: { blanks: [] } }
      return { ...base, content: { text: '' }, solution: { auto: false, accepted: [] } }
  }
}

// Controlla una domanda: restituisce un messaggio d'errore oppure null
export function validateQuestion(q: Q): string | null {
  if (!q.content.text?.trim()) return 'manca il testo';
  if (q.type.startsWith('mcq')) {
    const o = q.content.options
    if (o.length < 2 || o.some((x: { text: string }) => !x.text.trim())) return 'servono almeno 2 opzioni compilate'
    const c = q.type === 'mcq_single' ? [q.solution.correct].filter(Boolean) : q.solution.correct
    if (c.length < 1) return 'indica la risposta corretta'
  }
  if (BLANK_TYPES.includes(q.type)) {
    const n = (q.content.text.match(/___/g) || []).length
    if (n < 1) return 'inserisci almeno uno spazio "___"'
    for (let i = 0; i < n; i++) if (!(q.solution.blanks?.[i] || []).length) return `manca la risposta dello spazio ${i + 1}`
  }
  if (q.type === 'matching') {
    const l = q.content.left
    if (l.length < 2) return 'servono almeno 2 coppie'
    if (l.some((x: { text: string }) => !x.text.trim()) || q.content.right.some((x: { text: string }) => !x.text.trim())) return 'compila tutte le coppie'
  }
  if (TEXT_TYPES.includes(q.type) && q.solution.auto && !(q.solution.accepted || []).length) return 'indica le risposte accettate'
  if (!(q.points >= 0)) return 'punteggio non valido'
  return null
}
