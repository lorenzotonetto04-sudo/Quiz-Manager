import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function NewQuiz() {
  const nav = useNavigate()
  const [f, setF] = useState({ title: '', subject: '', topic: '', level: '', difficulty: 'media', instructions: '', duration: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF({ ...f, [k]: v })

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const { data, error } = await supabase.from('quizzes').insert({
      title: f.title.trim(), subject: f.subject.trim(), topic: f.topic.trim() || null, level: f.level.trim() || null,
      difficulty: f.difficulty, instructions: f.instructions.trim() || null,
      duration_minutes: f.duration ? Number(f.duration) : null,
    }).select('id').single()
    setBusy(false)
    if (error || !data) return setErr('Non sono riuscito a creare la verifica: ' + (error?.message ?? ''))
    nav('/verifica/' + data.id)
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-brand">Crea nuova verifica</h1>
      <p className="text-sm text-slate-600">Compila i dati generali. Nel passaggio successivo aggiungerai le domande.</p>
      <div><label className="mb-1 block text-sm font-medium">Titolo *</label>
        <input className="input" required value={f.title} onChange={(e) => set('title', e.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium">Materia *</label>
          <input className="input" required list="subjects" value={f.subject} onChange={(e) => set('subject', e.target.value)} />
          <datalist id="subjects"><option value="Tedesco" /><option value="Diritto" /></datalist></div>
        <div><label className="mb-1 block text-sm font-medium">Argomento</label>
          <input className="input" value={f.topic} onChange={(e) => set('topic', e.target.value)} /></div>
        <div><label className="mb-1 block text-sm font-medium">Classe o livello (facoltativo)</label>
          <input className="input" value={f.level} onChange={(e) => set('level', e.target.value)} /></div>
        <div><label className="mb-1 block text-sm font-medium">Difficoltà</label>
          <select className="input" value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
            <option value="facile">Facile</option><option value="media">Media</option><option value="difficile">Difficile</option></select></div>
        <div><label className="mb-1 block text-sm font-medium">Durata in minuti (facoltativa)</label>
          <input className="input" type="number" min="1" value={f.duration} onChange={(e) => set('duration', e.target.value)} /></div>
      </div>
      <div><label className="mb-1 block text-sm font-medium">Istruzioni per lo studente</label>
        <textarea className="input" rows={3} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} /></div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Creazione…' : 'Continua con le domande'}</button>
    </form>
  )
}
