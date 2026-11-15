import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { TYPES, blankQuestion, validateQuestion, fmtNum, type Q } from '../lib/types'
import QuestionEditor from './QuestionEditor'
import { generateScale, gradeValue, toNum } from '../lib/scale'
import { buildQuizPdf } from '../lib/pdfQuiz'

type Link_ = { id: string; token: string; is_active: boolean; expires_at: string | null; max_attempts: number | null }
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const toIso = (v: string) => (v ? new Date(v).toISOString() : null)
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

export default function QuizEditor() {
  const { id } = useParams()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [quiz, setQuiz] = useState<any>(null)
  const [qs, setQs] = useState<Q[]>([])
  const [links, setLinks] = useState<Link_[]>([])
  const [hasAttempts, setHasAttempts] = useState(false)
  const [newType, setNewType] = useState('mcq_single')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null)
  const [scales, setScales] = useState<any[]>([]); const [defScale, setDefScale] = useState(''); const [newPass, setNewPass] = useState('')
  const base = location.origin + location.pathname + '#/s/'

  async function loadScales() {
    await supabase.rpc('teacher_ensure_default_scale')
    const { data: sc } = await supabase.from('grade_scales').select('id,name,pass_percent,is_default').order('created_at')
    setScales(sc ?? []); setDefScale(sc?.find((x) => x.is_default)?.id ?? '')
  }

  async function load() {
    await loadScales()
    const { data: quizRow } = await supabase.from('quizzes').select('*').eq('id', id).single()
    if (!quizRow) return setMsg({ ok: false, t: 'Verifica non trovata.' })
    const [{ data: rows }, { data: sols }, { data: lk }, { count }] = await Promise.all([
      supabase.from('quiz_questions').select('*').eq('quiz_id', id).order('position'),
      supabase.from('quiz_solutions').select('*').eq('quiz_id', id),
      supabase.from('access_links').select('*').eq('quiz_id', id).order('created_at'),
      supabase.from('attempts').select('*', { count: 'exact', head: true }).eq('quiz_id', id),
    ])
    setQuiz(quizRow); setLinks((lk as Link_[]) ?? []); setHasAttempts((count ?? 0) > 0)
    setQs((rows ?? []).map((r) => { const s = sols?.find((x) => x.question_id === r.id)
      return { id: r.id, type: r.type, points: Number(r.points), content: r.content, solution: s?.solution ?? {}, explanation: s?.explanation ?? '' } }))
  }
  useEffect(() => { load() }, [id])

  const total = qs.reduce((s, q) => s + (Number(q.points) || 0), 0)
  const setQ = (i: number, q: Q) => { setQs(qs.map((x, k) => (k === i ? q : x))); setDirty(true) }
  const setField = (k: string, v: unknown) => { setQuiz({ ...quiz, [k]: v }); setDirty(true) }

  async function save(): Promise<boolean> {
    const { error: e1 } = await supabase.from('quizzes').update({
      title: quiz.title, subject: quiz.subject, topic: quiz.topic, level: quiz.level, difficulty: quiz.difficulty,
      instructions: quiz.instructions, duration_minutes: quiz.duration_minutes, due_at: quiz.due_at,
      shuffle_questions: quiz.shuffle_questions, shuffle_options: quiz.shuffle_options, results_mode: quiz.results_mode, scale_id: quiz.scale_id,
    }).eq('id', id)
    if (e1) { setMsg({ ok: false, t: 'Salvataggio non riuscito: ' + e1.message }); return false }
    if (!hasAttempts) {
      const keep = qs.map((q) => q.id)
      const { data: old } = await supabase.from('quiz_questions').select('id').eq('quiz_id', id)
      const gone = (old ?? []).map((o) => o.id).filter((x) => !keep.includes(x))
      if (gone.length) await supabase.from('quiz_questions').delete().in('id', gone)
      if (qs.length) {
        const rows = qs.map((q, i) => {
          let content = q.content
          if (q.type === 'matching') content = { ...content, right: shuffle(content.right) } // l'ordine non deve rivelare le coppie
          return { id: q.id, quiz_id: id, position: i, type: q.type, content, points: q.points }
        })
        const { error } = await supabase.from('quiz_questions').upsert(rows)
        if (error) { setMsg({ ok: false, t: 'Salvataggio domande non riuscito: ' + error.message }); return false }
        const { error: e3 } = await supabase.from('quiz_solutions').upsert(
          qs.map((q) => ({ question_id: q.id, quiz_id: id, solution: q.solution, explanation: q.explanation || null })))
        if (e3) { setMsg({ ok: false, t: 'Salvataggio soluzioni non riuscito: ' + e3.message }); return false }
      }
    }
    setDirty(false); setMsg({ ok: true, t: 'Salvato.' }); return true
  }

  async function publish() {
    if (qs.length === 0) return setMsg({ ok: false, t: 'Aggiungi almeno una domanda prima di pubblicare.' })
    const bad = qs.map((q, i) => ({ i, e: validateQuestion(q) })).find((x) => x.e)
    if (bad) return setMsg({ ok: false, t: `Domanda ${bad.i + 1}: ${bad.e}.` })
    if (!(await save())) return
    await supabase.rpc('teacher_ensure_default_scale')
    const { data: sc } = await supabase.from('grade_scales').select('id').eq('is_default', true).limit(1).single()
    await supabase.from('quizzes').update({ status: 'published', published_at: new Date().toISOString(), scale_id: quiz.scale_id ?? sc?.id ?? null }).eq('id', id)
    if (links.length === 0) await supabase.from('access_links').insert({ quiz_id: id })
    await load(); setMsg({ ok: true, t: 'Verifica pubblicata. Copia il link e invialo agli studenti.' })
  }
  async function unpublish() { await supabase.from('quizzes').update({ status: 'draft' }).eq('id', id); await load() }
  async function addLink() { await supabase.from('access_links').insert({ quiz_id: id }); load() }
  async function patchLink(l: Link_, p: Partial<Link_>) { await supabase.from('access_links').update(p).eq('id', l.id); load() }
  async function delLink(l: Link_) { if (confirm('Eliminare questo link? Gli studenti non potranno più usarlo.')) { await supabase.from('access_links').delete().eq('id', l.id); load() } }
  async function copy(t: string) { await navigator.clipboard.writeText(t); setMsg({ ok: true, t: 'Link copiato.' }) }

  function openPdf(t: 'studente' | 'correttore') {
    if (dirty) return setMsg({ ok: false, t: 'Salva le modifiche prima di creare il PDF.' })
    if (qs.length === 0) return setMsg({ ok: false, t: 'Aggiungi almeno una domanda.' })
    try {
      const sc = scales.find((x) => x.id === (quiz.scale_id ?? defScale))
      const bytes = buildQuizPdf(t, quiz, qs, sc ? Number(sc.pass_percent) : null)
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }))
      const base = String(quiz.title).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'verifica'
      const name = base + (t === 'correttore' ? '_correttore' : '') + '.pdf'
      if (pdf) URL.revokeObjectURL(pdf.url)
      setPdf({ url, name }); setMsg(null)
      const a = document.createElement('a'); a.href = url; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e) {
      setMsg({ ok: false, t: 'Creazione del PDF non riuscita: ' + (e as Error).message })
    }
  }

  async function createScale() {
    const p = toNum(newPass)
    if (!(p >= 10 && p <= 95)) return setMsg({ ok: false, t: 'Indica una percentuale di sufficienza tra 10 e 95.' })
    const name = `Sufficienza ${String(p).replace('.', ',')}%`
    const ex = scales.find((x) => x.name === name)
    if (ex) { setField('scale_id', ex.id); setNewPass(''); return setMsg({ ok: true, t: `Selezionata la scala "${name}". Premi Salva.` }) }
    const { data, error } = await supabase.from('grade_scales').insert({ name, pass_percent: p, rounding: 'none' }).select('id').single()
    if (error || !data) return setMsg({ ok: false, t: 'Non sono riuscito a creare la scala: ' + (error?.message ?? '') })
    const rows = generateScale(p).map((r) => ({ min: toNum(r.min), label: r.label, value: gradeValue(r.label) }))
    const { error: e2 } = await supabase.rpc('teacher_save_scale', { p_scale: data.id, p_pass: p, p_rounding: 'none', p_rows: rows })
    if (e2) { await supabase.from('grade_scales').delete().eq('id', data.id); return setMsg({ ok: false, t: 'Creazione scala non riuscita: ' + e2.message }) }
    await loadScales(); setField('scale_id', data.id); setNewPass('')
    setMsg({ ok: true, t: `Creata la scala "${name}" e selezionata. Premi Salva. Puoi ritoccarla in Impostazioni.` })
  }

  async function recalcAll() {
    if (dirty && !(await save())) return
    const { data } = await supabase.from('attempts').select('id').eq('quiz_id', id).neq('status', 'in_progress')
    for (const a of data ?? []) await supabase.rpc('teacher_recalculate_attempt', { p_attempt: a.id })
    setMsg({ ok: true, t: `Voti ricalcolati per ${(data ?? []).length} consegne.` })
  }

  if (!quiz) return <p className="text-sm text-slate-500">{msg?.t ?? 'Caricamento…'}</p>
  const locked = hasAttempts
  const published = quiz.status === 'published'

  return (
    <div className="max-w-3xl space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><Link to="/archivio" className="text-sm text-brand underline">← Archivio verifiche</Link>
          <h1 className="text-2xl font-semibold text-brand">{quiz.title}</h1></div>
        <span className={published ? 'text-green-700' : 'text-orange-600'}>{published ? 'Pubblicata' : quiz.status === 'archived' ? 'Archiviata' : 'Bozza'}</span>
      </div>
      {msg && <p role="status" className={`rounded-md p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}
      {pdf && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">PDF pronto: <a className="font-medium underline" href={pdf.url} download={pdf.name} target="_blank" rel="noreferrer">apri o scarica {pdf.name}</a></p>}
      {locked && <p className="rounded-md bg-orange-50 p-3 text-sm text-orange-800">Uno studente ha già iniziato questa verifica: domande e punteggi non sono più modificabili. Per cambiarli, duplica la verifica dall'archivio.</p>}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Dati generali e impostazioni</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm">Titolo</label><input className="input" value={quiz.title} onChange={(e) => setField('title', e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">Materia</label><input className="input" value={quiz.subject} onChange={(e) => setField('subject', e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">Durata in minuti (vuoto = nessun limite)</label>
            <input className="input" type="number" min="1" value={quiz.duration_minutes ?? ''} onChange={(e) => setField('duration_minutes', e.target.value ? Number(e.target.value) : null)} /></div>
          <div><label className="mb-1 block text-sm">Scadenza (vuoto = nessuna)</label>
            <input className="input" type="datetime-local" value={toLocal(quiz.due_at)} onChange={(e) => setField('due_at', toIso(e.target.value))} /></div>
        </div>
        <div><label className="mb-1 block text-sm">Istruzioni per lo studente</label>
          <textarea className="input" rows={2} value={quiz.instructions ?? ''} onChange={(e) => setField('instructions', e.target.value)} /></div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={quiz.shuffle_questions} onChange={(e) => setField('shuffle_questions', e.target.checked)} />Mescola l'ordine delle domande</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={quiz.shuffle_options} onChange={(e) => setField('shuffle_options', e.target.checked)} />Mescola le risposte</label>
        </div>
        <div><label className="mb-1 block text-sm">Quando mostrare i risultati allo studente</label>
          <select className="input" value={quiz.results_mode} onChange={(e) => setField('results_mode', e.target.value)}>
            <option value="immediate_all">Subito voto e correzione</option>
            <option value="grade_immediate_solutions_later">Subito il voto, le soluzioni dopo la mia autorizzazione</option>
            <option value="all_later">Voto e soluzioni solo dopo la mia autorizzazione</option></select></div>
        <div><label className="mb-1 block text-sm">Scala dei voti (con la percentuale di sufficienza di questa verifica)</label>
          <select className="input" value={quiz.scale_id ?? defScale} onChange={(e) => setField('scale_id', e.target.value)}>
            {scales.map((x) => <option key={x.id} value={x.id}>{x.name} · sufficienza {String(Number(x.pass_percent)).replace('.', ',')}%{x.is_default ? ' (predefinita)' : ''}</option>)}</select>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span>Oppure crea al volo una scala con sufficienza al</span>
            <input className="input w-20" inputMode="decimal" aria-label="Percentuale di sufficienza" value={newPass} onChange={(e) => setNewPass(e.target.value)} /><span>%</span>
            <button type="button" className="btn btn-ghost" onClick={createScale}>Crea e usa</button></div>
          {hasAttempts && (
            <div className="mt-2"><button type="button" className="btn btn-ghost" onClick={recalcAll}>Ricalcola i voti già assegnati con questa scala</button>
              <p className="mt-1 text-xs text-slate-500">I voti che hai modificato a mano restano invariati.</p></div>)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-medium">Domande</h2>
          <span className="text-sm text-slate-600">Punteggio massimo: <strong>{fmtNum(total)}</strong></span></div>
        {qs.length === 0 && <p className="text-sm text-slate-500">Nessuna domanda. Scegli un tipo qui sotto e aggiungi la prima.</p>}
        {qs.map((q, i) => (
          <QuestionEditor key={q.id} q={q} index={i} locked={locked} error={validateQuestion(q)}
            onChange={(n) => setQ(i, n)} onDelete={() => { if (confirm('Eliminare questa domanda?')) { setQs(qs.filter((_, k) => k !== i)); setDirty(true) } }}
            onMove={(d) => { const j = i + d; if (j < 0 || j >= qs.length) return; const c = [...qs]; [c[i], c[j]] = [c[j], c[i]]; setQs(c); setDirty(true) }} />))}
        {!locked && (
          <div className="flex flex-wrap gap-2">
            <select className="input max-w-xs" value={newType} onChange={(e) => setNewType(e.target.value)}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button className="btn btn-ghost" onClick={() => { setQs([...qs, blankQuestion(newType)]); setDirty(true) }}>Aggiungi domanda</button>
          </div>)}
      </section>

      {published && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Link per gli studenti</h2>
          {links.map((l) => (
            <div key={l.id} className="space-y-2 rounded-md bg-slate-50 p-3 text-sm">
              <div className="break-all font-mono text-xs">{base + l.token}</div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn btn-primary" onClick={() => copy(base + l.token)}>Copia link</button>
                <label className="flex items-center gap-1"><input type="checkbox" checked={l.is_active} onChange={(e) => patchLink(l, { is_active: e.target.checked })} />Attivo</label>
                <label className="flex items-center gap-1">Tentativi max <input className="input w-20" type="number" min="1" defaultValue={l.max_attempts ?? ''}
                  onBlur={(e) => patchLink(l, { max_attempts: e.target.value ? Number(e.target.value) : null })} /></label>
                <label className="flex items-center gap-1">Scade <input className="input w-52" type="datetime-local" defaultValue={toLocal(l.expires_at)}
                  onBlur={(e) => patchLink(l, { expires_at: toIso(e.target.value) })} /></label>
                <button className="text-red-600 underline" onClick={() => delLink(l)}>Elimina</button>
              </div></div>))}
          <button className="btn btn-ghost" onClick={addLink}>Aggiungi un altro link</button>
          <p className="text-xs text-slate-500">Lo svolgimento da parte degli studenti sarà disponibile con la prossima fase: per ora i link vengono solo creati.</p>
        </section>)}

      <div className="fixed inset-x-0 bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white p-3 md:left-60">
        {dirty && <span className="mr-auto text-sm text-orange-600">Modifiche non salvate</span>}
        <button className="btn btn-ghost" onClick={() => openPdf('studente')}>PDF verifica</button>
        <button className="btn btn-ghost" onClick={() => openPdf('correttore')}>PDF correttore</button>
        {published && !locked && <button className="btn btn-ghost" onClick={unpublish}>Riporta in bozza</button>}
        <button className="btn btn-ghost" onClick={save}>Salva</button>
        {!published && <button className="btn btn-primary" onClick={publish}>Pubblica e crea link</button>}
      </div>
    </div>
  )
}
