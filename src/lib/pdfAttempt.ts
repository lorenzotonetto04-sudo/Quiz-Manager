/* eslint-disable @typescript-eslint/no-explicit-any */
import { PdfWriter, textWidth, type FontKey } from './pdfDoc'
import { ML, CW, TOP, BOTTOM, LH, wrap, clean } from './pdfQuiz'
import { BLANK_TYPES, fmtNum } from './types'
import { describeAnswer, describeSolution } from './describe'

type Row = { h: number; draw: (x: number, y: number) => void; parts?: Row[] } // parts: righe in cui il blocco può essere spezzato tra due pagine
type RGB = [number, number, number]
const GREEN: RGB = [0.08, 0.45, 0.2], RED: RGB = [0.72, 0.12, 0.12], ORANGE: RGB = [0.8, 0.42, 0.05], BLUE: RGB = [0.1, 0.3, 0.55]

// PDF di una consegna: verifica compilata dallo studente + soluzioni dove la risposta non è del tutto corretta.
// items: [{ q: domanda, an: risposta data, s: soluzione }]
export function drawAttempt(pdf: PdfWriter, quiz: any, att: any, items: any[]): void {
  let y = TOP
  pdf.addPage() // la consegna inizia sempre su una pagina nuova
  const newPage = () => { pdf.addPage(); y = TOP }

  const para = (text: string, o: { x?: number; w?: number; size?: number; font?: FontKey; gray?: number; rgb?: RGB; gap?: number } = {}): Row => {
    const size = o.size ?? 10.5, font = o.font ?? 'F1', w = o.w ?? CW, lh = size * LH
    const ls = wrap(text, w, size, font)
    const gap = o.gap ?? 0
    const parts: Row[] = ls.map((l, i) => ({ h: lh + (i === ls.length - 1 ? gap : 0), draw: (x, yy) => pdf.text(x + (o.x ?? 0), yy, l, size, font, o.gray ?? 0, o.rgb) }))
    return { h: ls.length * lh + gap, draw: (x, yy) => ls.forEach((l, i) => pdf.text(x + (o.x ?? 0), yy + i * lh, l, size, font, o.gray ?? 0, o.rgb)), parts }
  }
  const place = (rows: Row[], together = true) => {
    const total = rows.reduce((t, r) => t + r.h, 0)
    if (together && total <= BOTTOM - TOP && y + total > BOTTOM) newPage()
    for (const r of rows.flatMap((x) => x.parts ?? [x])) { if (y + r.h > BOTTOM) newPage(); r.draw(ML, y); y += r.h }
  }
  const option = (text: string, multi: boolean, chosen: boolean, isCorrect: boolean, showSol: boolean): Row => {
    const wrongPick = chosen && showSol && !isCorrect
    const good = showSol && isCorrect
    const color: RGB | undefined = good ? GREEN : wrongPick ? RED : undefined
    const font: FontKey = good || wrongPick ? 'F2' : 'F1'
    const ls = wrap(text + (good ? '   (risposta corretta)' : ''), CW - 26, 10.5, font)
    return { h: ls.length * 10.5 * LH + 3, draw: (x, yy) => {
      if (multi) { pdf.rect(x + 2, yy + 1.5, 9, 9); if (chosen) pdf.cross(x + 3.5, yy + 3, 6) }
      else { pdf.circle(x + 6.5, yy + 6, 4.8); if (chosen) pdf.dot(x + 6.5, yy + 6, 2.6) }
      ls.forEach((l, i) => pdf.text(x + 22, yy + i * 10.5 * LH, l, 10.5, font, 0, color))
    } }
  }

  // ---- intestazione ----
  const secs = att.time_spent_seconds as number | null
  const when = att.submitted_at ? new Date(att.submitted_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : ''
  const head: Row[] = [
    para('VERIFICA COMPILATA', { size: 8.5, font: 'F2', gray: 0.3, gap: 2 }),
    para(quiz.title, { size: 17, font: 'F2', gap: 2 }),
    para(`${att.student_first} ${att.student_last}`, { size: 12, font: 'F2', gap: 2 }),
    para([when && `Consegnata il ${when}`, secs !== null && secs !== undefined ? `Tempo impiegato: ${Math.floor(secs / 60)} min ${secs % 60} s` : ''].filter(Boolean).join('  ·  '), { size: 9.5, gray: 0.35, gap: 4 }),
    { h: 8, draw: (x, yy) => pdf.line(x, yy + 3, x + CW, yy + 3, 1.4, 0.15) },
    para(`Punteggio: ${fmtNum(Number(att.total_points))} / ${fmtNum(Number(att.max_points))} punti   ·   ${fmtNum(Number(att.percent))}%   ·   Voto: ${att.final_grade_label ?? '–'}`, { size: 11.5, font: 'F2', gap: 4 }),
  ]
  if (att.status === 'submitted') head.push(para('Alcune risposte sono ancora da correggere: il punteggio non è definitivo.', { size: 9.5, font: 'F3', rgb: ORANGE, gap: 2 }))
  if (att.teacher_comment) head.push(para('Commento del docente: ' + att.teacher_comment, { size: 10, font: 'F3', rgb: BLUE, gap: 2 }))
  head.push({ h: 10, draw: () => {} })
  place(head, false)

  // ---- domande ----
  items.forEach(({ q, an, s }: any, i: number) => {
    const c = q.content, sol = s?.solution
    const max = Number(an.max_points)
    const pts = an.manual_points ?? an.auto_points
    const status = pts === null || pts === undefined ? 'pending' : Number(pts) >= max ? 'full' : Number(pts) === 0 ? 'zero' : 'part'
    const color: RGB = status === 'full' ? GREEN : status === 'zero' ? RED : ORANGE
    const showSol = status !== 'full'
    const badge = status === 'pending' ? `da correggere / ${fmtNum(max)} pt` : `${fmtNum(Number(pts))} / ${fmtNum(max)} pt`
    const bw = textWidth(badge, 10, 'F2')
    const text = BLANK_TYPES.includes(q.type) ? String(c.text).replace(/___/g, '______________') : String(c.text)
    const tl = wrap(`${i + 1}. ${text}`, CW - bw - 14, 11, 'F2')
    const rows: Row[] = [{ h: tl.length * 11 * LH + 2, draw: (x, yy) => {
      tl.forEach((l, k) => pdf.text(x, yy + k * 11 * LH, l, 11, 'F2'))
      pdf.text(x + CW - bw, yy, badge, 10, 'F2', 0, status === 'pending' ? undefined : color) },
      parts: tl.map((l, k): Row => ({ h: 11 * LH + (k === tl.length - 1 ? 2 : 0), draw: (x, yy) => { pdf.text(x, yy, l, 11, 'F2'); if (k === 0) pdf.text(x + CW - bw, yy, badge, 10, 'F2', 0, status === 'pending' ? undefined : color) } })) }]
    const ans = an.answer

    if (q.type === 'mcq_single' || q.type === 'mcq_multi') {
      const multi = q.type === 'mcq_multi'
      const picked: string[] = multi ? (Array.isArray(ans) ? ans : []) : ans ? [ans] : []
      const okIds: string[] = multi ? sol?.correct || [] : [sol?.correct]
      c.options.forEach((o: any) => rows.push(option(o.text, multi, picked.includes(o.id), okIds.includes(o.id), showSol)))
      if (!picked.length) rows.push(para('(nessuna risposta)', { size: 9.5, font: 'F3', gray: 0.4, gap: 2 }))
    } else if (q.type === 'true_false') {
      rows.push({ h: 18, draw: (x, yy) => {
        pdf.rect(x + 2, yy + 2, 9, 9); if (ans === true) pdf.cross(x + 3.5, yy + 3.5, 6); pdf.text(x + 18, yy, 'Vero', 10.5)
        pdf.rect(x + 102, yy + 2, 9, 9); if (ans === false) pdf.cross(x + 103.5, yy + 3.5, 6); pdf.text(x + 118, yy, 'Falso', 10.5) } })
      if (ans !== true && ans !== false) rows.push(para('(nessuna risposta)', { size: 9.5, font: 'F3', gray: 0.4, gap: 2 }))
      if (showSol) rows.push(para(`Risposta corretta: ${sol?.correct ? 'Vero' : 'Falso'}`, { font: 'F2', rgb: GREEN, gap: 2 }))
    } else {
      const given = describeAnswer(q.type, c, ans)
      rows.push(para('Risposta dello studente:', { size: 8.5, font: 'F3', gray: 0.4 }))
      rows.push(para(given, { size: 10.5, gap: 3, rgb: given.startsWith('(nessuna') ? undefined : status === 'full' ? GREEN : status === 'zero' ? RED : undefined, gray: given.startsWith('(nessuna') ? 0.4 : 0 }))
      if (showSol) {
        const manual = q.type === 'open' || sol?.auto !== true && ['translation', 'short_answer', 'transformation'].includes(q.type)
        rows.push(para(manual ? 'Risposta di riferimento:' : 'Risposta corretta:', { size: 8.5, font: 'F3', gray: 0.4 }))
        rows.push(para(describeSolution(q.type, c, sol), { size: 10.5, font: 'F2', rgb: GREEN, gap: 3 }))
      }
    }
    if (an.comment) rows.push(para('Commento del docente: ' + an.comment, { size: 9.5, font: 'F3', rgb: BLUE, gap: 2 }))
    if (showSol && s?.explanation) rows.push(para('Spiegazione: ' + s.explanation, { size: 9.5, font: 'F3', gray: 0.3, gap: 2 }))
    rows.push({ h: 12, draw: () => {} })
    place(rows)
  })

}

// Piè di pagina con numero di pagina su tutte le pagine del documento
export function addFooters(pdf: PdfWriter, label: string): void {
  const n = pdf.pageCount
  for (let p = 0; p < n; p++) {
    pdf.goto(p)
    const t = `${clean(label)}  ·  pagina ${p + 1} di ${n}`
    pdf.text((pdf.width - textWidth(t, 8.5)) / 2, pdf.height - 36, t, 8.5, 'F1', 0.45)
  }
}

export function buildAttemptPdf(quiz: any, att: any, items: any[]): Uint8Array {
  const pdf = new PdfWriter()
  drawAttempt(pdf, quiz, att, items)
  addFooters(pdf, `${quiz.title}  ·  ${att.student_last} ${att.student_first}`)
  return pdf.build()
}
