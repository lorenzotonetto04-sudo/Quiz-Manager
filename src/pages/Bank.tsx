/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TYPES, blankQuestion, fmtNum, normalizeSolution, validateQuestion, type Q } from '../lib/types'
import QuestionEditor from './QuestionEditor'

type Edit = { id: string | null; subject: string; topic: string; q: Q }
const toQ = (r: any): Q => ({ id: r.id, type: r.type, points: Number(r.points), content: r.content, solution: r.solution ?? {}, explanation: r.explanation ?? '' })

export default function Bank() {
  const [rows, setRows] = useState<any[]>([])
  const [text, setText] = useState(''); const [subj, setSubj] = useState(''); const [topic, setTopic] = useState(''); const [type, setType] = useState('')
  const [edit, setEdit] = useState<Edit | null>(null); const [newType, setNewType] = useState('mcq_single')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('question_bank').select('*').order('created_at', { ascending: false }).limit(2000)
    setRows(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const subjects = Array.from(new Set(rows.map((r) => r.subject))).sort()
  const topics = Array.from(new Set(rows.filter((r) => !subj || r.subject === subj).map((r) => r.topic).filter(Boolean))).sort()
  const shown = rows.filter((r) => (!subj || r.subject === subj) && (!topic || r.topic === topic) && (!type || r.type === type) &&
    `${r.content?.text ?? ''} ${r.topic ?? ''}`.toLowerCase().includes(text.toLowerCase()))

  async function save() {
    if (!edit) return
    if (!edit.subject.trim()) return setMsg({ ok: false, t: 'Indica la materia della domanda.' })
    const err = validateQuestion(edit.q)
    if (err) return setMsg({ ok: false, t: 'Domanda incompleta: ' + err + '.' })
    const payload = { subject: edit.subject.trim(), topic: edit.topic.trim() || null, type: edit.q.type, content: edit.q.content,
      solution: normalizeSolution(edit.q.solution), explanation: edit.q.explanation || null, points: edit.q.points }
    const { error } = edit.id ? await supabase.from('question_bank').update(payload).eq('id', edit.id) : await supabase.from('question_bank').insert(payload)
    if (error) return setMsg({ ok: false, t: 'Salvataggio non riuscito: ' + error.message })
    setEdit(null); setMsg({ ok: true, t: 'Domanda salvata in archivio.' }); load()
  }
  async function remove(r: any) {
    if (!confirm('Eliminare questa domanda dall\'archivio? Le verifiche che la contengono non cambiano.')) return
    const { error } = await supabase.from('question_bank').delete().eq('id', r.id)
    setMsg(error ? { ok: false, t: error.message } : { ok: true, t: 'Domanda eliminata dall\'archivio.' }); load()
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold text-brand">Archivio domande</h1>
      <p className="text-sm text-slate-600">Qui conservi le domande da riutilizzare. Le salvi dall'editor di una verifica (pulsante "Salva in archivio") e le inserisci in altre verifiche con "Aggiungi dall'archivio".</p>
      {msg && <p role="status" className={`rounded-md p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      {edit && (
        <div className="space-y-3 rounded-lg border border-brand bg-brand-light p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-sm">Materia *</label><input className="input" list="bank-subjects" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
              <datalist id="bank-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist></div>
            <div><label className="mb-1 block text-sm">Argomento</label><input className="input" value={edit.topic} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} /></div>
          </div>
          <QuestionEditor q={edit.q} index={0} label={edit.id ? 'Modifica domanda' : 'Nuova domanda'} locked={false} error={validateQuestion(edit.q)} onChange={(q) => setEdit({ ...edit, q })} />
          <div className="flex gap-2"><button className="btn btn-primary" onClick={save}>Salva in archivio</button><button className="btn btn-ghost" onClick={() => setEdit(null)}>Annulla</button></div>
        </div>)}

      {!edit && (
        <div className="flex flex-wrap items-center gap-2">
          <select className="input max-w-xs" value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Tipologia nuova domanda">
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn btn-primary" onClick={() => { setMsg(null); setEdit({ id: null, subject: subj, topic: '', q: blankQuestion(newType) }) }}>Nuova domanda</button>
        </div>)}

      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Cerca nel testo o nell'argomento" value={text} onChange={(e) => setText(e.target.value)} />
        <select className="input max-w-[10rem]" value={subj} onChange={(e) => { setSubj(e.target.value); setTopic('') }} aria-label="Materia">
          <option value="">Tutte le materie</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input max-w-[12rem]" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Argomento">
          <option value="">Tutti gli argomenti</option>{topics.map((t) => <option key={t}>{t}</option>)}</select>
        <select className="input max-w-[14rem]" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipologia">
          <option value="">Tutte le tipologie</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-2">Domanda</th><th className="px-4 py-2">Tipologia</th><th className="px-4 py-2">Materia / argomento</th><th className="px-4 py-2">Punti</th><th /></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">{rows.length === 0 ? 'L\'archivio è vuoto. Crea una domanda con il pulsante qui sopra oppure salvala da una verifica.' : 'Nessuna domanda corrisponde ai filtri.'}</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="max-w-xs px-4 py-2"><div className="line-clamp-2 font-medium">{r.content?.text}</div></td>
                <td className="px-4 py-2">{TYPES[r.type]}</td>
                <td className="px-4 py-2">{r.subject}{r.topic ? <span className="text-slate-500"> · {r.topic}</span> : ''}</td>
                <td className="px-4 py-2">{fmtNum(Number(r.points))}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <button className="mr-3 text-brand underline" onClick={() => { setMsg(null); setEdit({ id: r.id, subject: r.subject, topic: r.topic ?? '', q: toQ(r) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Modifica</button>
                  <button className="text-red-600 underline" onClick={() => remove(r)}>Elimina</button></td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
