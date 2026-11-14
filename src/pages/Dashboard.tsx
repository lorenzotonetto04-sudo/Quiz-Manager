import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Recent = {
  id: string; student_first: string; student_last: string; status: string
  percent: number | null; final_grade_label: string | null; submitted_at: string | null
}

// Formato italiano: virgola per i decimali
const fmt = (n: number | null) => (n === null ? '–' : n.toFixed(1).replace('.', ','))

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, published: 0, drafts: 0, toGrade: 0 })
  const [recent, setRecent] = useState<Recent[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        // Crea al primo accesso la scala dei voti predefinita
        await supabase.rpc('teacher_ensure_default_scale')
        const count = (q: PromiseLike<{ count: number | null; error: unknown }>) => q.then((r) => r.count ?? 0)
        const [total, published, drafts, toGrade, rec] = await Promise.all([
          count(supabase.from('quizzes').select('*', { count: 'exact', head: true })),
          count(supabase.from('quizzes').select('*', { count: 'exact', head: true }).eq('status', 'published')),
          count(supabase.from('quizzes').select('*', { count: 'exact', head: true }).eq('status', 'draft')),
          count(supabase.from('attempts').select('*', { count: 'exact', head: true }).eq('status', 'submitted')),
          supabase.from('attempts').select('id,student_first,student_last,status,percent,final_grade_label,submitted_at')
            .neq('status', 'in_progress').order('submitted_at', { ascending: false }).limit(8),
        ])
        setStats({ total, published, drafts, toGrade })
        setRecent((rec.data as Recent[]) ?? [])
      } catch {
        setError('Non riesco a leggere i dati. Controlla di aver eseguito lo script SQL della fase 1.')
      }
    }
    load()
  }, [])

  const cards = [
    { label: 'Verifiche create', value: stats.total, color: 'text-brand' },
    { label: 'Pubblicate', value: stats.published, color: 'text-green-700' },
    { label: 'In bozza', value: stats.drafts, color: 'text-orange-600' },
    { label: 'Da correggere', value: stats.toGrade, color: 'text-orange-600' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className={`text-3xl font-semibold ${c.color}`}>{c.value}</div>
            <div className="mt-1 text-sm text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>
      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Ultimi risultati ricevuti</h2>
        {recent.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nessun risultato ancora. Quando uno studente consegna una verifica, la vedrai qui.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="px-4 py-2">Studente</th><th className="px-4 py-2">Percentuale</th><th className="px-4 py-2">Voto</th><th className="px-4 py-2">Stato</th></tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{r.student_first} {r.student_last}</td>
                    <td className="px-4 py-2">{r.percent === null ? '–' : fmt(Number(r.percent)) + '%'}</td>
                    <td className="px-4 py-2">{r.final_grade_label ?? '–'}</td>
                    <td className="px-4 py-2">
                      <span className={r.status === 'graded' ? 'text-green-700' : 'text-orange-600'}>
                        {r.status === 'graded' ? 'Corretta' : 'Da correggere'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
