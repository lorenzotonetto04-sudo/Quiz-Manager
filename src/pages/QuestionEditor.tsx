import { TYPES, BLANK_TYPES, TEXT_TYPES, newId, type Q } from '../lib/types'
import ImageField from './ImageField'

type Props = { q: Q; index: number; error: string | null; onChange: (q: Q) => void; onDelete?: () => void; onMove?: (d: number) => void; onBank?: () => void; label?: string; passages?: { id: string; title: string }[]; locked: boolean }

export default function QuestionEditor({ q, index, error, onChange, onDelete, onMove, onBank, label, passages, locked }: Props) {
  const setContent = (patch: object) => onChange({ ...q, content: { ...q.content, ...patch } })
  const setSol = (patch: object) => onChange({ ...q, solution: { ...q.solution, ...patch } })
  const isBlank = BLANK_TYPES.includes(q.type)
  const nBlanks = isBlank ? (q.content.text.match(/___/g) || []).length : 0

  return (
    <fieldset disabled={locked} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{label ?? `Domanda ${index + 1}`} <span className="font-normal text-slate-500">· {TYPES[q.type]}</span></div>
        <div className="flex items-center gap-2 text-sm">
          <label>Punti <input className="input inline-block w-20" type="number" step="0.25" min="0" value={q.points}
            onChange={(e) => onChange({ ...q, points: Number(e.target.value) })} /></label>
          {onBank && <button type="button" className="btn btn-ghost" onClick={onBank}>Salva in archivio</button>}
          {onMove && <button type="button" className="btn btn-ghost" onClick={() => onMove(-1)} aria-label="Sposta su">↑</button>}
          {onMove && <button type="button" className="btn btn-ghost" onClick={() => onMove(1)} aria-label="Sposta giù">↓</button>}
          {onDelete && <button type="button" className="btn btn-ghost text-red-600" onClick={onDelete}>Elimina</button>}
        </div>
      </div>
      {error && <p className="text-sm text-orange-600">Da completare: {error}</p>}

      <div>
        <label className="mb-1 block text-sm font-medium">{isBlank ? 'Testo (scrivi ___ dove lo studente deve completare)' : 'Testo della domanda'}</label>
        <textarea className="input" rows={isBlank ? 3 : 2} value={q.content.text} onChange={(e) => setContent({ text: e.target.value })} />
      </div>
      <ImageField value={q.imagePath} onChange={(p) => onChange({ ...q, imagePath: p })} label="Immagine della domanda (facoltativa)" />
      {passages && passages.length > 0 && (
        <div><label className="mb-1 block text-sm font-medium">Brano a cui si riferisce</label>
          <select className="input max-w-md" value={q.passageId ?? ''} onChange={(e) => onChange({ ...q, passageId: e.target.value || null })}>
            <option value="">Nessun brano</option>
            {passages.map((p, i) => <option key={p.id} value={p.id}>Brano {i + 1}{p.title ? ': ' + p.title : ''}</option>)}</select></div>)}

      {q.type.startsWith('mcq') && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Opzioni (seleziona {q.type === 'mcq_single' ? 'quella corretta' : 'tutte le corrette'})</div>
          {q.content.options.map((o: { id: string; text: string }, i: number) => {
            const checked = q.type === 'mcq_single' ? q.solution.correct === o.id : q.solution.correct.includes(o.id)
            return (
              <div key={o.id} className="flex items-center gap-2">
                <input type={q.type === 'mcq_single' ? 'radio' : 'checkbox'} name={'c' + q.id} checked={checked} aria-label={'Opzione ' + (i + 1) + ' corretta'}
                  onChange={() => q.type === 'mcq_single' ? setSol({ correct: o.id })
                    : setSol({ correct: checked ? q.solution.correct.filter((x: string) => x !== o.id) : [...q.solution.correct, o.id] })} />
                <input className="input" value={o.text} placeholder={'Opzione ' + (i + 1)}
                  onChange={(e) => setContent({ options: q.content.options.map((x: { id: string }) => x.id === o.id ? { ...x, text: e.target.value } : x) })} />
                <button type="button" className="text-red-600" aria-label="Rimuovi opzione" onClick={() => {
                  setContent({ options: q.content.options.filter((x: { id: string }) => x.id !== o.id) })
                  if (q.type === 'mcq_single' && q.solution.correct === o.id) setSol({ correct: '' })
                  if (q.type === 'mcq_multi') setSol({ correct: q.solution.correct.filter((x: string) => x !== o.id) })
                }}>✕</button>
              </div>)
          })}
          <button type="button" className="btn btn-ghost" onClick={() => setContent({ options: [...q.content.options, { id: newId(), text: '' }] })}>Aggiungi opzione</button>
          {q.type === 'mcq_multi' && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!q.solution.partial} onChange={(e) => setSol({ partial: e.target.checked })} />
              Punteggio parziale (altrimenti tutto o niente)</label>)}
        </div>)}

      {q.type === 'true_false' && (
        <select className="input max-w-xs" value={String(q.solution.correct)} onChange={(e) => setSol({ correct: e.target.value === 'true' })}>
          <option value="true">Risposta corretta: Vero</option><option value="false">Risposta corretta: Falso</option></select>)}

      {isBlank && nBlanks > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Risposte accettate per ogni spazio (separa le alternative con |)</div>
          {Array.from({ length: nBlanks }).map((_, i) => (
            <div key={i} className="flex items-center gap-2"><span className="w-16 text-sm text-slate-500">Spazio {i + 1}</span>
              <input className="input" value={(q.solution.blanks?.[i] || []).join('|')}
                onChange={(e) => { const b = Array.from({ length: nBlanks }, (_, k) => q.solution.blanks?.[k] || [])
                  b[i] = e.target.value.split('|'); setSol({ blanks: b }) }} /></div>))}
        </div>)}

      {TEXT_TYPES.includes(q.type) && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!q.solution.auto} onChange={(e) => setSol({ auto: e.target.checked })} />
            Correzione automatica (solo se la risposta è breve e univoca; altrimenti la correggi tu)</label>
          <label className="block text-sm font-medium">{q.solution.auto ? 'Risposte accettate (una per riga)' : 'Risposta di riferimento (una per riga, visibile solo a te)'}</label>
          <textarea className="input" rows={3} value={(q.solution.accepted || []).join('\n')}
            onChange={(e) => setSol({ accepted: e.target.value.split('\n') })} />
          <p className="text-xs text-slate-500">Puoi scrivere frasi con più parole. Premi Invio per aggiungere un'altra risposta accettata.</p>
        </div>)}

      {q.type === 'open' && (
        <div><label className="mb-1 block text-sm font-medium">Traccia di risposta (visibile solo a te)</label>
          <textarea className="input" rows={2} value={q.solution.model || ''} onChange={(e) => setSol({ model: e.target.value })} /></div>)}

      {q.type === 'matching' && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Coppie da abbinare (a sinistra l'elemento, a destra la sua coppia)</div>
          {q.content.left.map((l: { id: string; text: string }) => {
            const rid = q.solution.pairs[l.id]; const r = q.content.right.find((x: { id: string }) => x.id === rid)
            return (
              <div key={l.id} className="flex items-center gap-2">
                <input className="input" value={l.text} onChange={(e) => setContent({ left: q.content.left.map((x: { id: string }) => x.id === l.id ? { ...x, text: e.target.value } : x) })} />
                <span>↔</span>
                <input className="input" value={r?.text || ''} onChange={(e) => setContent({ right: q.content.right.map((x: { id: string }) => x.id === rid ? { ...x, text: e.target.value } : x) })} />
                <button type="button" className="text-red-600" aria-label="Rimuovi coppia" onClick={() => {
                  const pairs = { ...q.solution.pairs }; delete pairs[l.id]
                  onChange({ ...q, content: { ...q.content, left: q.content.left.filter((x: { id: string }) => x.id !== l.id), right: q.content.right.filter((x: { id: string }) => x.id !== rid) }, solution: { ...q.solution, pairs } })
                }}>✕</button></div>)
          })}
          <button type="button" className="btn btn-ghost" onClick={() => { const l = newId(), r = newId()
            onChange({ ...q, content: { ...q.content, left: [...q.content.left, { id: l, text: '' }], right: [...q.content.right, { id: r, text: '' }] }, solution: { ...q.solution, pairs: { ...q.solution.pairs, [l]: r } } }) }}>Aggiungi coppia</button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.solution.partial !== false} onChange={(e) => setSol({ partial: e.target.checked })} />
            Punteggio parziale (un abbinamento giusto vale una parte dei punti)</label>
        </div>)}

      <div><label className="mb-1 block text-sm font-medium">Spiegazione per lo studente (facoltativa)</label>
        <input className="input" value={q.explanation} onChange={(e) => onChange({ ...q, explanation: e.target.value })} /></div>
    </fieldset>
  )
}
