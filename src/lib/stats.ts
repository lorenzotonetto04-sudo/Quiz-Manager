/* eslint-disable @typescript-eslint/no-explicit-any */
// Calcoli delle statistiche. Contano solo le consegne già corrette del tutto (status "graded").

export type Att = {
  id: string; quiz_id: string; student_first: string; student_last: string; status: string
  percent: number | string | null; final_grade_value: number | string | null; final_grade_label: string | null
  submitted_at: string | null; total_points: number | string | null; max_points: number | string | null
  quizzes?: { title: string; subject: string } | null
}
export type Summary = { n: number; avgPercent: number | null; avgGrade: number | null; passRate: number | null }

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const mean = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null)

// Stesso studente anche se nome e cognome sono scritti con maiuscole o spazi diversi
export const studentKey = (a: Att) => `${a.student_first} ${a.student_last}`.toLowerCase().replace(/\s+/g, ' ').trim()
export const studentName = (a: Att) => `${a.student_first.trim()} ${a.student_last.trim()}`

export function summarize(atts: Att[]): Summary {
  const graded = atts.filter((a) => a.status === 'graded')
  const grades = graded.map((a) => num(a.final_grade_value)).filter((x): x is number => x !== null)
  return {
    n: graded.length,
    avgPercent: mean(graded.map((a) => num(a.percent)).filter((x): x is number => x !== null)),
    avgGrade: mean(grades),
    passRate: grades.length ? (grades.filter((g) => g >= 6).length / grades.length) * 100 : null,
  }
}

export function groupBy(atts: Att[], keyOf: (a: Att) => string): { key: string; atts: Att[]; s: Summary }[] {
  const m = new Map<string, Att[]>()
  for (const a of atts) { const k = keyOf(a); m.set(k, [...(m.get(k) ?? []), a]) }
  return [...m.entries()].map(([key, l]) => ({ key, atts: l, s: summarize(l) }))
}

const day = (iso: string) => new Date(iso)
const mondayOf = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
export type Point = { label: string; value: number; n: number }

// Andamento della percentuale media: per settimana se i dati coprono poco tempo, altrimenti per mese
export function timeSeries(atts: Att[]): { points: Point[]; unit: 'settimana' | 'mese' } {
  const g = atts.filter((a) => a.status === 'graded' && a.submitted_at && num(a.percent) !== null)
  if (!g.length) return { points: [], unit: 'mese' }
  const times = g.map((a) => day(a.submitted_at!).getTime())
  const span = (Math.max(...times) - Math.min(...times)) / 86400000
  const unit = span <= 70 ? 'settimana' : 'mese'
  const buckets = new Map<string, { t: number; v: number[] }>()
  for (const a of g) {
    const d = day(a.submitted_at!)
    const start = unit === 'settimana' ? mondayOf(d) : new Date(d.getFullYear(), d.getMonth(), 1)
    const k = start.toISOString().slice(0, 10)
    const b = buckets.get(k) ?? { t: start.getTime(), v: [] }; b.v.push(num(a.percent)!); buckets.set(k, b)
  }
  const points = [...buckets.values()].sort((a, b) => a.t - b.t).map((b) => ({
    label: unit === 'settimana' ? new Date(b.t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
      : new Date(b.t).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
    value: mean(b.v)!, n: b.v.length }))
  return { points, unit }
}

// Storico di uno studente: un punto per ogni verifica, in ordine di data
export function history(atts: Att[]): Point[] {
  return atts.filter((a) => a.status === 'graded' && a.submitted_at && num(a.percent) !== null)
    .sort((a, b) => day(a.submitted_at!).getTime() - day(b.submitted_at!).getTime())
    .map((a) => ({ label: day(a.submitted_at!).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }), value: num(a.percent)!, n: 1 }))
}

export const fmt1 = (n: number | null) => (n === null ? '–' : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','))
export const fmt2 = (n: number | null) => (n === null ? '–' : (Math.round(n * 100) / 100).toFixed(2).replace('.', ','))

export function lineChartSvg(points: Point[], title: string): string {
  const W = 640, H = 230, L = 40, R = 14, T = 12, B = 30
  const pw = W - L - R, ph = H - T - B
  const PAD = 26 // margine interno, così valori e date alle estremità non vengono tagliati
  const x = (i: number) => L + (points.length === 1 ? pw / 2 : PAD + ((pw - 2 * PAD) * i) / (points.length - 1))
  const y = (v: number) => T + ph - (Math.max(0, Math.min(100, v)) / 100) * ph
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${title.replace(/"/g, '')}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif" font-size="11">`
  for (const g of [0, 25, 50, 75, 100]) s += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="#e2e8f0"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end" fill="#64748b">${g}%</text>`
  if (!points.length) return s + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#64748b">Nessun dato</text></svg>`
  s += `<polyline fill="none" stroke="#134e5e" stroke-width="2.5" stroke-linejoin="round" points="${points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>`
  const step = Math.ceil(points.length / 8)
  points.forEach((p, i) => {
    s += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" fill="#134e5e"/>`
    s += `<text x="${x(i).toFixed(1)}" y="${(y(p.value) - 9).toFixed(1)}" text-anchor="middle" fill="#134e5e" font-weight="bold">${fmt1(p.value)}</text>`
    if (i % step === 0 || i === points.length - 1) s += `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="#64748b">${p.label}</text>`
  })
  return s + '</svg>'
}
