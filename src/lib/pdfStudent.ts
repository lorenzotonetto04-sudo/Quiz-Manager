/* eslint-disable @typescript-eslint/no-explicit-any */
import { PdfWriter, textWidth, type FontKey } from './pdfDoc'
import { ML, CW, TOP, BOTTOM, LH, wrap } from './pdfQuiz'
import { drawAttempt, addFooters } from './pdfAttempt'
import { summarize, groupBy, history, fmt1, fmt2, type Att } from './stats'
import { fmtNum } from './types'

type RGB = [number, number, number]
const BRAND: RGB = [0.075, 0.306, 0.369], GREEN: RGB = [0.08, 0.45, 0.2], ORANGE: RGB = [0.8, 0.42, 0.05]
export type Detail = { att: any; quiz: any; items: any[] }

// Archivio di uno studente: riepilogo (medie, grafico, elenco) e, facoltativamente, tutte le verifiche compilate.
export function buildStudentPdf(name: string, atts: Att[], filterText: string, details: Detail[] | null): Uint8Array {
  const pdf = new PdfWriter()
  let y = TOP
  pdf.addPage()
  const newPage = () => { pdf.addPage(); y = TOP }
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage() }
  const text = (s: string, o: { size?: number; font?: FontKey; gray?: number; rgb?: RGB; gap?: number; x?: number; w?: number } = {}) => {
    const size = o.size ?? 10.5, font = o.font ?? 'F1', lh = size * LH
    const ls = wrap(s, o.w ?? CW, size, font)
    for (const l of ls) { ensure(lh); pdf.text(ML + (o.x ?? 0), y, l, size, font, o.gray ?? 0, o.rgb); y += lh } // riga per riga: il testo prosegue nella pagina successiva
    y += o.gap ?? 0
  }

  const sorted = [...atts].sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
  const sum = summarize(sorted)
  const toCorrect = sorted.filter((a) => a.status === 'submitted').length

  // ---- intestazione ----
  text('ARCHIVIO STUDENTE', { size: 8.5, font: 'F2', gray: 0.3, gap: 2 })
  text(name, { size: 20, font: 'F2', gap: 2 })
  text(`Generato il ${new Date().toLocaleDateString('it-IT')}${filterText ? `  ·  ${filterText}` : ''}`, { size: 9.5, gray: 0.35, gap: 4 })
  pdf.line(ML, y + 3, ML + CW, y + 3, 1.4, 0.15); y += 14

  // ---- riquadri con le medie ----
  const boxes: [string, string, RGB][] = [
    ['Verifiche corrette', String(sum.n), BRAND],
    ['Percentuale media', sum.avgPercent === null ? '–' : fmt1(sum.avgPercent) + '%', BRAND],
    ['Media dei voti', fmt2(sum.avgGrade), BRAND],
    ['Voti sufficienti (6 o più)', sum.passRate === null ? '–' : fmt1(sum.passRate) + '%', GREEN],
  ]
  const bw = (CW - 3 * 8) / 4
  ensure(52)
  boxes.forEach(([label, value, color], i) => {
    const x = ML + i * (bw + 8)
    pdf.rect(x, y, bw, 46, 0.7)
    pdf.text(x + 8, y + 7, value, 17, 'F2', 0, color)
    pdf.text(x + 8, y + 31, label, 8.5, 'F1', 0.4)
  })
  y += 54
  if (toCorrect) text(`${toCorrect} ${toCorrect === 1 ? 'verifica è ancora da correggere e non è inclusa' : 'verifiche sono ancora da correggere e non sono incluse'} nelle medie.`, { size: 9, font: 'F3', rgb: ORANGE, gap: 6 })

  // ---- tabella generica (con intestazione ripetuta a ogni pagina) ----
  const table = (cols: { t: string; w: number }[], rows: { cells: string[]; rgb?: RGB[] }[]) => {
    const xs = cols.reduce<number[]>((a, c, i) => [...a, i ? a[i - 1] + cols[i - 1].w : 0], [])
    const header = () => {
      ensure(24)
      cols.forEach((c, i) => pdf.text(ML + xs[i] + 2, y + 2, c.t, 8.5, 'F2', 0.35))
      pdf.line(ML, y + 15, ML + CW, y + 15, 0.8, 0.3); y += 18
    }
    header()
    for (const r of rows) {
      const cl = r.cells.map((t, i) => wrap(t, cols[i].w - 6, 9.5, 'F1'))
      const h = Math.max(...cl.map((l) => l.length)) * 9.5 * LH + 6
      if (y + h > BOTTOM) { newPage(); header() }
      cl.forEach((ls, i) => ls.forEach((l, k) => pdf.text(ML + xs[i] + 2, y + 3 + k * 9.5 * LH, l, 9.5, 'F1', 0, r.rgb?.[i])))
      pdf.line(ML, y + h, ML + CW, y + h, 0.4, 0.8); y += h
    }
    y += 10
  }

  // ---- per materia ----
  const subjects = groupBy(sorted, (a) => a.quizzes?.subject ?? '–').sort((a, b) => a.key.localeCompare(b.key))
  if (subjects.length) {
    ensure(60); text('Per materia', { size: 12, font: 'F2', gap: 4 })
    table([{ t: 'Materia', w: CW - 270 }, { t: 'Consegne', w: 90 }, { t: '% media', w: 90 }, { t: 'Media voti', w: 90 }],
      subjects.map((g) => ({ cells: [g.key, String(g.s.n), g.s.avgPercent === null ? '–' : fmt1(g.s.avgPercent) + '%', fmt2(g.s.avgGrade)] })))
  }

  // ---- grafico ----
  const hist = history(sorted)
  if (hist.length) {
    ensure(190); text('Andamento: percentuale di ogni verifica', { size: 12, font: 'F2', gap: 6 })
    const L = 30, H = 130, top = y, pad = 20, pw = CW - L - 8
    for (const g of [0, 25, 50, 75, 100]) {
      const gy = top + H - (g / 100) * H
      pdf.line(ML + L, gy, ML + CW, gy, 0.4, 0.85); pdf.text(ML, gy - 4, `${g}%`, 8, 'F1', 0.45)
    }
    const px = (i: number) => ML + L + (hist.length === 1 ? pw / 2 : pad + ((pw - 2 * pad) * i) / (hist.length - 1))
    const py = (v: number) => top + H - (Math.max(0, Math.min(100, v)) / 100) * H
    for (let i = 1; i < hist.length; i++) pdf.line(px(i - 1), py(hist[i - 1].value), px(i), py(hist[i].value), 1.6, 0, BRAND)
    const step = Math.ceil(hist.length / 9)
    hist.forEach((p, i) => {
      pdf.dot(px(i), py(p.value), 3, 0, BRAND)
      const v = fmt1(p.value); pdf.text(px(i) - textWidth(v, 8, 'F2') / 2, py(p.value) - 15, v, 8, 'F2', 0, BRAND)
      if (i % step === 0 || i === hist.length - 1) pdf.text(px(i) - textWidth(p.label, 8) / 2, top + H + 6, p.label, 8, 'F1', 0.4)
    })
    y += H + 26
  }

  // ---- elenco di tutte le verifiche ----
  ensure(60); text('Tutte le verifiche', { size: 12, font: 'F2', gap: 4 })
  table([{ t: 'Data', w: 58 }, { t: 'Verifica', w: CW - 58 - 90 - 62 - 50 - 76 }, { t: 'Materia', w: 90 }, { t: 'Punti', w: 62 }, { t: '%', w: 50 }, { t: 'Voto', w: 76 }],
    sorted.map((a) => {
      const done = a.status === 'graded'
      return { cells: [a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('it-IT') : '', a.quizzes?.title ?? '', a.quizzes?.subject ?? '',
        done ? `${fmtNum(Number(a.total_points))}/${fmtNum(Number(a.max_points))}` : '–', done ? fmt1(Number(a.percent)) + '%' : '–', done ? a.final_grade_label ?? '–' : 'da correggere'],
        rgb: done ? undefined : [undefined as any, undefined as any, undefined as any, undefined as any, undefined as any, ORANGE] }
    }))

  // ---- verifiche compilate (versione completa) ----
  if (details) {
    for (const d of [...details].sort((a, b) => (a.att.submitted_at ?? '').localeCompare(b.att.submitted_at ?? ''))) drawAttempt(pdf, d.quiz, d.att, d.items)
  }
  addFooters(pdf, `Archivio di ${name}`)
  return pdf.build()
}
