/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt1, fmt2, groupBy, history, lineChartSvg, studentKey, studentName, summarize, timeSeries, type Att, type Summary } from '../lib/stats'

const Card = ({ label, value, color = 'text-brand' }: { label: string; value: string; color?: string }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4"><div className={`text-2xl font-semibold ${color}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>
)
const cells = (s: Summary) => [String(s.n), s.avgPercent === null ? '–' : fmt1(s.avgPercent) + '%', fmt2(s.avgGrade)]

export default function Statistics() {
  const [all, setAll] = useState<Att[] | null>(null)
  const [subject, setSubject] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [search, setSearch] = useState(''); const [student, setStudent] = useState('')
  const [err, setErr] = useState('')
  const detail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('attempts')
      .select('id,quiz_id,student_first,student_last,status,percent,final_grade_value,final_grade_label,submitted_at,total_points,max_points,quizzes(title,subject)')
      .neq('status', 'in_progress').order('submitted_at', { ascending: false }).limit(5000)
      .then(({ data, error }) => { if (error) setErr('Non riesco a leggere i dati: ' + error.message); else setAll((data as any) ?? []) })
  }, [])

  const subjects = useMemo(() => Array.from(new Set((all ?? []).map((a) => a.quizzes?.subject).filter(Boolean) as string[])).sort(), [all])
  const atts = useMemo(() => (all ?? []).filter((a) => (!subject || a.quizzes?.subject === subject) &&
    (!from || (a.submitted_at ?? '') >= from) && (!to || (a.submitted_at ?? '') <= to + 'T23:59:59')), [all, subject, from, to])

  const sum = useMemo(() => summarize(atts), [atts])
  const toCorrect = atts.filter((a) => a.status === 'submitted').length
  const series = useMemo(() => timeSeries(atts), [atts])
  const bySubject = useMemo(() => groupBy(atts, (a) => a.quizzes?.subject ?? '–').sort((a, b) => a.key.localeCompare(b.key)), [atts])
  const byQuiz = useMemo(() => groupBy(atts, (a) => a.quiz_id).map((g) => ({ ...g, title: g.atts[0].quizzes?.title ?? '–', subj: g.atts[0].quizzes?.subject ?? '' }))
    .sort((a, b) => a.title.localeCompare(b.title)), [atts])
  const byStudent = useMemo(() => groupBy(atts, studentKey).map((g) => ({ ...g, name: studentName(g.atts[0]) })).sort((a, b) => a.name.localeCompare(b.name)), [atts])
  const shownStudents = byStudent.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
  const sel = byStudent.find((g) => g.key === student)
  const selHistory = sel ? history(sel.atts) : []
  const selSubjects = sel ? groupBy(sel.atts, (a) => a.quizzes?.subject ?? '–') : []

  if (err) return <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</p>
  if (all === null) return <p className="text-sm text-slate-500">Caricamento…</p>

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-brand">Statistiche</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="mb-1 block text-xs text-slate-500">Materia</label>
          <select className="input w-44" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Tutte</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="mb-1 block text-xs text-slate-500">Dal</label><input className="input w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-slate-500">Al</label><input className="input w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {(subject || from || to) && <button className="btn btn-ghost" onClick={() => { setSubject(''); setFrom(''); setTo('') }}>Azzera filtri</button>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="Verifiche corrette" value={String(sum.n)} />
        <Card label="Percentuale media" value={sum.avgPercent === null ? '–' : fmt1(sum.avgPercent) + '%'} />
        <Card label="Media dei voti" value={fmt2(sum.avgGrade)} />
        <Card label="Con voto sufficiente (≥ 6)" value={sum.passRate === null ? '–' : fmt1(sum.passRate) + '%'} color="text-green-700" />
        <Card label="Da correggere" value={String(toCorrect)} color="text-orange-600" />
      </div>
      <p className="-mt-3 text-xs text-slate-500">Le medie considerano solo le consegne corrette del tutto. Gli studenti sono riconosciuti da nome e cognome (maiuscole e spazi non contano).</p>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium">Andamento nel tempo <span className="text-sm font-normal text-slate-500">· percentuale media per {series.unit}</span></h2>
        <div dangerouslySetInnerHTML={{ __html: lineChartSvg(series.points, 'Andamento della percentuale media nel tempo') }} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Per materia</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="px-4 py-2">Materia</th><th className="px-4 py-2">Consegne</th><th className="px-4 py-2">% media</th><th className="px-4 py-2">Media voti</th></tr></thead>
          <tbody>{bySubject.length === 0 && <tr><td colSpan={4} className="p-4 text-slate-500">Nessun dato.</td></tr>}
            {bySubject.map((g) => <tr key={g.key} className="border-t border-slate-100"><td className="px-4 py-2 font-medium">{g.key}</td>{cells(g.s).map((c, i) => <td key={i} className="px-4 py-2">{c}</td>)}</tr>)}</tbody></table></div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Per verifica</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="px-4 py-2">Verifica</th><th className="px-4 py-2">Materia</th><th className="px-4 py-2">Consegne</th><th className="px-4 py-2">% media</th><th className="px-4 py-2">Media voti</th></tr></thead>
          <tbody>{byQuiz.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Nessun dato.</td></tr>}
            {byQuiz.map((g) => <tr key={g.key} className="border-t border-slate-100"><td className="px-4 py-2 font-medium">{g.title}</td><td className="px-4 py-2">{g.subj}</td>{cells(g.s).map((c, i) => <td key={i} className="px-4 py-2">{c}</td>)}</tr>)}</tbody></table></div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="font-medium">Per studente</h2>
          <input className="input max-w-xs" placeholder="Cerca uno studente" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="px-4 py-2">Studente</th><th className="px-4 py-2">Verifiche</th><th className="px-4 py-2">% media</th><th className="px-4 py-2">Media voti</th><th /></tr></thead>
          <tbody>{shownStudents.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Nessuno studente.</td></tr>}
            {shownStudents.map((g) => <tr key={g.key} className={`border-t border-slate-100 ${g.key === student ? 'bg-brand-light' : ''}`}>
              <td className="px-4 py-2 font-medium">{g.name}</td>{cells(g.s).map((c, i) => <td key={i} className="px-4 py-2">{c}</td>)}
              <td className="px-4 py-2 text-right"><button className="text-brand underline" onClick={() => { setStudent(g.key); setTimeout(() => detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }}>Storico</button></td></tr>)}</tbody></table></div>
      </section>

      {sel && (
        <section ref={detail} className="space-y-4 rounded-lg border border-brand bg-white p-4">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-brand">Storico di {sel.name}</h2>
            <button className="text-sm underline" onClick={() => setStudent('')}>Chiudi</button></div>
          <div className="grid grid-cols-3 gap-3"><Card label="Verifiche corrette" value={String(sel.s.n)} /><Card label="Percentuale media" value={sel.s.avgPercent === null ? '–' : fmt1(sel.s.avgPercent) + '%'} /><Card label="Media dei voti" value={fmt2(sel.s.avgGrade)} /></div>
          {selSubjects.length > 1 && <p className="text-sm text-slate-600">Per materia: {selSubjects.map((g) => `${g.key} ${fmt2(g.s.avgGrade)} (${g.s.n})`).join(' · ')}</p>}
          <div><div className="mb-1 text-sm text-slate-500">Percentuale di ogni verifica, in ordine di data</div>
            <div dangerouslySetInnerHTML={{ __html: lineChartSvg(selHistory, 'Storico delle verifiche di ' + sel.name) }} /></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Verifica</th><th className="py-2 pr-3">Materia</th><th className="py-2 pr-3">Punti</th><th className="py-2 pr-3">%</th><th className="py-2 pr-3">Voto</th><th /></tr></thead>
            <tbody>{[...sel.atts].sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '')).map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-2 pr-3">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('it-IT') : ''}</td>
                <td className="py-2 pr-3">{a.quizzes?.title}</td><td className="py-2 pr-3">{a.quizzes?.subject}</td>
                <td className="py-2 pr-3">{a.status === 'graded' ? `${fmt2(Number(a.total_points))}/${fmt2(Number(a.max_points))}`.replace(/,00/g, '') : '–'}</td>
                <td className="py-2 pr-3">{a.status === 'graded' ? fmt1(Number(a.percent)) + '%' : '–'}</td>
                <td className="py-2 pr-3">{a.status === 'graded' ? a.final_grade_label ?? '–' : <span className="text-orange-600">da correggere</span>}</td>
                <td className="py-2"><Link className="text-brand underline" to={'/risultati/' + a.id}>Apri</Link></td></tr>))}</tbody></table></div>
        </section>)}
    </div>
  )
}
