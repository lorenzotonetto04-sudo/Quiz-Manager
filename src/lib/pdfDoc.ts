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

// Legge dimensioni e canali di un JPEG (serve per inserirlo nel PDF). Restituisce null se non è un JPEG supportato.
export function jpegInfo(b: Uint8Array): { w: number; h: number; comps: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const comps = b[i + 9]
      return comps === 1 || comps === 3 ? { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps } : null
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3])
  }
  return null
}

export class PdfWriter {
  readonly width = 595.28
  readonly height = 841.89
  private pages: string[][] = []
  private images: { bytes: Uint8Array; w: number; h: number; comps: number }[] = []
  get pageCount() { return this.pages.length }
  addPage() { this.pages.push([]) }
  goto(i: number) { this.cur = i }
  private cur = -1
  private ops(): string[] { return this.pages[this.cur < 0 ? this.pages.length - 1 : this.cur] }

  text(x: number, yTop: number, s: string, size: number, font: FontKey = 'F1', gray = 0, rgb?: [number, number, number]) {
    const Y = this.height - yTop - size * 0.85
    const fill = rgb ? `${n(rgb[0])} ${n(rgb[1])} ${n(rgb[2])} rg` : `${n(gray)} g`
    this.ops().push(`BT ${fill} /${font} ${n(size)} Tf ${n(x)} ${n(Y)} Td <${toHex(s)}> Tj ET`)
  }
  line(x1: number, y1: number, x2: number, y2: number, w = 0.6, gray = 0.45, rgb?: [number, number, number]) {
    const stroke = rgb ? `${n(rgb[0])} ${n(rgb[1])} ${n(rgb[2])} RG` : `${n(gray)} G`
    this.ops().push(`${stroke} ${n(w)} w ${n(x1)} ${n(this.height - y1)} m ${n(x2)} ${n(this.height - y2)} l S`)
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
  dot(cx: number, cy: number, r: number, gray = 0.1, rgb?: [number, number, number]) { // cerchio pieno
    const k = 0.5523 * r, y = this.height - cy
    const fill = rgb ? `${n(rgb[0])} ${n(rgb[1])} ${n(rgb[2])} rg` : `${n(gray)} g`
    this.ops().push(`${fill} ${n(cx + r)} ${n(y)} m ` +
      `${n(cx + r)} ${n(y + k)} ${n(cx + k)} ${n(y + r)} ${n(cx)} ${n(y + r)} c ` +
      `${n(cx - k)} ${n(y + r)} ${n(cx - r)} ${n(y + k)} ${n(cx - r)} ${n(y)} c ` +
      `${n(cx - r)} ${n(y - k)} ${n(cx - k)} ${n(y - r)} ${n(cx)} ${n(y - r)} c ` +
      `${n(cx + k)} ${n(y - r)} ${n(cx + r)} ${n(y - k)} ${n(cx + r)} ${n(y)} c f`)
  }
  cross(x: number, yTop: number, s: number) { // croce dentro una casella
    const Y = (v: number) => this.height - v
    this.ops().push(`0.1 G 1.3 w ${n(x)} ${n(Y(yTop))} m ${n(x + s)} ${n(Y(yTop + s))} l S ${n(x + s)} ${n(Y(yTop))} m ${n(x)} ${n(Y(yTop + s))} l S`)
  }
  // Registra un'immagine JPEG e restituisce il nome da usare con image()
  addImage(bytes: Uint8Array, w: number, h: number, comps = 3): string { this.images.push({ bytes, w, h, comps }); return `Im${this.images.length}` }
  image(x: number, yTop: number, w: number, h: number, name: string) {
    this.ops().push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(this.height - yTop - h)} cm /${name} Do Q`)
  }
  tick(x: number, yTop: number, s: number) { // segno di spunta
    const Y = (v: number) => this.height - v
    this.ops().push(`0.1 0.5 0.2 RG 1.4 w ${n(x)} ${n(Y(yTop + s * 0.55))} m ${n(x + s * 0.35)} ${n(Y(yTop + s * 0.95))} l ${n(x + s)} ${n(Y(yTop))} l S`)
  }

  build(): Uint8Array {
    type Obj = { head: string; bin?: Uint8Array }
    const objs: Obj[] = []
    const add = (head: string, bin?: Uint8Array) => { objs.push({ head, bin }); return objs.length }
    add('<< /Type /Catalog /Pages 2 0 R >>')
    add('') // 2: elenco pagine, riempito dopo
    const font = (name: string) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`)
    font('Helvetica'); font('Helvetica-Bold'); font('Helvetica-Oblique') // 3,4,5
    for (const im of this.images) { // dal 6 in poi: le immagini
      add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /${im.comps === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`, im.bytes)
    }
    const xobj = this.images.length ? ` /XObject << ${this.images.map((_, k) => `/Im${k + 1} ${6 + k} 0 R`).join(' ')} >>` : ''
    const kids: number[] = []
    for (const ops of this.pages) {
      const stream = ops.join('\n')
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
      const page = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xobj} >> /Contents ${content} 0 R >>`)
      kids.push(page)
    }
    objs[1] = { head: `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>` }
    const chunks: Uint8Array[] = []; let len = 0
    const put = (t: string) => { const b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 255; chunks.push(b); len += b.length }
    const offsets: number[] = []
    put('%PDF-1.4\n')
    objs.forEach((o, i) => {
      offsets.push(len); put(`${i + 1} 0 obj\n${o.head}`)
      if (o.bin) { chunks.push(o.bin); len += o.bin.length; put('\nendstream') }
      put('\nendobj\n')
    })
    const xref = len
    put(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''))
    put(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
    const out = new Uint8Array(len); let p = 0
    for (const c of chunks) { out.set(c, p); p += c.length }
    return out
  }
}
