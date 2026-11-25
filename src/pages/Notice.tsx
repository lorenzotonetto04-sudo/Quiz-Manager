import { useEffect, useState } from 'react'

export type Msg = { ok: boolean; t: string }

// Messaggio al centro dello schermo. Verde (operazione riuscita): sparisce da solo dopo pochi secondi.
// Rosso (errore): resta finché non lo chiudi, così non lo perdi di vista.
export default function Notice({ msg }: { msg: Msg | null }) {
  const [shown, setShown] = useState<Msg | null>(null)
  useEffect(() => {
    setShown(msg)
    if (msg?.ok) { const t = setTimeout(() => setShown(null), 2600); return () => clearTimeout(t) }
  }, [msg])
  if (!shown) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4">
      {shown.ok ? (
        <div role="status" className="toast-pop pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl bg-green-600 px-6 py-4 text-white shadow-2xl" onClick={() => setShown(null)}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-7" /></svg>
          <span className="text-sm font-medium">{shown.t}</span>
        </div>
      ) : (
        <div role="alert" className="toast-pop pointer-events-auto max-w-md rounded-2xl border border-red-200 bg-white px-6 py-5 text-center shadow-2xl">
          <p className="text-sm text-red-700">{shown.t}</p>
          <button className="btn btn-ghost mt-3" onClick={() => setShown(null)}>Chiudi</button>
        </div>)}
    </div>
  )
}
