/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt1, fmt2, groupBy, history, lineChartSvg, studentKey, studentName, summarize, timeSeries, type Att } from '../lib/stats'
import { buildStudentPdf, type Detail } from '../lib/pdfStudent'

const Card = ({ label, value, color = 'text-brand' }: { label: string; value: string; color?: string }) => (
  <div className="rounded-lg border bg-white p-4"><div className={`text-2xl font-semibold ${color}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>
)
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n))
async function fetchIn(table: string, col: string, vals: string[]): Promise<any[]> {
  const out: any[] = []
  for (const c of chunk(vals, 40)) {
    const { data, error } = await supabase.from(table).select('*').in(col, c)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
  }
  return out
}
const safe = (x: string) => String(x).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_')

// Statistiche studente per studente (nessun dato generale)
export default function Statistics() {
  const [all, setAll] = useState<Att[] | null>(null)
  const [student, setStudent] = useState(''); const [search, setSearch] = useState('')
  const [subject, setSubject] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [pdfMsg, setPdfMsg] = useState('')
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    supabase.from('attempts')
      .select('id,quiz_id,student_first,student_last,status,percent,final_grade_value,final_grade_label,submitted_at,total_points,max_points,quizzes(title,subject)')
      .neq('status', 'in_progress').order('submitted_at', { ascending: false }).limit(5000)
      .then(({ data, error }) => { if (error) setErr('Non riesco a leggere i dati: ' + error.message); else setAll((data as any) ?? []) })
  }, [])

  const students = useMemo(() => groupBy(all ?? [], studentKey).map((g) => ({ ...g, name: studentName(g.atts[0]) })).sort((a, b) => a.name.localeCompare(b.name)), [all])
  const sel = students.find((g) => g.key === student)
  const subjects = useMemo(() => Array.from(new Set((sel?.atts ?? []).map((a) => a.quizzes?.subject).filter(Boolean) as string[])).sort(), [sel])
  const atts = useMemo(() => (sel?.atts ?? []).filter((a) => (!subject || a.quizzes?.subject === subject) &&
    (!from || (a.submitted_at ?? '') >= from) && (!to || (a.submitted_at ?? '') <= to + 'T23:59:59')), [sel, subject, from, to])
  const sum = useMemo(() => summarize(atts), [atts])
  const toCorrect = atts.filter((a) => a.status === 'submitted').length
  const bySubject = useMemo(() => groupBy(atts, (a) => a.quizzes?.subject ?? '–').sort((a, b) => a.key.localeCompare(b.key)), [atts])
  const hist = useMemo(() => history(atts), [atts])
  const trend = useMemo(() => timeSeries(atts), [atts])
  const shown = students.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
  const filterText = [subject && `Materia: ${subject}`, from && `dal ${from}`, to && `al ${to}`].filter(Boolean).join('  ·  ')

  function pick(key: string) { setStudent(key); setSubject(''); setFrom(''); setTo(''); setPdf(null); setPdfMsg(''); window.scrollTo({ top: 0 }) }
  function publish(bytes: Uint8Array, name: string, auto: boolean) {
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }))
    if (pdf) URL.revokeObjectURL(pdf.url)
    setPdf({ url, name })
    if (auto) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove() }
  }
  function pdfSummary() {
    if (!sel) return
    setPdfMsg('')
    try { publish(buildStudentPdf(sel.name, atts, filterText, null), `Archivio_${safe(sel.name)}.pdf`, true) } catch (e) { setPdfMsg('Creazione del PDF non riuscita: ' + (e as Error).message) }
  }
  async function pdfFull() {
    if (!sel) return
    if (atts.length > 150) return setPdfMsg('Ci sono troppe verifiche per un unico PDF: restringi il periodo con i filtri.')
    setBusy(true); setPdfMsg('')
    try {
      const ids: string[] = atts.map((a) => a.id); const qids: string[] = Array.from(new Set<string>(atts.map((a) => a.quiz_id)))
      const [full, answers, qs, sols] = await Promise.all([fetchIn('attempts', 'id', ids), fetchIn('attempt_answers', 'attempt_id', ids), fetchIn('quiz_questions', 'quiz_id', qids), fetchIn('quiz_solutions', 'quiz_id', qids)])
      const details: Detail[] = full.map((a) => ({
        att: a, quiz: { title: atts.find((x) => x.id === a.id)?.quizzes?.title ?? '' },
        items: ((a.question_order as string[]) ?? []).map((qid) => {
          const q = qs.find((x) => x.id === qid), an = answers.find((x) => x.attempt_id === a.id && x.question_id === qid), s = sols.find((x) => x.question_id === qid)
          return q && an ? { q, an, s } : null }).filter(Boolean) as any[] }))
      publish(buildStudentPdf(sel.name, atts, filterText, details), `Archivio_completo_${safe(sel.name)}.pdf`, false)
    } catch (e) { setPdfMsg('Creazione del PDF non riuscita: ' + (e as Error).message) } finally { setBusy(false) }
  }

  if (err) return <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</p>
  if (all === null) return <p className="text-sm text-slate-500">Caricamento…</p>

  // ----- elenco studenti -----
  if (!sel) return (
    <div className="space-y-5">
      <h1>Statistiche per studente</h1>
      <p className="text-sm text-slate-600">Scegli uno studente per vedere le sue statistiche e stampare il suo archivio.</p>
      <input className="input max-w-sm" placeholder="Cerca uno studente" value={search} onChange={(e) => setSearch(e.target.value)} />
      {students.length === 0 && <p className="rounded-lg border bg-white p-5 text-sm text-slate-500">Nessuna consegna ancora: gli studenti compariranno qui dopo la prima verifica svolta.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((g) => (
          <button key={g.key} onClick={() => pick(g.key)} className="rounded-lg border bg-white p-4 text-left transition hover:border-brand hover:shadow-md">
            <div className="font-semibold text-brand">{g.name}</div>
            <div className="mt-1 text-sm text-slate-600">{g.s.n} {g.s.n === 1 ? 'verifica corretta' : 'verifiche corrette'}</div>
            <div className="mt-2 flex gap-4 text-xs text-slate-500">
              <span>Media <strong className="text-slate-800">{fmt2(g.s.avgGrade)}</strong></span>
              <span>% media <strong className="text-slate-800">{g.s.avgPercent === null ? '–' : fmt1(g.s.avgPercent) + '%'}</strong></span></div>
            {g.atts.some((a) => a.status === 'submitted') && <div className="mt-2 text-xs text-orange-600">Ha verifiche da correggere</div>}
          </button>))}
      </div>
    </div>)

  // ----- scheda di uno studente -----
  return (
    <div className="space-y-5">
      <button className="text-sm text-brand underline" onClick={() => setStudent('')}>← Tutti gli studenti</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1>{sel.name}</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={pdfSummary} disabled={busy || atts.length === 0}>Stampa riepilogo (PDF)</button>
          <button className="btn btn-ghost" onClick={pdfFull} disabled={busy || atts.length === 0}>{busy ? 'Preparazione…' : 'PDF con tutte le verifiche compilate'}</button>
        </div>
      </div>
      {pdfMsg && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{pdfMsg}</p>}
      {pdf && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">PDF pronto: <a className="font-medium underline" href={pdf.url} download={pdf.name} target="_blank" rel="noreferrer">apri o scarica {pdf.name}</a></p>}

      <div className="flex flex-wrap items-end gap-3">
        <div><label className="mb-1 block text-xs text-slate-500">Materia</label>
          <select className="input w-44" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Tutte</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="mb-1 block text-xs text-slate-500">Dal</label><input className="input w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-slate-500">Al</label><input className="input w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {(subject || from || to) && <button className="btn btn-ghost" onClick={() => { setSubject(''); setFrom(''); setTo('') }}>Azzera filtri</button>}
      </div>
      <p className="-mt-2 text-xs text-slate-500">I filtri valgono anche per il PDF. Le medie considerano solo le verifiche corrette del tutto.</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="Verifiche corrette" value={String(sum.n)} />
        <Card label="Percentuale media" value={sum.avgPercent === null ? '–' : fmt1(sum.avgPercent) + '%'} />
        <Card label="Media dei voti" value={fmt2(sum.avgGrade)} />
        <Card label="Voti sufficienti (6 o più)" value={sum.passRate === null ? '–' : fmt1(sum.passRate) + '%'} color="text-green-700" />
        <Card label="Da correggere" value={String(toCorrect)} color="text-orange-600" />
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-medium">Andamento <span className="text-sm font-normal text-slate-500">· percentuale di ogni verifica, in ordine di data</span></h2>
        <div dangerouslySetInnerHTML={{ __html: lineChartSvg(hist, 'Andamento delle verifiche di ' + sel.name) }} />
        {trend.points.length > 1 && hist.length > 8 && <p className="mt-1 text-xs text-slate-500">Media per {trend.unit}: {trend.points.map((p) => `${p.label} ${fmt1(p.value)}%`).join(' · ')}</p>}
      </section>

      {bySubject.length > 1 && (
        <section className="rounded-lg border bg-white">
          <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Per materia</h2>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="px-4 py-2">Materia</th><th className="px-4 py-2">Consegne</th><th className="px-4 py-2">% media</th><th className="px-4 py-2">Media voti</th></tr></thead>
            <tbody>{bySubject.map((g) => <tr key={g.key} className="border-t border-slate-100"><td className="px-4 py-2 font-medium">{g.key}</td><td className="px-4 py-2">{g.s.n}</td>
              <td className="px-4 py-2">{g.s.avgPercent === null ? '–' : fmt1(g.s.avgPercent) + '%'}</td><td className="px-4 py-2">{fmt2(g.s.avgGrade)}</td></tr>)}</tbody></table></div>
        </section>)}

      <section className="rounded-lg border bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Tutte le verifiche</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="px-4 py-2">Data</th><th className="px-4 py-2">Verifica</th><th className="px-4 py-2">Materia</th><th className="px-4 py-2">Punti</th><th className="px-4 py-2">%</th><th className="px-4 py-2">Voto</th><th /></tr></thead>
          <tbody>{atts.length === 0 && <tr><td colSpan={7} className="p-4 text-slate-500">Nessuna verifica con questi filtri.</td></tr>}
            {[...atts].sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '')).map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('it-IT') : ''}</td>
                <td className="px-4 py-2 font-medium">{a.quizzes?.title}</td><td className="px-4 py-2">{a.quizzes?.subject}</td>
                <td className="px-4 py-2">{a.status === 'graded' ? `${fmt2(Number(a.total_points))}/${fmt2(Number(a.max_points))}`.replace(/,00/g, '') : '–'}</td>
                <td className="px-4 py-2">{a.status === 'graded' ? fmt1(Number(a.percent)) + '%' : '–'}</td>
                <td className="px-4 py-2">{a.status === 'graded' ? a.final_grade_label ?? '–' : <span className="text-orange-600">da correggere</span>}</td>
                <td className="px-4 py-2"><Link className="text-brand underline" to={'/risultati/' + a.id}>Apri</Link></td></tr>))}</tbody></table></div>
      </section>
    </div>
  )
}
