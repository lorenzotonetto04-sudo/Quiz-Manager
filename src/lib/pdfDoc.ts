// Scrittore PDF minimale, senza librerie: testo (Helvetica), linee, rettangoli, cerchi.
// Coordinate in punti, con l'origine in ALTO a sinistra (come in una pagina web).

export type FontKey = 'F1' | 'F2' | 'F3' // normale, grassetto, corsivo

const PUNCT_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278]
const PUNCT2_REG = [278, 278, 584, 584, 584, 556, 1015]
const UP_REG = [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611]
const BR_REG = [278, 278, 278, 469, 556, 333]
const LO_REG = [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500]
const END_REG = [334, 260, 334, 584]
const PUNCT_B = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278]
const PUNCT2_B = [333, 333, 584, 584, 584, 611, 975]
const UP_B = [722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611]
const BR_B = [333, 278, 333, 584, 556, 333]
const LO_B = [556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500]
const END_B = [389, 280, 389, 584]
const DIGITS = Array(10).fill(556)

function table(punct: number[], digits: number[], punct2: number[], up: number[], br: number[], lo: number[], end: number[]) {
  return [...punct, ...digits, ...punct2, ...up, ...br, ...lo, ...end] // codici 32..126
}
const REG = table(PUNCT_REG, DIGITS, PUNCT2_REG, UP_REG, BR_REG, LO_REG, END_REG)
const BOLD = table(PUNCT_B, DIGITS, PUNCT2_B, UP_B, BR_B, LO_B, END_B)

export function textWidth(s: string, size: number, font: FontKey = 'F1'): number {
  const t = font === 'F2' ? BOLD : REG
  let w = 0
  for (const ch of s) {
    let c = ch.charCodeAt(0)
    if (c > 126) { const base = ch.normalize('NFD').charCodeAt(0); c = base >= 32 && base <= 126 ? base : ch === 'ß' ? 98 : 63 }
    w += t[(c >= 32 && c <= 126 ? c : 63) - 32]
  }
  return (w * size) / 1000
}

const WIN: Record<number, number> = { 0x20ac: 0x80, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97 }
function toHex(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    const b = cp >= 32 && cp <= 126 ? cp : cp >= 160 && cp <= 255 ? cp : WIN[cp] ?? (cp === 9 || cp === 10 ? 32 : 63)
    out += b.toString(16).padStart(2, '0')
  }
  return out
}
const n = (v: number) => v.toFixed(2)

export class PdfWriter {
  readonly width = 595.28
  readonly height = 841.89
  private pages: string[][] = []
  get pageCount() { return this.pages.length }
  addPage() { this.pages.push([]) }
  goto(i: number) { this.cur = i }
  private cur = -1
  private ops(): string[] { return this.pages[this.cur < 0 ? this.pages.length - 1 : this.cur] }

  text(x: number, yTop: number, s: string, size: number, font: FontKey = 'F1', gray = 0) {
    const Y = this.height - yTop - size * 0.85
    this.ops().push(`BT ${n(gray)} g /${font} ${n(size)} Tf ${n(x)} ${n(Y)} Td <${toHex(s)}> Tj ET`)
  }
  line(x1: number, y1: number, x2: number, y2: number, w = 0.6, gray = 0.45) {
    this.ops().push(`${n(gray)} G ${n(w)} w ${n(x1)} ${n(this.height - y1)} m ${n(x2)} ${n(this.height - y2)} l S`)
  }
  rect(x: number, yTop: number, w: number, h: number, stroke = 0.3, fill?: number) {
    const o = `${n(x)} ${n(this.height - yTop - h)} ${n(w)} ${n(h)} re`
    this.ops().push(fill === undefined ? `${n(stroke)} G 0.7 w ${o} S` : `${n(fill)} g ${o} f`)
  }
  circle(cx: number, cy: number, r: number, stroke = 0.3) {
    const k = 0.5523 * r, y = this.height - cy
    this.ops().push(`${n(stroke)} G 0.7 w ${n(cx + r)} ${n(y)} m ` +
      `${n(cx + r)} ${n(y + k)} ${n(cx + k)} ${n(y + r)} ${n(cx)} ${n(y + r)} c ` +
      `${n(cx - k)} ${n(y + r)} ${n(cx - r)} ${n(y + k)} ${n(cx - r)} ${n(y)} c ` +
      `${n(cx - r)} ${n(y - k)} ${n(cx - k)} ${n(y - r)} ${n(cx)} ${n(y - r)} c ` +
      `${n(cx + k)} ${n(y - r)} ${n(cx + r)} ${n(y - k)} ${n(cx + r)} ${n(y)} c S`)
  }
  tick(x: number, yTop: number, s: number) { // segno di spunta
    const Y = (v: number) => this.height - v
    this.ops().push(`0.1 0.5 0.2 RG 1.4 w ${n(x)} ${n(Y(yTop + s * 0.55))} m ${n(x + s * 0.35)} ${n(Y(yTop + s * 0.95))} l ${n(x + s)} ${n(Y(yTop))} l S`)
  }

  build(): Uint8Array {
    const objs: string[] = []
    const add = (s: string) => { objs.push(s); return objs.length }
    add('<< /Type /Catalog /Pages 2 0 R >>')
    add('') // 2: elenco pagine, riempito dopo
    const font = (name: string) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`)
    font('Helvetica'); font('Helvetica-Bold'); font('Helvetica-Oblique') // 3,4,5
    const kids: number[] = []
    for (const ops of this.pages) {
      const stream = ops.join('\n')
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
      const page = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${content} 0 R >>`)
      kids.push(page)
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`
    let out = '%PDF-1.4\n'
    const offsets: number[] = []
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
    const xref = out.length
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255
    return bytes
  }
}
