export type ScaleRow = { min: string; label: string }

// "6+" -> 6,25   "6-" -> 5,75   "6,5" -> 6,5   (valore numerico usato per le medie)
export function gradeValue(label: string): number | null {
  const m = label.trim().replace(',', '.').match(/^(\d+(?:\.\d+)?)([+-]?)$/)
  if (!m) return null
  const v = Number(m[1]) + (m[2] === '+' ? 0.25 : m[2] === '-' ? -0.25 : 0)
  return v >= 0 && v <= 99 ? v : null
}

const BELOW = ['2', '3', '4', '4+', '5-', '5', '5+', '5,5', '6-']
const ABOVE = ['6', '6+', '6,5', '7-', '7', '7+', '7,5', '8-', '8', '8+', '8,5', '9', '9+', '9,5', '10']
const r2 = (x: number) => Math.round(x * 100) / 100
const fmt = (n: number) => String(n).replace('.', ',')

// Crea una scala completa con il "6" che parte dalla percentuale di sufficienza scelta
export function generateScale(pass: number): ScaleRow[] {
  const rows: ScaleRow[] = []
  BELOW.forEach((l, i) => rows.push({ min: fmt(r2((pass * i) / BELOW.length)), label: l }))
  ABOVE.forEach((l, i) => rows.push({ min: fmt(r2(pass + ((100 - pass) * i) / ABOVE.length)), label: l }))
  return rows
}

export const toNum = (s: string) => Number(String(s).replace(',', '.'))

// Controlla la tabella: restituisce un messaggio d'errore oppure null
export function validateScale(rows: ScaleRow[]): string | null {
  if (rows.length < 2) return 'Servono almeno due righe.'
  const mins = rows.map((r) => toNum(r.min))
  if (mins.some((m) => Number.isNaN(m) || m < 0 || m > 100)) return 'Le percentuali devono essere numeri tra 0 e 100.'
  const sorted = [...rows].sort((a, b) => toNum(a.min) - toNum(b.min))
  if (toNum(sorted[0].min) !== 0) return 'La prima riga deve partire da 0%, così nessuna percentuale resta senza voto.'
  for (let i = 1; i < sorted.length; i++)
    if (toNum(sorted[i].min) - toNum(sorted[i - 1].min) < 0.01) return `Due righe iniziano alla stessa percentuale (${sorted[i].min}%): gli intervalli si sovrapporrebbero.`
  const bad = sorted.find((r) => gradeValue(r.label) === null)
  if (bad) return `Voto non riconosciuto: "${bad.label}". Usa per esempio 6, 6+, 6-, 6,5.`
  return null
}

// Voto per una percentuale (stessa logica del database)
export function lookup(rows: ScaleRow[], percent: number, rounding: string): string | null {
  const p = rounding === 'whole' ? Math.round(percent) : rounding === 'half' ? Math.round(percent * 2) / 2 : percent
  const sorted = [...rows].sort((a, b) => toNum(b.min) - toNum(a.min))
  return sorted.find((r) => toNum(r.min) <= p)?.label ?? null
}
