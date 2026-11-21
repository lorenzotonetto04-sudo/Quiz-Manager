import { useRef, useState } from 'react'
import { imageUrl, uploadImage } from '../lib/images'

// Scelta di un'immagine (da computer o telefono) per una domanda o un brano
export default function ImageField({ value, onChange, label = 'Immagine (facoltativa)' }: { value?: string | null; onChange: (path: string | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try { onChange(await uploadImage(f)) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {value && <img src={imageUrl(value)} alt="Anteprima dell'immagine" className="max-h-44 w-auto max-w-full rounded-lg border border-slate-200" />}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
        <button type="button" className="btn btn-ghost" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Caricamento…' : value ? 'Sostituisci immagine' : 'Aggiungi immagine'}</button>
        {value && !busy && <button type="button" className="text-sm text-red-600 underline" onClick={() => onChange(null)}>Rimuovi</button>}
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    </div>
  )
}
