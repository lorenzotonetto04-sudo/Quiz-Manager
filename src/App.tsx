import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewQuiz from './pages/NewQuiz'
import QuizList from './pages/QuizList'
import QuizEditor from './pages/QuizEditor'
import Student from './pages/Student'
import Results from './pages/Results'
import ResultDetail from './pages/ResultDetail'
import Settings from './pages/Settings'
import PrintQuiz from './pages/PrintQuiz'
import Bank from './pages/Bank'
import Statistics from './pages/Statistics'

const MENU = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/nuova', label: 'Crea nuova verifica', icon: 'plus' },
  { to: '/archivio', label: 'Archivio verifiche', icon: 'list' },
  { to: '/pubblicate', label: 'Verifiche pubblicate', icon: 'send' },
  { to: '/risultati', label: 'Risultati e correzioni', icon: 'check' },
  { to: '/statistiche', label: 'Statistiche', icon: 'bars' },
  { to: '/domande', label: 'Archivio domande', icon: 'help' },
  { to: '/impostazioni', label: 'Impostazioni', icon: 'sliders' },
]

// Icone semplici, disegnate a tratto
function Icon({ name }: { name: string }) {
  const p: Record<string, JSX.Element> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    list: <path d="M4 6h16M4 12h16M4 18h10" />,
    send: <path d="M5 12h14M13 6l6 6-6 6" />,
    check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
    bars: <path d="M5 20V10M12 20V4M19 20v-7" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.6 2.6 0 015.1.6c0 1.6-2.6 2-2.6 3.6M12 17h.01" /></>,
    sliders: <><path d="M4 7h9M19 7h1M4 17h1M11 17h9" /><circle cx="16" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" /></>,
  }
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>
}

function SideNav({ email, onNavigate }: { email: string; onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-2xl bg-brand text-white shadow-lg">
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Icon name="check" /></div>
        <div><div className="text-base font-semibold leading-tight">Quiz Manager</div><div className="text-xs text-white/60">Area docente</div></div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
        {MENU.map((m) => (
          <NavLink key={m.to} to={m.to} end={m.to === '/'} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-white font-semibold text-brand shadow-sm' : 'text-white/80 hover:bg-white/10'}`}>
            <Icon name={m.icon} />{m.label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2 border-t border-white/15 px-5 py-4 text-xs text-white/70">
        <div className="truncate">{email}</div>
        <button className="w-full rounded-lg border border-white/25 px-3 py-2 text-sm text-white hover:bg-white/10" onClick={() => supabase.auth.signOut()}>Esci</button>
      </div>
    </div>
  )
}

function TeacherLayout({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen md:flex">
      {/* Telefono: barra in alto piena (senza sfumature) e menu a tendina */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-brand px-4 py-2.5 text-white md:hidden">
        <span className="font-semibold">Quiz Manager</span>
        <button className="rounded-lg bg-white/15 px-3 py-2" onClick={() => setOpen(true)} aria-label="Apri il menu">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 p-3"><SideNav email={session.user.email ?? ''} onNavigate={() => setOpen(false)} /></aside>
        </div>)}
      {/* Computer: menu fisso, resta fermo mentre scorri la pagina */}
      <aside className="hidden w-60 shrink-0 p-3 md:sticky md:top-0 md:block md:h-screen md:self-start">
        <SideNav email={session.user.email ?? ''} onNavigate={() => undefined} />
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-10 md:py-8">
        <div className="page-wrap mx-auto w-full max-w-5xl">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/nuova" element={<NewQuiz />} />
            <Route path="/verifica/:id" element={<QuizEditor />} />
            <Route path="/verifica/:id/pdf/:tipo" element={<PrintQuiz />} />
            <Route path="/archivio" element={<QuizList />} />
            <Route path="/pubblicate" element={<QuizList onlyPublished />} />
            <Route path="/risultati" element={<Results />} />
            <Route path="/risultati/:id" element={<ResultDetail />} />
            <Route path="/domande" element={<Bank />} />
            <Route path="/statistiche" element={<Statistics />} />
            <Route path="/impostazioni" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="p-8 text-sm text-slate-500">Caricamento…</div>

  return (
    <HashRouter>
      <Routes>
        <Route path="/s/:token" element={<Student />} />
        <Route path="/*" element={session ? <TeacherLayout session={session} /> : <Login />} />
      </Routes>
    </HashRouter>
  )
}
