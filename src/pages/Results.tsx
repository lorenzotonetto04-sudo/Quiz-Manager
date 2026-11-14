/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmtNum } from '../lib/types'

export default function Results() {
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState(''); const [st, setSt] = useState('')
  useEffect(() => {
    supabase.from('attempts')
      .select('id,student_first,student_last,status,percent,final_grade_label,submitted_at,time_spent_seconds,total_points,max_points,late,quizzes(title,subject)')
      .neq('status', 'in_progress').order('submitted_at', { ascending: false }).limit(300)
      .then(({ data }) => setRows(data ?? []))
  }, [])
  const shown = rows.filter((r) => (!st || r.status === st) &&
    `${r.student_first} ${r.student_last} ${r.quizzes?.title} ${r.quizzes?.subject}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-brand">Risultati e correzioni</h1>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Cerca studente, verifica o materia" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[11rem]" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Tutti gli stati</option><option value="submitted">Da correggere</option><option value="graded">Corrette</option></select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-2">Studente</th><th className="px-4 py-2">Verifica</th>
            <th className="px-4 py-2">Consegna</th><th className="px-4 py-2">Punti</th><th className="px-4 py-2">%</th><th className="px-4 py-2">Voto</th><th className="px-4 py-2">Stato</th><th /></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={8} className="p-4 text-slate-500">Nessuna consegna.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{r.student_first} {r.student_last}</td>
                <td className="px-4 py-2">{r.quizzes?.title}</td>
                <td className="px-4 py-2">{r.submitted_at ? new Date(r.submitted_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : ''}{r.late && <span className="ml-1 text-xs text-orange-600">(fuori tempo)</span>}</td>
                <td className="px-4 py-2">{fmtNum(Number(r.total_points))}/{fmtNum(Number(r.max_points))}</td>
                <td className="px-4 py-2">{fmtNum(Number(r.percent))}%</td>
                <td className="px-4 py-2">{r.final_grade_label ?? '–'}</td>
                <td className={`px-4 py-2 ${r.status === 'graded' ? 'text-green-700' : 'text-orange-600'}`}>{r.status === 'graded' ? 'Corretta' : 'Da correggere'}</td>
                <td className="px-4 py-2"><Link className="text-brand underline" to={'/risultati/' + r.id}>Apri</Link></td></tr>))}
          </tbody></table></div>
    </div>
  )
}
