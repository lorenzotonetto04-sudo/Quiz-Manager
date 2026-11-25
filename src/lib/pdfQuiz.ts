/* eslint-disable @typescript-eslint/no-explicit-any */
import { PdfWriter, textWidth, type FontKey } from './pdfDoc'
import { TYPES, BLANK_TYPES, fmtNum, type Q } from './types'
import { describeSolution, seededShuffle } from './describe'

type Row = { h: number; draw: (x: number, y: number) => void; parts?: Row[] } // parts: righe in cui il blocco può essere spezzato tra due pagine
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

export type PassageIn = { id: string; title: string; body: string; imagePath?: string | null }
export type ImageIn = { bytes: Uint8Array; w: number; h: number; comps: number }
export type Extras = { passages?: PassageIn[]; images?: Record<string, ImageIn>; version?: number }

export const versionLetter = (v: number) => String.fromCharCode(65 + v)

// Un brano con le sue domande è un "blocco" (come un esercizio a sé): le domande di un brano stanno sempre dopo il brano.
function groupByPassage(qs: Q[]): Q[][] {
  const blocks: Q[][] = []; const byPassage = new Map<string, Q[]>()
  for (const q of qs) {
    if (q.passageId) { let b = byPassage.get(q.passageId); if (!b) { b = []; byPassage.set(q.passageId, b); blocks.push(b) } b.push(q) } else blocks.push([q])
  }
  return blocks
}

// Versione 0 (A) = ordine originale (con le domande dei brani riunite). Le altre mescolano l'ordine dei blocchi, delle domande
// dentro ogni brano e delle risposte, in modo ripetibile: ogni domanda conserva risposte corrette e punteggio.
export function versionize(qs: Q[], quizId: string, version: number): Q[] {
  const blocks = groupByPassage(qs)
  if (version <= 0) return blocks.flat()
  const seed = `${quizId}:v${version}`
  const reorder = <T,>(l: T[], s: string): T[] => {
    const r = seededShuffle(l, s)
    return l.length > 1 && r.every((x, i) => x === l[i]) ? [...l.slice(1), l[0]] : r
  }
  const order = reorder(blocks, seed).map((b, k) => (b.length > 1 ? reorder(b, `${seed}:in:${k}:${b[0].passageId}`) : b))
  return order.flat().map((q) => {
    const c = { ...q.content }
    if (Array.isArray(c.options)) c.options = reorder(c.options, `${seed}:${q.id}`)
    if (q.type === 'matching' && Array.isArray(c.right)) c.right = reorder(c.right, `${seed}:r:${q.id}`)
    return { ...q, content: c }
  })
}

export function buildQuizPdf(kind: 'studente' | 'correttore', quiz: any, qs: Q[], pass: number | null, extras: Extras = {}): Uint8Array {
  const key = kind === 'correttore'
  const vTag = extras.version === undefined ? '' : ` · VERSIONE ${versionLetter(extras.version)}`
  qs = versionize(qs, String(quiz.id ?? 'quiz'), extras.version ?? 0)
  const pdf = new PdfWriter()
  let y = TOP
  pdf.addPage()
  const newPage = () => { pdf.addPage(); y = TOP }

  // ---- mattoncini di layout ----
  const para = (text: string, o: { x?: number; w?: number; size?: number; font?: FontKey; gray?: number; gap?: number } = {}): Row => {
    const size = o.size ?? 11, font = o.font ?? 'F1', w = o.w ?? CW, lh = size * LH
    const lines = wrap(text, w, size, font)
    const gap = o.gap ?? 0
    const parts: Row[] = lines.map((l, i) => ({ h: lh + (i === lines.length - 1 ? gap : 0), draw: (x, yy) => pdf.text(x + (o.x ?? 0), yy, l, size, font, o.gray ?? 0) }))
    return { h: lines.length * lh + gap, draw: (x, yy) => lines.forEach((l, i) => pdf.text(x + (o.x ?? 0), yy + i * lh, l, size, font, o.gray ?? 0)), parts }
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
    for (const r of rows.flatMap((x) => x.parts ?? [x])) { if (y + r.h > BOTTOM) newPage(); r.draw(ML, y); y += r.h }
  }

  // ---- immagini e brani ----
  const imgNames: Record<string, string> = {}
  const imageRow = (path?: string | null, x0 = 0, wMax = CW): Row | null => {
    const im = path ? extras.images?.[path] : undefined
    if (!path || !im) return null
    const w0 = Math.min(wMax, 380, im.w * 0.6), maxH = 230
    let w = w0, h = (w0 * im.h) / im.w
    if (h > maxH) { w = (maxH * im.w) / im.h; h = maxH }
    if (!imgNames[path]) imgNames[path] = pdf.addImage(im.bytes, im.w, im.h, im.comps)
    return { h: h + 8, draw: (x, yy) => pdf.image(x + x0, yy + 2, w, h, imgNames[path]) }
  }
  // Il brano ha una barra grigia a sinistra che prosegue su tutte le sue righe
  const passageRows = (p: PassageIn): Row[] => {
    const bar = (r: Row): Row => ({ h: r.h, draw: (x, yy) => { r.draw(x, yy); pdf.line(x + 3, yy, x + 3, yy + r.h, 2, 0.75) }, parts: r.parts?.map(bar) })
    const rows: Row[] = []
    if (p.title) rows.push(bar(para(p.title, { size: 11, font: 'F2', x: 14, w: CW - 14, gap: 3 })))
    rows.push(bar(para(p.body, { size: 10.5, x: 14, w: CW - 14, gap: 4 })))
    const im = imageRow(p.imagePath, 14, CW - 14); if (im) rows.push(bar(im))
    rows.push(space(8))
    return rows
  }

  // ---- intestazione ----
  const total = qs.reduce((t, q) => t + (Number(q.points) || 0), 0)
  const head: Row[] = []
  if (key) head.push(para('CORRETTORE - RISERVATO AL DOCENTE' + vTag, { size: 8.5, font: 'F2', gray: 0.3, gap: 2 }))
  head.push(para(quiz.title, { size: 17, font: 'F2', gap: 2 }))
  if (!key && extras.version !== undefined) head.push(para(`Versione ${versionLetter(extras.version)}`, { size: 12, font: 'F2', gray: 0.2, gap: 2 }))
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
  let lastPassage: string | null = null
  qs.forEach((q, i) => {
    if (q.passageId && q.passageId !== lastPassage) {
      const p = extras.passages?.find((x) => x.id === q.passageId)
      if (p) place(passageRows(p), false)
    }
    lastPassage = q.passageId ?? null
    const c = q.content, sol: any = q.solution
    const text = BLANK_TYPES.includes(q.type) ? String(c.text).replace(/___/g, '______________') : String(c.text)
    const pts = `${fmtNum(Number(q.points))} pt`
    const ptsW = textWidth(pts, 10)
    const tl = wrap(`${i + 1}. ${text}`, CW - ptsW - 14, 11, 'F2')
    const rows: Row[] = [{ h: tl.length * 11 * LH + 2, draw: (x, yy) => {
      tl.forEach((l, k) => pdf.text(x, yy + k * 11 * LH, l, 11, 'F2'))
      pdf.text(x + CW - ptsW, yy, pts, 10) },
      parts: tl.map((l, k): Row => ({ h: 11 * LH + (k === tl.length - 1 ? 2 : 0), draw: (x, yy) => { pdf.text(x, yy, l, 11, 'F2'); if (k === 0) pdf.text(x + CW - ptsW, yy, pts, 10) } })) }]
    if (key) rows.push(para(`(${TYPES[q.type]})`, { size: 8.5, font: 'F3', gray: 0.45, gap: 2 }))
    const qImg = imageRow(q.imagePath); if (qImg) rows.push(qImg)

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
    const t = `${clean(quiz.title)}${key ? ' - Correttore' : ''}${extras.version === undefined ? '' : ' - Versione ' + versionLetter(extras.version)}  ·  pagina ${p + 1} di ${n}`
    pdf.text((pdf.width - textWidth(t, 8.5)) / 2, pdf.height - 36, t, 8.5, 'F1', 0.45)
  }
  return pdf.build()
}
