/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { gradeValue, generateScale, lookup, toNum, validateScale, type ScaleRow } from '../lib/scale'

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
const ROUND: Record<string, string> = { none: 'Nessuno (usa la percentuale esatta)', whole: "All'intero più vicino", half: 'Al mezzo punto più vicino' }

export default function Settings() {
  const [scales, setScales] = useState<any[]>([]); const [scaleId, setScaleId] = useState('')
  const [pass, setPass] = useState('60'); const [rounding, setRounding] = useState('none')
  const [rows, setRows] = useState<ScaleRow[]>([]); const [test, setTest] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  async function loadList(select?: string) {
    const { data: def } = await supabase.rpc('teacher_ensure_default_scale')
    const { data: list } = await supabase.from('grade_scales').select('*').order('created_at')
    setScales(list ?? [])
    await open(select ?? scaleId ?? (def as string), list ?? [], def as string)
  }
  async function open(id: string, list = scales, def?: string) {
    const s = list.find((x) => x.id === id) ?? list.find((x) => x.id === def) ?? list[0]
    if (!s) return
    const { data: r } = await supabase.from('grade_scale_rows').select('*').eq('scale_id', s.id).order('min_percent')
    setScaleId(s.id); setPass(fmt(Number(s.pass_percent))); setRounding(s.rounding)
    setRows((r ?? []).map((x: any) => ({ min: fmt(Number(x.min_percent)), label: x.grade_label })))
  }
  useEffect(() => { loadList() }, [])

  const current = scales.find((x) => x.id === scaleId)
  const sorted = [...rows].sort((a, b) => toNum(a.min) - toNum(b.min))
  const problem = rows.length ? validateScale(rows) : null
  const maxOf = (i: number) => (i < sorted.length - 1 ? fmt(toNum(sorted[i + 1].min) - 0.01) : '100')
  const setRow = (i: number, p: Partial<ScaleRow>) => setRows(sorted.map((r, k) => (k === i ? { ...r, ...p } : r)))

  function generate() {
    const p = toNum(pass)
    if (!(p >= 10 && p <= 95)) return setMsg({ ok: false, t: 'Per generare la scala la sufficienza deve essere tra 10% e 95%.' })
    setRows(generateScale(p)); setMsg({ ok: true, t: `Scala generata con il voto 6 al ${pass}%. Controllala e premi "Salva".` })
  }
  async function save() {
    const p = toNum(pass)
    if (!(p >= 0 && p <= 100)) return setMsg({ ok: false, t: 'La percentuale di sufficienza deve essere tra 0 e 100.' })
    if (problem) return setMsg({ ok: false, t: problem })
    const payload = sorted.map((r) => ({ min: toNum(r.min), label: r.label.trim(), value: gradeValue(r.label) }))
    const { error } = await supabase.rpc('teacher_save_scale', { p_scale: scaleId, p_pass: p, p_rounding: rounding, p_rows: payload })
    if (error) return setMsg({ ok: false, t: 'Salvataggio non riuscito: ' + error.message })
    await loadList(scaleId); setMsg({ ok: true, t: 'Scala salvata. Vale per le nuove consegne e per le correzioni che salverai da ora (nella verifica puoi anche ricalcolare i voti già assegnati).' })
  }
  async function create() {
    const name = prompt('Nome della nuova scala (es. "Diritto, sufficienza 70%")?')?.trim()
    if (!name) return
    const p = toNum(pass); const base = p >= 10 && p <= 95 ? p : 60
    const { data, error } = await supabase.from('grade_scales').insert({ name, pass_percent: base, rounding }).select('id').single()
    if (error || !data) return setMsg({ ok: false, t: 'Creazione non riuscita: ' + (error?.message ?? '') })
    const r = generateScale(base).map((x) => ({ min: toNum(x.min), label: x.label, value: gradeValue(x.label) }))
    await supabase.rpc('teacher_save_scale', { p_scale: data.id, p_pass: base, p_rounding: rounding, p_rows: r })
    await loadList(data.id); setMsg({ ok: true, t: `Scala "${name}" creata con sufficienza al ${fmt(base)}%. Modifica la percentuale o la tabella e salva.` })
  }
  async function rename() {
    const name = prompt('Nuovo nome della scala?', current?.name)?.trim()
    if (!name) return
    await supabase.from('grade_scales').update({ name }).eq('id', scaleId); await loadList(scaleId)
  }
  async function makeDefault() {
    await supabase.from('grade_scales').update({ is_default: false }).eq('is_default', true)
    await supabase.from('grade_scales').update({ is_default: true }).eq('id', scaleId); await loadList(scaleId)
    setMsg({ ok: true, t: 'Impostata come scala predefinita per le nuove verifiche.' })
  }
  async function remove() {
    if (current?.is_default) return setMsg({ ok: false, t: 'La scala predefinita non si può eliminare: impostane prima un\'altra come predefinita.' })
    if (!confirm('Eliminare questa scala? Le verifiche che la usano passeranno alla scala predefinita.')) return
    await supabase.from('grade_scales').delete().eq('id', scaleId); await loadList(scales.find((x) => x.is_default)?.id)
    setMsg({ ok: true, t: 'Scala eliminata.' })
  }

  const tp = toNum(test)
  const testGrade = test !== '' && !Number.isNaN(tp) && !problem ? lookup(rows, tp, rounding) : null

  return (
    <div className="max-w-3xl space-y-6 pb-24">
      <h1 className="text-2xl font-semibold text-brand">Impostazioni</h1>
      {msg && <p role="status" className={`rounded-md p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Scale di valutazione</h2>
        <p className="text-xs text-slate-500">Ogni verifica può usare una scala diversa (con la propria sufficienza). La scelta si fa dentro la verifica; la scala predefinita è usata se non scegli nulla.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input max-w-sm" value={scaleId} onChange={(e) => open(e.target.value)} aria-label="Scala da modificare">
            {scales.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_default ? ' (predefinita)' : ''}</option>)}</select>
          <button className="btn btn-ghost" onClick={create}>Nuova scala</button>
          <button className="btn btn-ghost" onClick={rename}>Rinomina</button>
          {!current?.is_default && <button className="btn btn-ghost" onClick={makeDefault}>Rendi predefinita</button>}
          {!current?.is_default && <button className="btn btn-ghost text-red-600" onClick={remove}>Elimina</button>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm">Percentuale minima per la sufficienza (%)</label>
            <input className="input" inputMode="decimal" value={pass} onChange={(e) => setPass(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Qualsiasi valore: 50, 60, 65, 70, 75, 80…</p></div>
          <div><label className="mb-1 block text-sm">Arrotondamento della percentuale</label>
            <select className="input" value={rounding} onChange={(e) => setRounding(e.target.value)}>
              {Object.entries(ROUND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost" onClick={() => { if (confirm('Sostituire la tabella qui sotto con una nuova scala calcolata sulla sufficienza indicata?')) generate() }}>Genera la scala dalla sufficienza</button>
          <span className="text-xs text-slate-500">Crea tutti i voti (con + e -, mezzi voti) con il 6 alla percentuale indicata. Poi puoi ritoccarli.</span>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Tabella percentuale → voto</h2>
        <p className="text-xs text-slate-500">Imposti da quale percentuale inizia ogni voto: la fine di ogni fascia è calcolata automaticamente, così gli intervalli non si sovrappongono e nessuna percentuale resta senza voto.</p>
        {problem && <p role="alert" className="text-sm text-orange-700">⚠ {problem}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-1 pr-2">Da %</th><th className="py-1 pr-2">A %</th><th className="py-1 pr-2">Voto</th><th /></tr></thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input className="input w-24" inputMode="decimal" aria-label="Da percentuale" value={r.min} onChange={(e) => setRow(i, { min: e.target.value })} /></td>
                  <td className="py-1 pr-2 text-slate-600">{maxOf(i)}</td>
                  <td className="py-1 pr-2"><input className="input w-24" aria-label="Voto" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} /></td>
                  <td className="py-1"><button className="text-red-600" aria-label="Elimina riga" onClick={() => setRows(sorted.filter((_, k) => k !== i))}>✕</button></td>
                </tr>))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost" onClick={() => { const last = sorted.length ? toNum(sorted[sorted.length - 1].min) : 0
          setRows([...sorted, { min: fmt(Math.min(100, last + 1)), label: '' }]) }}>Aggiungi riga</button>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Prova la scala</h2>
        <label className="flex items-center gap-2">Se lo studente ottiene il <input className="input w-24" inputMode="decimal" value={test} onChange={(e) => setTest(e.target.value)} /> % →
          <strong className="text-brand">{testGrade ?? '–'}</strong></label>
      </section>

      <div className="fixed inset-x-0 bottom-0 flex justify-end border-t border-slate-200 bg-white p-3 md:left-60">
        <button className="btn btn-primary" onClick={save} disabled={!scaleId}>Salva questa scala</button></div>
    </div>
  )
}
