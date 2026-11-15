/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { TYPES, BLANK_TYPES, fmtNum } from '../lib/types'
import { describeSolution } from '../lib/describe'

const Lines = ({ n }: { n: number }) => (
  <div className="mt-1">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-8 border-b border-slate-400" />)}</div>
)
const letter = (i: number) => String.fromCharCode(65 + i)

function StudentBody({ q }: { q: any }) {
  const c = q.content
  switch (q.type) {
    case 'mcq_single': case 'mcq_multi':
      return <div className="space-y-1">{q.type === 'mcq_multi' && <div className="text-xs italic">Più risposte possibili.</div>}
        {c.options.map((o: any) => <div key={o.id} className="flex gap-2"><span>{q.type === 'mcq_single' ? '○' : '☐'}</span><span>{o.text}</span></div>)}</div>
    case 'true_false': return <div className="flex gap-10"><span>☐ Vero</span><span>☐ Falso</span></div>
    case 'short_answer': return <Lines n={2} />
    case 'translation': case 'transformation': return <Lines n={4} />
    case 'open': return <Lines n={9} />
    case 'matching':
      return (<div><div className="mb-1 text-xs italic">Scrivi accanto a ogni elemento la lettera corrispondente.</div>
        <div className="grid grid-cols-2 gap-x-8">
          <div className="space-y-1">{c.left.map((l: any, i: number) => <div key={l.id}>{i + 1}. {l.text} <span className="inline-block w-10 border-b border-slate-500" /></div>)}</div>
          <div className="space-y-1">{c.right.map((r: any, i: number) => <div key={r.id}>{letter(i)}. {r.text}</div>)}</div></div></div>)
    default: return null // completamenti: gli spazi sono già nel testo
  }
}

function KeyBody({ q, s }: { q: any; s: any }) {
  const c = q.content; const sol = s?.solution
  if (q.type === 'mcq_single' || q.type === 'mcq_multi') {
    const ok: string[] = q.type === 'mcq_single' ? [sol?.correct] : sol?.correct || []
    return <div className="space-y-0.5">{c.options.map((o: any) => (
      <div key={o.id} className={ok.includes(o.id) ? 'font-semibold' : 'text-slate-600'}>{ok.includes(o.id) ? '✔' : '○'} {o.text}</div>))}
      {q.type === 'mcq_multi' && <div className="text-xs italic">{sol?.partial ? 'Punteggio parziale.' : 'Tutto o niente.'}</div>}</div>
  }
  if (q.type === 'matching') {
    const pairs = c.left.map((l: any, i: number) => `${i + 1} → ${letter(c.right.findIndex((r: any) => r.id === sol?.pairs?.[l.id]))}`).join('   ')
    return <div><div className="grid grid-cols-2 gap-x-8 text-slate-600">
      <div>{c.left.map((l: any, i: number) => <div key={l.id}>{i + 1}. {l.text}</div>)}</div>
      <div>{c.right.map((r: any, i: number) => <div key={r.id}>{letter(i)}. {r.text}</div>)}</div></div>
      <div className="mt-1 font-semibold">Soluzione: {pairs}</div></div>
  }
  return <div className="font-semibold">Risposta: <span className="whitespace-pre-line">{describeSolution(q.type, c, sol)}</span></div>
}

export default function PrintQuiz() {
  const { id, tipo } = useParams()
  const key = tipo === 'correttore'
  const [quiz, setQuiz] = useState<any>(null); const [qs, setQs] = useState<any[]>([])
  const [sols, setSols] = useState<any[]>([]); const [passages, setPassages] = useState<any[]>([])
  const [pass, setPass] = useState<number | null>(null); const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data: qz } = await supabase.from('quizzes').select('*').eq('id', id).single()
      if (!qz) return setErr('Verifica non trovata.')
      const [{ data: rows }, { data: ps }] = await Promise.all([
        supabase.from('quiz_questions').select('*').eq('quiz_id', id).order('position'),
        supabase.from('quiz_passages').select('*').eq('quiz_id', id).order('position')])
      setQuiz(qz); setQs(rows ?? []); setPassages(ps ?? [])
      if (key) { // le soluzioni vengono lette solo per il correttore
        const { data: s } = await supabase.from('quiz_solutions').select('*').eq('quiz_id', id); setSols(s ?? [])
        const sc = qz.scale_id ? await supabase.from('grade_scales').select('pass_percent').eq('id', qz.scale_id).maybeSingle()
          : await supabase.from('grade_scales').select('pass_percent').eq('is_default', true).limit(1).maybeSingle()
        if (sc.data) setPass(Number(sc.data.pass_percent))
      }
    })()
  }, [id, key])

  if (err) return <p className="text-red-600">{err}</p>
  if (!quiz) return <p className="text-sm text-slate-500">Caricamento…</p>
  const total = qs.reduce((t, q) => t + Number(q.points), 0)
  let lastPassage: string | null = null

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={() => window.print()}>Stampa / Salva come PDF</button>
        <span className="text-sm text-slate-600">Nella finestra di stampa scegli <strong>PDF → Salva come PDF</strong>. Formato A4.</span>
      </div>
      <div className="print-sheet mx-auto max-w-[210mm] bg-white p-8 text-[11pt] leading-snug text-slate-900 shadow-sm">
        <div className="mb-4 border-b-2 border-slate-800 pb-2">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-bold">{quiz.title}</h1>
            {key && <span className="shrink-0 rounded border border-slate-800 px-2 py-0.5 text-xs font-bold uppercase">Correttore · riservato al docente</span>}
          </div>
          <div className="text-sm text-slate-600">{quiz.subject}{quiz.topic ? ` · ${quiz.topic}` : ''}{quiz.level ? ` · ${quiz.level}` : ''}</div>
        </div>
        {!key && (
          <div className="mb-3 grid grid-cols-3 gap-4 text-sm">
            <div className="col-span-2">Nome e cognome <span className="inline-block w-64 border-b border-slate-500" /></div>
            <div>Data <span className="inline-block w-28 border-b border-slate-500" /></div>
          </div>)}
        {!key && quiz.instructions && <p className="mb-3 whitespace-pre-line rounded bg-slate-100 p-2 text-sm">{quiz.instructions}</p>}
        <div className="mb-4 text-sm font-medium">
          {quiz.duration_minutes ? `Durata: ${quiz.duration_minutes} minuti · ` : ''}Punteggio massimo: {fmtNum(total)} punti
          {key && pass !== null && <> · Sufficienza: {fmtNum(pass)}% ({fmtNum(Math.round(total * pass) / 100)} punti)</>}
        </div>

        {qs.map((q, i) => {
          const showP = q.passage_id && q.passage_id !== lastPassage; lastPassage = q.passage_id
          const p = showP ? passages.find((x) => x.id === q.passage_id) : null
          const text = BLANK_TYPES.includes(q.type) ? q.content.text.replace(/___/g, '________________') : q.content.text
          const s = sols.find((x) => x.question_id === q.id)
          return (
            <div key={q.id}>
              {p && <div className="q-block mb-3 rounded border border-slate-300 bg-slate-50 p-3 text-sm"><div className="mb-1 font-semibold">{p.title}</div><div className="whitespace-pre-line">{p.body}</div></div>}
              <div className="q-block mb-4">
                <div className="mb-1 flex justify-between gap-3">
                  <div className="font-semibold"><span className="whitespace-pre-line">{i + 1}. {text}</span>
                    {key && <span className="ml-2 text-xs font-normal text-slate-500">({TYPES[q.type]})</span>}</div>
                  <div className="shrink-0 text-sm">{fmtNum(Number(q.points))} pt</div></div>
                {key ? <><KeyBody q={q} s={s} />{s?.explanation && <div className="mt-1 text-sm italic text-slate-600">Spiegazione: {s.explanation}</div>}</> : <StudentBody q={q} />}
              </div>
            </div>)
        })}
        {key && <div className="mt-4 border-t border-slate-400 pt-2 text-right font-semibold">Punteggio totale: {fmtNum(total)} punti</div>}
      </div>
      <div className="fixed inset-x-0 bottom-0 hidden text-center text-[9pt] text-slate-500 print:block">
        {quiz.title}{key ? ' · Correttore' : ''}
      </div>
    </div>
  )
}
