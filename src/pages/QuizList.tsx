import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { newId } from '../lib/types'

type Row = { id: string; title: string; subject: string; status: string; created_at: string }
const STATUS: Record<string, string> = { draft: 'Bozza', published: 'Pubblicata', archived: 'Archiviata' }
const COLOR: Record<string, string> = { draft: 'text-orange-600', published: 'text-green-700', archived: 'text-slate-500' }

export default function QuizList({ onlyPublished = false }: { onlyPublished?: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState(''); const [status, setStatus] = useState(onlyPublished ? 'published' : '')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    let query = supabase.from('quizzes').select('id,title,subject,status,created_at').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data } = await query
    setRows((data as Row[]) ?? [])
  }, [status])
  useEffect(() => { load() }, [load])

  async function duplicate(id: string) {
    const { data: quiz } = await supabase.from('quizzes').select('*').eq('id', id).single()
    if (!quiz) return
    const { data: qs } = await supabase.from('quiz_questions').select('*').eq('quiz_id', id).order('position')
    const { data: sols } = await supabase.from('quiz_solutions').select('*').eq('quiz_id', id)
    const { data: ps } = await supabase.from('quiz_passages').select('*').eq('quiz_id', id).order('position')
    const nid = newId()
    const { error } = await supabase.from('quizzes').insert({
      id: nid, title: quiz.title + ' (copia)', subject: quiz.subject, topic: quiz.topic, level: quiz.level,
      difficulty: quiz.difficulty, instructions: quiz.instructions, duration_minutes: quiz.duration_minutes,
      shuffle_questions: quiz.shuffle_questions, shuffle_options: quiz.shuffle_options,
      results_mode: quiz.results_mode, scale_id: quiz.scale_id,
    })
    if (error) return setMsg('Duplicazione non riuscita: ' + error.message)
    const pmap: Record<string, string> = {}
    const newPs = (ps ?? []).map((p) => { pmap[p.id] = newId(); return { id: pmap[p.id], quiz_id: nid, position: p.position, title: p.title, body: p.body, image_path: p.image_path } })
    if (newPs.length) await supabase.from('quiz_passages').insert(newPs)
    const map: Record<string, string> = {}
    const newQs = (qs ?? []).map((x) => { map[x.id] = newId(); return {
      id: map[x.id], quiz_id: nid, position: x.position, type: x.type, content: x.content, points: x.points,
      passage_id: x.passage_id ? pmap[x.passage_id] ?? null : null, image_path: x.image_path } })
    if (newQs.length) await supabase.from('quiz_questions').insert(newQs)
    const newSols = (sols ?? []).map((s) => ({ question_id: map[s.question_id], quiz_id: nid, solution: s.solution, explanation: s.explanation }))
    if (newSols.length) await supabase.from('quiz_solutions').insert(newSols)
    setMsg('Verifica duplicata come bozza.'); load()
  }
  async function setSt(id: string, st: string) { await supabase.from('quizzes').update({ status: st }).eq('id', id); load() }
  async function remove(id: string, title: string) {
    if (!confirm(`Eliminare definitivamente "${title}" con tutti i risultati degli studenti?`)) return
    const { error } = await supabase.from('quizzes').delete().eq('id', id)
    setMsg(error ? 'Eliminazione non riuscita: ' + error.message : 'Verifica eliminata.'); load()
  }

  const shown = rows.filter((r) => (r.title + ' ' + r.subject).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-brand">{onlyPublished ? 'Verifiche pubblicate' : 'Archivio verifiche'}</h1>
        <Link to="/nuova" className="btn btn-primary">Crea nuova verifica</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Cerca per titolo o materia" value={q} onChange={(e) => setQ(e.target.value)} />
        {!onlyPublished && (
          <select className="input max-w-[11rem]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tutti gli stati</option><option value="draft">Bozze</option>
            <option value="published">Pubblicate</option><option value="archived">Archiviate</option></select>)}
      </div>
      {msg && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{msg}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr>
            <th className="px-4 py-2">Titolo</th><th className="px-4 py-2">Materia</th><th className="px-4 py-2">Stato</th>
            <th className="px-4 py-2">Creata il</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Nessuna verifica. Creane una con il pulsante in alto.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{r.title}</td><td className="px-4 py-2">{r.subject}</td>
                <td className={`px-4 py-2 ${COLOR[r.status]}`}>{STATUS[r.status]}</td>
                <td className="px-4 py-2">{new Date(r.created_at).toLocaleDateString('it-IT')}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <Link className="mr-3 text-brand underline" to={'/verifica/' + r.id}>Apri</Link>
                  <button className="mr-3 text-brand underline" onClick={() => duplicate(r.id)}>Duplica</button>
                  <button className="mr-3 text-brand underline" onClick={() => setSt(r.id, r.status === 'archived' ? 'draft' : 'archived')}>
                    {r.status === 'archived' ? 'Ripristina' : 'Archivia'}</button>
                  <button className="text-red-600 underline" onClick={() => remove(r.id, r.title)}>Elimina</button>
                </td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
