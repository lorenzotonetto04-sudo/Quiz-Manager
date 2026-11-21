import { imageUrl } from './images'
import { jpegInfo } from './pdfDoc'
import type { ImageIn } from './pdfQuiz'

// Scarica le immagini che servono al PDF. Quelle non scaricabili vengono saltate e contate in "missing".
export async function loadImages(paths: string[]): Promise<{ images: Record<string, ImageIn>; missing: number }> {
  const images: Record<string, ImageIn> = {}
  let missing = 0
  await Promise.all(paths.map(async (p) => {
    try {
      const r = await fetch(imageUrl(p)); if (!r.ok) throw new Error('http')
      const bytes = new Uint8Array(await r.arrayBuffer()); const info = jpegInfo(bytes); if (!info) throw new Error('formato')
      images[p] = { bytes, w: info.w, h: info.h, comps: info.comps }
    } catch { missing++ }
  }))
  return { images, missing }
}
