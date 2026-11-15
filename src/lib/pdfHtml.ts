/* eslint-disable @typescript-eslint/no-explicit-any */
import { TYPES, BLANK_TYPES, fmtNum, type Q } from './types'
import { describeSolution, seededShuffle } from './describe'

// Costruisce una pagina HTML autonoma (A4) da stampare o salvare come PDF.
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const nl = (s: unknown) => esc(s).replace(/\n/g, '<br>')
const lines = (n: number) => '<div class="lines">' + '<div class="line"></div>'.repeat(n) + '</div>'
const letter = (i: number) => String.fromCharCode(65 + i)

// Colonna destra degli abbinamenti: mescolata in modo ripetibile, mai nello stesso ordine delle coppie
function rightOrder(q: Q): { id: string; text: string }[] {
  const r = q.content.right as { id: string; text: string }[]
  const s = seededShuffle(r, q.id)
  return r.length > 1 && s.every((x, i) => x.id === r[i].id) ? [...r.slice(1), r[0]] : s
}

function studentBody(q: Q): string {
  const c = q.content
  switch (q.type) {
    case 'mcq_single': case 'mcq_multi':
      return (q.type === 'mcq_multi' ? '<div class="note">Più risposte possibili.</div>' : '') +
        c.options.map((o: any) => `<div class="opt"><span>${q.type === 'mcq_single' ? '○' : '☐'}</span><span>${esc(o.text)}</span></div>`).join('')
    case 'true_false': return '<div class="tf"><span>☐ Vero</span><span>☐ Falso</span></div>'
    case 'short_answer': return lines(2)
    case 'translation': case 'transformation': return lines(4)
    case 'open': return lines(9)
    case 'matching': {
      const ro = rightOrder(q)
      return '<div class="note">Scrivi accanto a ogni elemento la lettera corrispondente.</div><div class="cols"><div>' +
        c.left.map((l: any, i: number) => `<div class="m">${i + 1}. ${esc(l.text)} <span class="blank"></span></div>`).join('') +
        '</div><div>' + ro.map((r, i) => `<div class="m">${letter(i)}. ${esc(r.text)}</div>`).join('') + '</div></div>'
    }
    default: return ''
  }
}

function keyBody(q: Q): string {
  const c = q.content; const sol = q.solution
  if (q.type === 'mcq_single' || q.type === 'mcq_multi') {
    const ok: string[] = q.type === 'mcq_single' ? [sol?.correct] : sol?.correct || []
    return c.options.map((o: any) => ok.includes(o.id) ? `<div class="opt ok"><span>✔</span><span>${esc(o.text)}</span></div>` : `<div class="opt dim"><span>○</span><span>${esc(o.text)}</span></div>`).join('') +
      (q.type === 'mcq_multi' ? `<div class="note">${sol?.partial ? 'Punteggio parziale.' : 'Tutto o niente.'}</div>` : '')
  }
  if (q.type === 'matching') {
    const ro = rightOrder(q)
    const pairs = c.left.map((l: any, i: number) => `${i + 1} → ${letter(ro.findIndex((r) => r.id === sol?.pairs?.[l.id]))}`).join('&nbsp;&nbsp; ')
    return '<div class="cols dim"><div>' + c.left.map((l: any, i: number) => `<div class="m">${i + 1}. ${esc(l.text)}</div>`).join('') +
      '</div><div>' + ro.map((r, i) => `<div class="m">${letter(i)}. ${esc(r.text)}</div>`).join('') + `</div></div><div class="ans">Soluzione: ${pairs}</div>`
  }
  return `<div class="ans">Risposta: ${nl(describeSolution(q.type, c, sol))}</div>`
}

export function buildPrintHtml(kind: 'studente' | 'correttore', quiz: any, qs: Q[], pass: number | null): string {
  const key = kind === 'correttore'
  const total = qs.reduce((t, q) => t + (Number(q.points) || 0), 0)
  const meta = [quiz.subject, quiz.topic, quiz.level].filter(Boolean).map(esc).join(' · ')
  const info = (quiz.duration_minutes ? `Durata: ${quiz.duration_minutes} minuti · ` : '') + `Punteggio massimo: ${fmtNum(total)} punti` +
    (key && pass !== null ? ` · Sufficienza: ${fmtNum(pass)}% (${fmtNum(Math.round(total * pass) / 100)} punti)` : '')
  const body = qs.map((q, i) => {
    const text = BLANK_TYPES.includes(q.type) ? esc(q.content.text).replace(/___/g, '________________') : esc(q.content.text)
    return `<div class="q"><div class="qh"><div class="qt">${i + 1}. ${text.replace(/\n/g, '<br>')}${key ? `<span class="type">(${esc(TYPES[q.type])})</span>` : ''}</div>` +
      `<div class="pt">${fmtNum(Number(q.points))} pt</div></div>${key ? keyBody(q) : studentBody(q)}` +
      (key && q.explanation ? `<div class="expl">Spiegazione: ${esc(q.explanation)}</div>` : '') + '</div>'
  }).join('')

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(quiz.title)}${key ? ' - Correttore' : ''}</title>
<style>
@page { size: A4; margin: 14mm 15mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; font: 11pt/1.35 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; background: #fff; }
.sheet { max-width: 210mm; margin: 0 auto; }
.toolbar { max-width: 210mm; margin: 0 auto 16px; padding: 12px; background: #e6f0f2; border-radius: 8px; font-size: 14px; }
.toolbar button { font: inherit; padding: 8px 16px; border: 0; border-radius: 6px; background: #134e5e; color: #fff; cursor: pointer; margin-right: 12px; }
.head { border-bottom: 2px solid #222; padding-bottom: 6px; margin-bottom: 12px; }
.head h1 { font-size: 18pt; margin: 0; }
.meta { font-size: 10pt; color: #555; }
.badge { float: right; border: 1px solid #222; padding: 2px 8px; font-size: 8pt; font-weight: bold; text-transform: uppercase; }
.id { display: flex; gap: 24px; margin: 10px 0; font-size: 10pt; }
.id span { display: inline-block; border-bottom: 1px solid #555; }
.instr { background: #f0f0f0; padding: 8px; font-size: 10pt; margin-bottom: 10px; }
.info { font-size: 10pt; font-weight: 600; margin-bottom: 14px; }
.q { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; }
.qh { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.qt { font-weight: 600; } .type { font-weight: 400; font-size: 8.5pt; color: #666; margin-left: 6px; }
.pt { white-space: nowrap; font-size: 10pt; }
.opt { display: flex; gap: 8px; margin: 2px 0; } .ok { font-weight: 700; } .dim { color: #555; }
.note { font-size: 9pt; font-style: italic; margin: 2px 0; }
.tf span { margin-right: 40px; }
.line { height: 30px; border-bottom: 1px solid #888; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; } .m { margin: 2px 0; }
.blank { display: inline-block; width: 40px; border-bottom: 1px solid #555; }
.ans { font-weight: 700; white-space: pre-line; } .expl { font-size: 10pt; font-style: italic; color: #555; margin-top: 3px; }
.total { margin-top: 12px; border-top: 1px solid #888; padding-top: 6px; text-align: right; font-weight: 700; }
.foot { display: none; }
@media print { body { padding: 0; } .toolbar { display: none; } .foot { display: block; position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9pt; color: #777; } }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Stampa / Salva come PDF</button>Nella finestra di stampa scegli <b>PDF → Salva come PDF</b>. Formato A4.</div>
<div class="sheet">
<div class="head">${key ? '<span class="badge">Correttore · riservato al docente</span>' : ''}<h1>${esc(quiz.title)}</h1><div class="meta">${meta}</div></div>
${key ? '' : '<div class="id"><div style="flex:2">Nome e cognome <span style="width:70%">&nbsp;</span></div><div style="flex:1">Data <span style="width:65%">&nbsp;</span></div></div>'}
${!key && quiz.instructions ? `<div class="instr">${nl(quiz.instructions)}</div>` : ''}
<div class="info">${esc(info)}</div>
${body}
${key ? `<div class="total">Punteggio totale: ${fmtNum(total)} punti</div>` : ''}
</div>
<div class="foot">${esc(quiz.title)}${key ? ' · Correttore' : ''}</div>
</body></html>`
}
