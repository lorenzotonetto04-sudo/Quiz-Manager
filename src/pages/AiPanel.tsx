/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { TYPES, fmtNum, type Q } from '../lib/types'
import { fromAi } from '../lib/ai'
import { chatPrompt, extractJson } from '../lib/aiPrompt'
import { describeSolution } from '../lib/describe'

const DEFAULT_TYPES = ['mcq_single', 'true_false', 'fill_blank', 'short_answer']
const guessLang = (subject: string) => (/tedesc|german|deutsch/i.test(subject) ? 'tedesco' : /ingles|english/i.test(subject) ? 'inglese' : /frances|français/i.test(subject) ? 'francese' : /spagnol/i.test(subject) ? 'spagnolo' : 'italiano')

// Pannello "Genera con AI". Due modi:
//  - "Chat gratuita" (predefinito): copi la richiesta in ChatGPT/Claude/Gemini e incolli qui la risposta. Nessuna chiave, nessun costo.
//  - "Automatico": usa la funzione "generate-quiz" su Supabase (richiede una chiave API).
export default function AiPanel({ quiz, onAdd, onClose }: { quiz: any; onAdd: (qs: Q[]) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'chat' | 'auto'>('chat')
  const [f, setF] = useState({ topic: quiz.topic ?? '', text: '', level: quiz.level ?? '', difficulty: quiz.difficulty ?? 'media', count: '8', language: guessLang(quiz.subject ?? '') })
  const [types, setTypes] = useState<string[]>(DEFAULT_TYPES)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [result, setResult] = useState<Q[] | null>(null); const [sel, setSel] = useState<string[]>([]); const [dropped, setDropped] = useState(0)
  const set = (k: string, v: string) => setF({ ...f, [k]: v })
  const params = () => ({ subject: quiz.subject, topic: f.topic, text: f.text, level: f.level, difficulty: f.difficulty, language: f.language, count: Number(f.count), types })

  function check(): string {
    if (!f.topic.trim() && !f.text.trim()) return 'Scrivi un argomento oppure incolla un testo o degli appunti.'
    if (!types.length) return 'Scegli almeno una tipologia di domanda.'
    if (!(Number(f.count) >= 1 && Number(f.count) <= 20)) return 'Il numero di domande deve essere tra 1 e 20.'
    return ''
  }
  function show(raw: unknown[]) {
    const qs = raw.map(fromAi).filter((x): x is Q => x !== null)
    setDropped(raw.length - qs.length); setResult(qs); setSel(qs.map((q) => q.id))
    if (!qs.length) setErr('Non ho trovato domande utilizzabili. Riprova, magari con più dettagli.')
  }

  async function copyPrompt() {
    const e = check(); if (e) return setErr(e)
    setErr('')
    try { await navigator.clipboard.writeText(chatPrompt(params())); setCopied(true) } catch { setErr('Copia non riuscita: seleziona il testo nella casella qui sotto e copialo a mano.') }
  }
  function importPasted() {
    setErr(''); setResult(null)
    const j = extractJson(pasted)
    if (!j || !Array.isArray(j.questions)) return setErr('Non riesco a leggere la risposta. Controlla di aver copiato tutta la risposta della chat (dalla prima { all\'ultima }). Se serve, scrivi alla chat: "Rigenera solo il JSON, senza altro testo".')
    show(j.questions)
  }

  async function generateAuto() {
    setErr(''); setResult(null)
    const e = check(); if (e) return setErr(e)
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('generate-quiz', { body: params() })
    setBusy(false)
    if (error) {
      let m = 'Impossibile contattare il servizio AI. Controlla la connessione.'
      const ctx = (error as any).context
      if (ctx && typeof ctx.json === 'function') {
        m = 'Errore durante la generazione.'
        try { const j = await ctx.json(); m = j.error ?? j.message ?? m } catch { /* ignora */ }
        if (ctx.status === 404) m = 'La generazione automatica non è configurata. Usa il metodo "Chat gratuita" qui sopra: non richiede configurazioni.'
      }
      return setErr(m)
    }
    show(data?.questions ?? [])
  }

  const tab = (m: 'chat' | 'auto', label: string) => (
    <button className={`rounded-md px-3 py-1.5 text-sm ${mode === m ? 'bg-brand text-white' : 'bg-white text-slate-700'}`} onClick={() => { setMode(m); setErr(''); setResult(null) }}>{label}</button>)

  return (
    <div className="space-y-3 rounded-lg border border-brand bg-brand-light p-4">
      <div className="flex items-center justify-between"><h3 className="font-medium">Genera domande con l'AI</h3><button className="text-sm underline" onClick={onClose}>Chiudi</button></div>
      <div className="flex gap-2">{tab('chat', 'Chat gratuita (consigliato)')}{tab('auto', 'Automatico (con chiave API)')}</div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm">Argomento</label><input className="input" value={f.topic} onChange={(e) => set('topic', e.target.value)} /></div>
        <div><label className="mb-1 block text-sm">Livello scolastico</label><input className="input" value={f.level} onChange={(e) => set('level', e.target.value)} /></div>
        <div><label className="mb-1 block text-sm">Difficoltà</label><select className="input" value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
          <option value="facile">Facile</option><option value="media">Media</option><option value="difficile">Difficile</option></select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-sm">Numero di domande</label><input className="input" type="number" min="1" max="20" value={f.count} onChange={(e) => set('count', e.target.value)} /></div>
          <div><label className="mb-1 block text-sm">Lingua delle domande</label><input className="input" value={f.language} onChange={(e) => set('language', e.target.value)} /></div></div>
      </div>
      <div><label className="mb-1 block text-sm">Testo o appunti da cui partire (facoltativo)</label>
        <textarea className="input" rows={4} value={f.text} onChange={(e) => set('text', e.target.value)} placeholder="Incolla qui un brano, degli appunti o un paragrafo del libro…" /></div>
      <div><div className="mb-1 text-sm">Tipologie di domande</div>
        <div className="grid gap-1 sm:grid-cols-2">{Object.entries(TYPES).map(([k, v]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={types.includes(k)} onChange={() => setTypes(types.includes(k) ? types.filter((x) => x !== k) : [...types, k])} />{v}</label>))}</div></div>

      {mode === 'chat' ? (
        <div className="space-y-3 rounded-md bg-white p-3 text-sm">
          <div><strong>1.</strong> <button className="btn btn-primary" onClick={copyPrompt}>{copied ? 'Richiesta copiata ✓' : 'Copia la richiesta'}</button></div>
          <div><strong>2.</strong> Apri una chat gratuita (ChatGPT, Claude, Gemini, Copilot…), incolla la richiesta e attendi la risposta.</div>
          <div><strong>3.</strong> Copia <u>tutta</u> la risposta e incollala qui:
            <textarea className="input mt-1" rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='La risposta inizia con {"questions": [ …' /></div>
          <button className="btn btn-primary" onClick={importPasted} disabled={!pasted.trim()}>Importa le domande</button>
          <p className="text-xs text-slate-500">Non inserire nella chat dati personali degli studenti: la richiesta contiene solo argomento e testo che indichi qui sopra.</p>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={generateAuto} disabled={busy}>{busy ? 'Generazione in corso… (può richiedere fino a un minuto)' : 'Genera proposta'}</button>)}
      {err && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      {result && result.length > 0 && (
        <div className="space-y-2">
          <p className="rounded-md bg-orange-50 p-3 text-sm text-orange-800">Proposta dell'AI: <strong>controlla sempre domande e risposte</strong>. Dopo averle aggiunte potrai modificare tutto: testo, risposte, punteggi.{dropped > 0 && ` (${dropped} ${dropped === 1 ? 'domanda scartata perché incompleta' : 'domande scartate perché incomplete'}.)`}</p>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {result.map((q) => (
              <label key={q.id} className="flex cursor-pointer items-start gap-3 rounded-md bg-white p-2 text-sm">
                <input type="checkbox" className="mt-1" checked={sel.includes(q.id)} onChange={() => setSel(sel.includes(q.id) ? sel.filter((x) => x !== q.id) : [...sel, q.id])} />
                <span className="min-w-0 flex-1"><span className="block font-medium">{q.content.text}</span>
                  <span className="block text-xs text-slate-600">Risposta: {describeSolution(q.type, q.content, q.solution)}</span>
                  <span className="text-xs text-slate-500">{TYPES[q.type]} · {fmtNum(q.points)} pt</span></span>
              </label>))}
          </div>
          <button className="btn btn-primary" disabled={sel.length === 0} onClick={() => onAdd(result.filter((q) => sel.includes(q.id)))}>Aggiungi {sel.length} {sel.length === 1 ? 'domanda' : 'domande'} alla verifica</button>
        </div>)}
    </div>
  )
}
