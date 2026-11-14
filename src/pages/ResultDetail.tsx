/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmtNum } from '../lib/types'
import { describeAnswer, describeSolution } from '../lib/describe'

export default function ResultDetail() {
  const { id } = useParams(); const nav = useNavigate()
  const [att, setAtt] = useState<any>(null); const [quiz, setQuiz] = useState<any>(null)
  const [items, setItems] = useState<any[]>([]); const [scale, setScale] = useState<any[]>([])
  const [edits, setEdits] = useState<Record<string, { pts?: string; comment?: string }>>({})
  const [sel, setSel] = useState(''); const [tc, setTc] = useState('')
  const [gr, setGr] = useState(false); const [sr, setSr] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  async function load() {
    const { data: a } = await supabase.from('attempts').select('*').eq('id', id).single()
    if (!a) return setMsg({ ok: false, t: 'Consegna non trovata.' })
    const [{ data: qz }, { data: qs }, { data: sols }, { data: ans }] = await Promise.all([
      supabase.from('quizzes').select('id,title,scale_id,teacher_id').eq('id', a.quiz_id).single(),
      supabase.from('quiz_questions').select('*').eq('quiz_id', a.quiz_id),
      supabase.from('quiz_solutions').select('*').eq('quiz_id', a.quiz_id),
      supabase.from('attempt_answers').select('*').eq('attempt_id', id),
    ])
    let sid = qz?.scale_id
    if (!sid) { const { data: d } = await supabase.from('grade_scales').select('id').eq('is_default', true).limit(1).maybeSingle(); sid = d?.id }
    const { data: rows } = sid ? await supabase.from('grade_scale_rows').select('*').eq('scale_id', sid).order('grade_value') : { data: [] }
    const list = (a.question_order as string[]).map((qid) => {
      const q = qs?.find((x) => x.id === qid); const an = ans?.find((x) => x.question_id === qid); const s = sols?.find((x) => x.question_id === qid)
      return q && an ? { q, an, s } : null }).filter(Boolean)
    setAtt(a); setQuiz(qz); setItems(list as any[]); setScale(rows ?? []); setEdits({})
    setSel(a.grade_overridden ? a.final_grade_label : ''); setTc(a.teacher_comment ?? ''); setGr(a.grade_released); setSr(a.solutions_released)
  }
  useEffect(() => { load() }, [id])

  async function save() {
    setMsg(null)
    for (const it of items) {
      const e = edits[it.an.question_id]; if (!e) continue
      const max = Number(it.an.max_points)
      const pts = e.pts === undefined ? it.an.manual_points : e.pts === '' ? null : Math.min(max, Math.max(0, Number(e.pts.replace(',', '.'))))
      const { error } = await supabase.from('attempt_answers').update({ manual_points: pts, comment: (e.comment ?? it.an.comment) || null }).eq('id', it.an.id)
      if (error) return setMsg({ ok: false, t: 'Salvataggio non riuscito: ' + error.message })
    }
    if (sel === '') await supabase.from('attempts').update({ grade_overridden: false }).eq('id', id)
    const { error: er } = await supabase.rpc('teacher_recalculate_attempt', { p_attempt: id })
    if (er) return setMsg({ ok: false, t: 'Ricalcolo non riuscito: ' + er.message })
    if (sel !== '') {
      const row = scale.find((r) => r.grade_label === sel)
      if (row) await supabase.from('attempts').update({ final_grade_label: row.grade_label, final_grade_value: row.grade_value, grade_overridden: true }).eq('id', id)
    }
    await supabase.from('attempts').update({ teacher_comment: tc || null, grade_released: gr, solutions_released: sr }).eq('id', id)
    await load(); setMsg({ ok: true, t: 'Correzione salvata e punteggio ricalcolato.' })
  }
  async function remove() {
    if (!confirm('Eliminare definitivamente questa consegna e i dati dello studente?')) return
    const { error } = await supabase.from('attempts').delete().eq('id', id)
    if (error) return setMsg({ ok: false, t: error.message }); nav('/risultati')
  }

  if (!att) return <p className="text-sm text-slate-500">{msg?.t ?? 'Caricamento…'}</p>
  const secs = att.time_spent_seconds as number | null
  return (
    <div className="max-w-3xl space-y-5 pb-24">
      <Link to="/risultati" className="text-sm text-brand underline">← Risultati</Link>
      <div><h1 className="text-2xl font-semibold text-brand">{att.student_first} {att.student_last}</h1>
        <p className="text-sm text-slate-600">{quiz?.title} · tempo impiegato {secs === null ? '–' : `${Math.floor(secs / 60)} min ${secs % 60} s`}{att.late && ' · consegnata fuori tempo'}</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Punti', `${fmtNum(Number(att.total_points))}/${fmtNum(Number(att.max_points))}`], ['Percentuale', fmtNum(Number(att.percent)) + '%'],
          ['Voto automatico', att.auto_grade_label ?? '–'], ['Voto finale', att.final_grade_label ?? '–']].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-xl font-semibold text-brand">{v}</div><div className="text-xs text-slate-500">{l}</div></div>))}
      </div>
      {att.status === 'submitted' && <p className="rounded-md bg-orange-50 p-3 text-sm text-orange-800">Ci sono risposte da correggere. Finché non assegni un punteggio a tutte, il voto non è definitivo e lo studente non vede il risultato.</p>}
      {msg && <p role="status" className={`rounded-md p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      {items.map(({ q, an, s }, i) => {
        const e = edits[q.id] ?? {}; const need = an.manual_points === null && an.auto_points === null
        const val = e.pts ?? String(an.manual_points ?? an.auto_points ?? '').replace('.', ',')
        return (
          <section key={q.id} className={`space-y-2 rounded-lg border bg-white p-4 text-sm ${need ? 'border-orange-300' : 'border-slate-200'}`}>
            <h2 className="font-medium">{i + 1}. {q.content.text}</h2>
            <p><span className="text-slate-500">Risposta dello studente:</span> <span className="whitespace-pre-line">{describeAnswer(q.type, q.content, an.answer)}</span></p>
            <p><span className="text-slate-500">Risposta corretta / di riferimento:</span> {describeSolution(q.type, q.content, s?.solution)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">Punti <input className="input w-24" inputMode="decimal" value={val}
                onChange={(ev) => setEdits({ ...edits, [q.id]: { ...e, pts: ev.target.value } })} /> / {fmtNum(Number(an.max_points))}</label>
              {need && <span className="text-orange-600">Da correggere</span>}
              {an.auto_points !== null && <span className="text-xs text-slate-500">automatico: {fmtNum(Number(an.auto_points))}</span>}
              <input className="input min-w-[12rem] flex-1" placeholder="Commento (facoltativo)" defaultValue={an.comment ?? ''}
                onChange={(ev) => setEdits({ ...edits, [q.id]: { ...e, comment: ev.target.value } })} />
            </div></section>)
      })}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Voto finale e pubblicazione</h2>
        <div><label className="mb-1 block">Voto finale</label>
          <select className="input max-w-xs" value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Automatico ({att.auto_grade_label ?? '–'})</option>
            {scale.map((r) => <option key={r.id} value={r.grade_label}>{r.grade_label}</option>)}</select>
          {att.grade_overridden && <p className="mt-1 text-xs text-orange-700">Voto modificato manualmente. Il voto automatico originario era {att.auto_grade_label}.</p>}</div>
        <div><label className="mb-1 block">Commento generale per lo studente</label>
          <textarea className="input" rows={2} value={tc} onChange={(e) => setTc(e.target.value)} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={gr} onChange={(e) => setGr(e.target.checked)} />Mostra voto e punteggio allo studente</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={sr} onChange={(e) => setSr(e.target.checked)} />Mostra risposte corrette e correzione dettagliata</label>
      </section>

      <div className="fixed inset-x-0 bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white p-3 md:left-60">
        <button className="btn btn-ghost text-red-600" onClick={remove}>Elimina consegna</button>
        <button className="btn btn-primary" onClick={save}>Salva correzione</button></div>
    </div>
  )
}
