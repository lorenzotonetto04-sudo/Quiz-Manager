import { Component, type ReactNode } from 'react'

// Se qualcosa si rompe, mostra il messaggio d'errore invece di una pagina bianca
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(error) }
  render() {
    const e = this.state.error
    if (!e) return this.props.children
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-6">
        <h1 className="text-xl font-semibold text-brand">Si è verificato un errore</h1>
        <p className="text-sm text-slate-600">Copia il testo qui sotto e mandalo a chi sta sviluppando l'app.</p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-red-50 p-3 text-xs text-red-800">
          {e.message}{'\n\n'}{(e.stack || '').split('\n').slice(0, 6).join('\n')}{'\n\n'}Pagina: {location.hash}
        </pre>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => location.reload()}>Ricarica la pagina</button>
          <button className="btn btn-ghost" onClick={() => { location.hash = '#/'; location.reload() }}>Torna alla dashboard</button>
        </div>
      </div>
    )
  }
}
