/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { describeAnswer, describeSolution, seededShuffle } from '../lib/describe'
import { fmtNum } from '../lib/types'

const ERR: Record<string, string> = {
  link_invalid: 'Questo link non è valido.', link_inactive: 'Questo link è stato disattivato dal docente.',
  link_expired: 'Questo link è scaduto.', max_attempts: 'Hai raggiunto il numero massimo di tentativi consentiti.',
  invalid_name: 'Inserisci nome e cognome.', not_allowed: 'Operazione non consentita.',
}
const errText = (m?: string) => ERR[Object.keys(ERR).find((k) => m?.includes(k)) ?? ''] ?? 'Si è verificato un errore. Riprova.'
const storeKey = (t: string) => 'qm:' + t
const readSaved = (t: string) => { try { return JSON.parse(localStorage.getItem(storeKey(t)) || 'null') } catch { return null } }
const writeSaved = (t: string, v: unknown) => { try { localStorage.setItem(storeKey(t), JSON.stringify(v)) } catch { /* ignora */ } }

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-2xl p-4 sm:p-6">{children}</div>
}

export default function Student() {
  const { token = '' } = useParams()
  const [phase, setPhase] = useState<'loading' | 'error' | 'intro' | 'quiz' | 'result'>('loading')
  const [info, setInfo] = useState<any>(null)
  const [att, setAtt] = useState<any>(null)
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const saved = readSaved(token)
      if (saved) {
        const { data } = await supabase.rpc('student_resume_attempt', { p_attempt: saved.id, p_key: saved.key })
        if (data) { setAtt(data); setKey(saved.key); setPhase(data.status === 'in_progress' ? 'quiz' : 'result'); return }
      }
      const { data, error } = await supabase.rpc('student_get_link_info', { p_token: token })
      if (error || !data) { setErr('Impossibile contattare il server. Controlla la connessione e ricarica.'); return setPhase('error') }
      if (!data.valid) { setErr(errText(data.reason)); return setPhase('error') }
      setInfo(data); setPhase('intro')
    })()
  }, [token])

  if (phase === 'loading') return <Shell><p className="text-sm text-slate-500">Caricamento…</p></Shell>
  if (phase === 'error') return <Shell><p role="alert" className="rounded-md bg-red-50 p-4 text-red-700">{err}</p></Shell>
  if (phase === 'intro') return <Intro token={token} info={info} onStarted={(d: any) => { setAtt(d); setKey(d.access_key); setPhase('quiz') }} />
  if (phase === 'quiz') return <Quiz att={att} k={key} onDone={() => setPhase('result')} />
  return <Result att={att} k={key} />
}

function Intro({ token, info, onStarted }: { token: string; info: any; onStarted: (d: any) => void }) {
  const [first, setFirst] = useState(''); const [last, setLast] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function start(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('student_start_attempt', { p_token: token, p_first: first, p_last: last })
    setBusy(false)
    if (error || !data) return setErr(errText(error?.message))
    writeSaved(token, { id: data.attempt_id, key: data.access_key })
    onStarted(data)
  }
  return (
    <Shell>
      <form onSubmit={start} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-semibold text-brand">{info.title}</h1>
        {info.instructions && <p className="whitespace-pre-line text-sm text-slate-700">{info.instructions}</p>}
        {info.duration_minutes && <p className="text-sm text-orange-700">Durata: {info.duration_minutes} minuti. Il tempo parte quando premi "Inizia".</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium" htmlFor="fn">Nome</label>
            <input id="fn" className="input" required maxLength={80} value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" /></div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor="ln">Cognome</label>
            <input id="ln" className="input" required maxLength={80} value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" /></div>
        </div>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Avvio…' : 'Inizia la verifica'}</button>
        <p className="text-xs text-slate-500">Vengono raccolti solo nome, cognome e risposte, usati dal docente per la correzione.</p>
      </form>
    </Shell>
  )
}

function Quiz({ att, k, onDone }: { att: any; k: string; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, any>>(att.answers || {})
  const [saveState, setSaveState] = useState<'ok' | 'saving' | 'error'>('ok')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [left, setLeft] = useState<number | null>(null)
  const latest = useRef(answers); latest.current = answers
  const first = useRef(true); const submitted = useRef(false)
  const offset = useRef(new Date(att.server_now).getTime() - Date.now())
  const questions: any[] = att.questions; const passages: any[] = att.passages
  const dur = att.quiz.duration_minutes as number | null

  // Salvataggio automatico dopo ogni modifica (con breve attesa)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setSaveState('saving')
    const t = setTimeout(async () => {
      const { error } = await supabase.rpc('student_save_answers', { p_attempt: att.attempt_id, p_key: k, p_answers: latest.current })
      setSaveState(error ? 'error' : 'ok')
    }, 1200)
    return () => clearTimeout(t)
  }, [answers, att.attempt_id, k])

  const submit = useCallback(async (auto = false) => {
    if (submitted.current) return
    if (!auto) {
      const missing = questions.filter((q) => { const a = latest.current[q.id]; return a === undefined || a === '' || (Array.isArray(a) && a.every((x) => !x)) }).length
      if (!confirm(missing ? `Hai ${missing} domande senza risposta. Vuoi consegnare comunque? Dopo la consegna non potrai più modificare.` : 'Vuoi consegnare la verifica? Dopo la consegna non potrai più modificare.')) return
    }
    submitted.current = true; setBusy(true); setErr('')
    const { error } = await supabase.rpc('student_submit', { p_attempt: att.attempt_id, p_key: k, p_answers: latest.current })
    if (error) { submitted.current = false; setBusy(false); return setErr('Consegna non riuscita (' + errText(error.message) + '). Le risposte sono salvate: riprova.') }
    onDone()
  }, [att.attempt_id, k, onDone, questions])

  useEffect(() => {
    if (!dur) return
    const deadline = new Date(att.started_at).getTime() + dur * 60000
    const tick = () => { const r = deadline - (Date.now() + offset.current); setLeft(Math.max(0, r)); if (r <= 0) submit(true) }
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i)
  }, [dur, att.started_at, submit])

  const answered = questions.filter((q) => { const a = answers[q.id]; return !(a === undefined || a === '' || (Array.isArray(a) && a.every((x) => !x))) }).length
  const mm = left === null ? '' : `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`
  let lastPassage: string | null = null

  return (
    <Shell>
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate font-medium text-brand">{att.quiz.title}</div>
          {left !== null && <div className={`font-mono text-sm ${left < 60000 ? 'text-red-600' : 'text-slate-700'}`} aria-live="off">⏱ {mm}</div>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-slate-200"><div className="h-full bg-green-600" style={{ width: `${(answered / Math.max(questions.length, 1)) * 100}%` }} /></div>
        <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{answered} di {questions.length} risposte</span>
          <span>{saveState === 'saving' ? 'Salvataggio…' : saveState === 'error' ? 'Connessione assente: riprovo alla prossima modifica' : 'Salvato'}</span></div>
      </div>

      <p className="mb-4 text-sm text-slate-600">{att.student.first} {att.student.last}</p>
      <div className="space-y-4">
        {questions.map((q, i) => {
          const showPassage = q.passage_id && q.passage_id !== lastPassage; lastPassage = q.passage_id
          const p = showPassage ? passages.find((x) => x.id === q.passage_id) : null
          return (
            <div key={q.id} className="space-y-3">
              {p && <div className="rounded-lg bg-brand-light p-4 text-sm"><div className="mb-1 font-medium">{p.title}</div><div className="whitespace-pre-line">{p.body}</div></div>}
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-2 flex justify-between gap-2"><h2 className="font-medium">{i + 1}. {q.content.text}</h2>
                  <span className="shrink-0 text-xs text-slate-500">{fmtNum(Number(q.points))} pt</span></div>
                <Input q={q} value={answers[q.id]} shuffleOpts={att.quiz.shuffle_options} seed={att.attempt_id}
                  onChange={(v) => setAnswers({ ...answers, [q.id]: v })} />
              </section>
            </div>)
        })}
      </div>
      {err && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <button className="btn btn-primary mt-6 w-full py-3" disabled={busy} onClick={() => submit(false)}>{busy ? 'Consegna in corso…' : 'Consegna la verifica'}</button>
    </Shell>
  )
}

function Input({ q, value, onChange, shuffleOpts, seed }: { q: any; value: any; onChange: (v: any) => void; shuffleOpts: boolean; seed: string }) {
  const t = q.type
  if (t === 'mcq_single' || t === 'mcq_multi') {
    const opts = shuffleOpts ? seededShuffle<any>(q.content.options, seed + q.id) : q.content.options
    const multi = t === 'mcq_multi'; const cur: string[] = multi ? value || [] : []
    return <div className="space-y-2">{multi && <p className="text-xs text-slate-500">Più risposte possibili.</p>}
      {opts.map((o: any) => (
        <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50">
          <input className="mt-0.5 h-4 w-4" type={multi ? 'checkbox' : 'radio'} name={q.id}
            checked={multi ? cur.includes(o.id) : value === o.id}
            onChange={() => onChange(multi ? (cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id]) : o.id)} />
          <span>{o.text}</span></label>))}</div>
  }
  if (t === 'true_false') return <div className="flex gap-3">{[true, false].map((b) => (
    <label key={String(b)} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border p-3 text-sm ${value === b ? 'border-brand bg-brand-light' : 'border-slate-200'}`}>
      <input type="radio" name={q.id} checked={value === b} onChange={() => onChange(b)} />{b ? 'Vero' : 'Falso'}</label>))}</div>
  if (['sentence_completion', 'fill_blank', 'conjugation'].includes(t)) {
    const parts: string[] = q.content.text.split('___'); const arr: string[] = value || []
    return <p className="text-sm leading-10">{parts.map((s, i) => <span key={i}>      {i > 0 && <input className="input mx-1 inline-block w-36" aria-label={`Spazio ${i}`} value={arr[i - 1] || ''}
        onChange={(e) => { const n = Array.from({ length: parts.length - 1 }, (_, k) => arr[k] || ''); n[i - 1] = e.target.value; onChange(n) }} />}</span>)}
      <span className="block text-xs text-slate-500">Completa gli spazi nell'ordine in cui compaiono nel testo sopra (___).</span></p>
  }
  if (t === 'matching') {
    const cur = value || {}
    return <div className="space-y-2">{q.content.left.map((l: any) => (
      <div key={l.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-sm sm:w-1/2">{l.text}</span>
        <select className="input sm:w-1/2" value={cur[l.id] || ''} onChange={(e) => onChange({ ...cur, [l.id]: e.target.value })}>
          <option value="">Scegli…</option>{q.content.right.map((r: any) => <option key={r.id} value={r.id}>{r.text}</option>)}</select></div>))}</div>
  }
  const rows = t === 'open' ? 8 : t === 'translation' ? 4 : 2
  return <textarea className="input" rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label="La tua risposta" />
}

function Result({ att, k }: { att: any; k: string }) {
  const [res, setRes] = useState<any>(null); const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('student_get_result', { p_attempt: att.attempt_id, p_key: k })
    if (error) return setErr('Non riesco a leggere il risultato. Riprova.'); setRes(data)
  }, [att.attempt_id, k])
  useEffect(() => { load() }, [load])

  return (
    <Shell>
      <h1 className="mb-4 text-2xl font-semibold text-brand">{att.quiz.title}</h1>
      {err && <p role="alert" className="text-red-600">{err}</p>}
      {!res && !err && <p className="text-sm text-slate-500">Caricamento…</p>}
      {res && res.state !== 'ready' && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <p className="font-medium text-green-700">✓ Verifica consegnata.</p>
          <p className="text-sm text-slate-700">{res.state === 'pending_correction' ? 'Il docente deve ancora correggere alcune risposte. Il risultato sarà disponibile appena la correzione è completata.'
            : 'Il docente renderà disponibile il risultato a breve.'}</p>
          <button className="btn btn-ghost" onClick={load}>Controlla di nuovo</button>
          <p className="text-xs text-slate-500">Puoi chiudere la pagina e riaprire lo stesso link più tardi dallo stesso dispositivo.</p>
        </div>)}
      {res?.state === 'ready' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-center">
            <div className="text-5xl font-semibold text-brand">{res.grade ?? '–'}</div>
            <div className="mt-2 text-sm text-slate-600">{fmtNum(Number(res.total_points))} / {fmtNum(Number(res.max_points))} punti · {fmtNum(Number(res.percent))}%</div>
            {res.comment && <p className="mt-3 whitespace-pre-line text-sm">{res.comment}</p>}
          </div>
          {!res.solutions_visible && <p className="text-sm text-slate-600">Le correzioni dettagliate saranno disponibili dopo l'autorizzazione del docente.</p>}
          {res.details?.map((d: any, i: number) => {
            const full = Number(d.points) >= Number(d.max_points); const zero = Number(d.points) === 0
            return (
              <section key={d.question_id} className="space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <div className="flex justify-between gap-2"><h2 className="font-medium">{i + 1}. {d.content.text}</h2>
                  <span className={`shrink-0 font-medium ${full ? 'text-green-700' : zero ? 'text-red-600' : 'text-orange-600'}`}>{fmtNum(Number(d.points))}/{fmtNum(Number(d.max_points))}</span></div>
                <p><span className="text-slate-500">La tua risposta:</span> {describeAnswer(d.type, d.content, d.answer)}</p>
                <p><span className="text-slate-500">Risposta corretta:</span> {describeSolution(d.type, d.content, d.solution)}</p>
                {d.explanation && <p className="text-slate-600">💡 {d.explanation}</p>}
                {d.comment && <p className="text-brand">Commento del docente: {d.comment}</p>}
              </section>)
          })}
        </div>)}
    </Shell>
  )
}
