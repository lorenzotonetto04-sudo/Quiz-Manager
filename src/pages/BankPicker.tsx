/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TYPES, fmtNum, newId, type Q } from '../lib/types'

// Pannello per scegliere domande dall'archivio e inserirle (come COPIE) nella verifica
export default function BankPicker({ subject, onAdd, onClose }: { subject: string; onAdd: (qs: Q[]) => void; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [text, setText] = useState(''); const [subj, setSubj] = useState(''); const [type, setType] = useState('')
  const [sel, setSel] = useState<string[]>([])

  useEffect(() => {
    supabase.from('question_bank').select('*').order('created_at', { ascending: false }).limit(1000).then(({ data }) => {
      setRows(data ?? [])
      if ((data ?? []).some((r) => r.subject === subject)) setSubj(subject)
    })
  }, [subject])

  const subjects = Array.from(new Set((rows ?? []).map((r) => r.subject))).sort()
  const shown = (rows ?? []).filter((r) => (!subj || r.subject === subj) && (!type || r.type === type) &&
    `${r.content?.text ?? ''} ${r.topic ?? ''}`.toLowerCase().includes(text.toLowerCase()))
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])

  function add() {
    const picked = (rows ?? []).filter((r) => sel.includes(r.id)).map((r): Q => ({
      id: newId(), type: r.type, points: Number(r.points),
      content: JSON.parse(JSON.stringify(r.content)), solution: JSON.parse(JSON.stringify(r.solution ?? {})), explanation: r.explanation ?? '', imagePath: r.image_path ?? null,
    }))
    onAdd(picked)
  }

  return (
    <div className="space-y-3 rounded-lg border border-brand bg-brand-light p-4">
      <div className="flex items-center justify-between"><h3 className="font-medium">Aggiungi dall'archivio</h3>
        <button className="text-sm underline" onClick={onClose}>Chiudi</button></div>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Cerca nel testo o nell'argomento" value={text} onChange={(e) => setText(e.target.value)} />
        <select className="input max-w-[10rem]" value={subj} onChange={(e) => setSubj(e.target.value)} aria-label="Materia">
          <option value="">Tutte le materie</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input max-w-[14rem]" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipologia">
          <option value="">Tutte le tipologie</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {rows === null && <p className="text-sm text-slate-500">Caricamento…</p>}
      {rows !== null && shown.length === 0 && <p className="text-sm text-slate-600">Nessuna domanda trovata. Salva le domande in archivio dal pulsante "Salva in archivio" di ogni domanda.</p>}
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {shown.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-start gap-3 rounded-md bg-white p-2 text-sm">
            <input type="checkbox" className="mt-1" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.content?.text}</span>
              <span className="text-xs text-slate-500">{TYPES[r.type]} · {r.subject}{r.topic ? ` · ${r.topic}` : ''} · {fmtNum(Number(r.points))} pt</span></span>
          </label>))}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={sel.length === 0} onClick={add}>Aggiungi {sel.length || ''} {sel.length === 1 ? 'domanda' : 'domande'}</button>
        <span className="text-xs text-slate-600">Vengono inserite come copie: modificarle nella verifica non cambia l'archivio.</span>
      </div>
    </div>
  )
}
