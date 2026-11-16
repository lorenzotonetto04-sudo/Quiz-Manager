/* eslint-disable @typescript-eslint/no-explicit-any */
import { PdfWriter, textWidth, type FontKey } from './pdfDoc'
import { TYPES, BLANK_TYPES, fmtNum, type Q } from './types'
import { describeSolution, seededShuffle } from './describe'

type Row = { h: number; draw: (x: number, y: number) => void }
export const ML = 42.5, CW = 595.28 - 2 * 42.5, TOP = 44, BOTTOM = 841.89 - 52, LH = 1.3
export const clean = (s: unknown) => String(s ?? '').replace(/→/g, '->').replace(/[✔✓☐○]/g, '').replace(/\r/g, '')

// Spezza il testo in righe che stanno nella larghezza data
export function wrap(text: string, width: number, size: number, font: FontKey): string[] {
  const out: string[] = []
  for (const para of clean(text).split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      let w = word
      while (textWidth(w, size, font) > width) { // parola più lunga della riga: la spezzo
        let k = w.length - 1
        while (k > 1 && textWidth(w.slice(0, k), size, font) > width) k--
        if (line) { out.push(line); line = '' }
        out.push(w.slice(0, k)); w = w.slice(k)
      }
      const cand = line ? line + ' ' + w : w
      if (line && textWidth(cand, size, font) > width) { out.push(line); line = w } else line = cand
    }
    out.push(line)
  }
  return out
}

export function rightOrder(q: Q): { id: string; text: string }[] {
  const r = q.content.right as { id: string; text: string }[]
  const s = seededShuffle(r, q.id)
  return r.length > 1 && s.every((x, i) => x.id === r[i].id) ? [...r.slice(1), r[0]] : s
}
export const letter = (i: number) => String.fromCharCode(65 + i)

export function buildQuizPdf(kind: 'studente' | 'correttore', quiz: any, qs: Q[], pass: number | null): Uint8Array {
  const key = kind === 'correttore'
  const pdf = new PdfWriter()
  let y = TOP
  pdf.addPage()
  const newPage = () => { pdf.addPage(); y = TOP }

  // ---- mattoncini di layout ----
  const para = (text: string, o: { x?: number; w?: number; size?: number; font?: FontKey; gray?: number; gap?: number } = {}): Row => {
    const size = o.size ?? 11, font = o.font ?? 'F1', w = o.w ?? CW, lh = size * LH
    const lines = wrap(text, w, size, font)
    return { h: lines.length * lh + (o.gap ?? 0), draw: (x, yy) => lines.forEach((l, i) => pdf.text(x + (o.x ?? 0), yy + i * lh, l, size, font, o.gray ?? 0)) }
  }
  const space = (h: number): Row => ({ h, draw: () => {} })
  const lines = (count: number): Row => ({ h: count * 24 + 4, draw: (x, yy) => { for (let i = 1; i <= count; i++) pdf.line(x, yy + i * 24 - 2, x + CW, yy + i * 24 - 2, 0.6, 0.55) } })
  const option = (text: string, multi: boolean, ok: boolean | null): Row => { // ok: null = verifica studente
    const lines_ = wrap(text, CW - 26, 10.5, ok ? 'F2' : 'F1')
    return { h: lines_.length * 10.5 * LH + 3, draw: (x, yy) => {
      if (multi) pdf.rect(x + 2, yy + 1.5, 9, 9); else pdf.circle(x + 6.5, yy + 6, 4.8)
      if (ok) pdf.tick(x + 3, yy + 3.2, 7)
      lines_.forEach((l, i) => pdf.text(x + 22, yy + i * 10.5 * LH, l, 10.5, ok ? 'F2' : 'F1', ok === false ? 0.35 : 0))
    } }
  }
  const place = (rows: Row[], together = true) => {
    const total = rows.reduce((t, r) => t + r.h, 0)
    if (together && total <= BOTTOM - TOP && y + total > BOTTOM) newPage()
    for (const r of rows) { if (y + r.h > BOTTOM) newPage(); r.draw(ML, y); y += r.h }
  }

  // ---- intestazione ----
  const total = qs.reduce((t, q) => t + (Number(q.points) || 0), 0)
  const head: Row[] = []
  if (key) head.push(para('CORRETTORE - RISERVATO AL DOCENTE', { size: 8.5, font: 'F2', gray: 0.3, gap: 2 }))
  head.push(para(quiz.title, { size: 17, font: 'F2', gap: 2 }))
  const meta = [quiz.subject, quiz.topic, quiz.level].filter(Boolean).join('  ·  ')
  if (meta) head.push(para(meta, { size: 10, gray: 0.35, gap: 4 }))
  head.push({ h: 8, draw: (x, yy) => pdf.line(x, yy + 3, x + CW, yy + 3, 1.4, 0.15) })
  if (!key) head.push({ h: 30, draw: (x, yy) => {
    pdf.text(x, yy + 12, 'Nome e cognome', 10); pdf.line(x + 78, yy + 22, x + 330, yy + 22, 0.6, 0.4)
    pdf.text(x + 350, yy + 12, 'Data', 10); pdf.line(x + 378, yy + 22, x + CW, yy + 22, 0.6, 0.4) } })
  if (!key && quiz.instructions) head.push(para(quiz.instructions, { size: 10, font: 'F3', gray: 0.2, gap: 6 }))
  const info = (quiz.duration_minutes ? `Durata: ${quiz.duration_minutes} minuti  ·  ` : '') + `Punteggio massimo: ${fmtNum(total)} punti` +
    (key && pass !== null ? `  ·  Sufficienza: ${fmtNum(pass)}% (${fmtNum(Math.round(total * pass) / 100)} punti)` : '')
  head.push(para(info, { size: 10, font: 'F2', gap: 12 }))
  place(head, false)

  // ---- domande ----
  qs.forEach((q, i) => {
    const c = q.content, sol: any = q.solution
    const text = BLANK_TYPES.includes(q.type) ? String(c.text).replace(/___/g, '______________') : String(c.text)
    const pts = `${fmtNum(Number(q.points))} pt`
    const ptsW = textWidth(pts, 10)
    const tl = wrap(`${i + 1}. ${text}`, CW - ptsW - 14, 11, 'F2')
    const rows: Row[] = [{ h: tl.length * 11 * LH + 2, draw: (x, yy) => {
      tl.forEach((l, k) => pdf.text(x, yy + k * 11 * LH, l, 11, 'F2'))
      pdf.text(x + CW - ptsW, yy, pts, 10) } }]
    if (key) rows.push(para(`(${TYPES[q.type]})`, { size: 8.5, font: 'F3', gray: 0.45, gap: 2 }))

    if (q.type === 'mcq_single' || q.type === 'mcq_multi') {
      const multi = q.type === 'mcq_multi'
      if (!key && multi) rows.push(para('Più risposte possibili.', { size: 9, font: 'F3', gap: 2 }))
      const okIds: string[] = multi ? sol?.correct || [] : [sol?.correct]
      c.options.forEach((o: any) => rows.push(option(o.text, multi, key ? okIds.includes(o.id) : null)))
      if (key && multi) rows.push(para(sol?.partial ? 'Punteggio parziale.' : 'Punteggio tutto o niente.', { size: 9, font: 'F3', gap: 2 }))
    } else if (q.type === 'true_false') {
      if (!key) rows.push({ h: 18, draw: (x, yy) => { pdf.rect(x + 2, yy + 2, 9, 9); pdf.text(x + 18, yy, 'Vero', 10.5); pdf.rect(x + 102, yy + 2, 9, 9); pdf.text(x + 118, yy, 'Falso', 10.5) } })
      else rows.push(para(`Risposta: ${sol?.correct ? 'Vero' : 'Falso'}`, { size: 10.5, font: 'F2' }))
    } else if (q.type === 'matching') {
      const ro = rightOrder(q); const half = CW / 2 - 12
      if (!key) rows.push(para('Scrivi accanto a ogni elemento la lettera corrispondente.', { size: 9, font: 'F3', gap: 2 }))
      c.left.forEach((l: any, k: number) => {
        const L = wrap(`${k + 1}. ${l.text}${key ? '' : '   ______'}`, half, 10.5, 'F1'); const R = wrap(`${letter(k)}. ${ro[k]?.text ?? ''}`, half, 10.5, 'F1')
        const lines_ = Math.max(L.length, R.length)
        rows.push({ h: lines_ * 10.5 * LH + 3, draw: (x, yy) => { L.forEach((t, j) => pdf.text(x, yy + j * 10.5 * LH, t, 10.5, 'F1', key ? 0.35 : 0)); R.forEach((t, j) => pdf.text(x + CW / 2 + 12, yy + j * 10.5 * LH, t, 10.5, 'F1', key ? 0.35 : 0)) } })
      })
      if (key) rows.push(para('Soluzione:  ' + c.left.map((l: any, k: number) => `${k + 1} = ${letter(ro.findIndex((r) => r.id === sol?.pairs?.[l.id]))}`).join('    '), { size: 10.5, font: 'F2' }))
    } else if (key) {
      rows.push(para('Risposta: ' + describeSolution(q.type, c, sol), { size: 10.5, font: 'F2' }))
    } else if (q.type === 'short_answer') rows.push(lines(2))
    else if (q.type === 'translation' || q.type === 'transformation') rows.push(lines(4))
    else if (q.type === 'open') rows.push(lines(9))
    // completamenti: gli spazi sono già nel testo della domanda

    if (key && q.explanation) rows.push(para('Spiegazione: ' + q.explanation, { size: 9.5, font: 'F3', gray: 0.3, gap: 2 }))
    rows.push(space(12))
    place(rows)
  })
  if (key) place([{ h: 22, draw: (x, yy) => { pdf.line(x, yy + 2, x + CW, yy + 2, 0.7, 0.4); const t = `Punteggio totale: ${fmtNum(total)} punti`; pdf.text(x + CW - textWidth(t, 11, 'F2'), yy + 7, t, 11, 'F2') } }], false)

  // ---- piè di pagina con numero di pagina ----
  const n = pdf.pageCount
  for (let p = 0; p < n; p++) {
    pdf.goto(p)
    const t = `${clean(quiz.title)}${key ? ' - Correttore' : ''}  ·  pagina ${p + 1} di ${n}`
    pdf.text((pdf.width - textWidth(t, 8.5)) / 2, pdf.height - 36, t, 8.5, 'F1', 0.45)
  }
  return pdf.build()
}
