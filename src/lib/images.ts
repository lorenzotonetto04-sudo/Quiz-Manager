import { supabase } from './supabase'

// Indirizzo pubblico di un'immagine caricata (la cartella di archiviazione è leggibile da chi ha il link della verifica)
export const imageUrl = (path: string) => supabase.storage.from('quiz-images').getPublicUrl(path).data.publicUrl

const MAX_SIDE = 1400   // lato massimo in pixel: le foto del telefono vengono ridimensionate
const MAX_BYTES = 20 * 1024 * 1024

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try { const b = await createImageBitmap(file); return { src: b, w: b.width, h: b.height, close: () => b.close() } } catch { /* prova con <img> */ }
  }
  const url = URL.createObjectURL(file)
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Formato non supportato: usa un\'immagine JPG o PNG.')); i.src = url
  })
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
}

// Converte l'immagine in JPEG (più leggera, e usabile nei PDF), la ridimensiona e la carica. Restituisce il percorso salvato.
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Il file scelto non è un\'immagine.')
  if (file.size > MAX_BYTES) throw new Error('L\'immagine è troppo grande (massimo 20 MB).')
  const d = await decode(file)
  try {
    const k = Math.min(1, MAX_SIDE / Math.max(d.w, d.h))
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(d.w * k)); canvas.height = Math.max(1, Math.round(d.h * k))
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Il browser non riesce a elaborare l\'immagine.')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) // sfondo bianco per i PNG trasparenti
    ctx.drawImage(d.src, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Conversione dell\'immagine non riuscita.')
    const { data: s } = await supabase.auth.getSession()
    const uid = s.session?.user.id; if (!uid) throw new Error('Sessione scaduta: esci e rientra.')
    const path = `${uid}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('quiz-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (error) throw new Error('Caricamento non riuscito: ' + error.message)
    return path
  } finally { d.close() }
}
