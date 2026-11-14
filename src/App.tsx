import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Soon from './pages/Soon'
import NewQuiz from './pages/NewQuiz'
import QuizList from './pages/QuizList'
import QuizEditor from './pages/QuizEditor'
import Student from './pages/Student'
import Results from './pages/Results'
import ResultDetail from './pages/ResultDetail'

const MENU = [
  { to: '/', label: 'Dashboard' },
  { to: '/nuova', label: 'Crea nuova verifica' },
  { to: '/archivio', label: 'Archivio verifiche' },
  { to: '/pubblicate', label: 'Verifiche pubblicate' },
  { to: '/risultati', label: 'Risultati e correzioni' },
  { to: '/domande', label: 'Archivio domande' },
  { to: '/impostazioni', label: 'Impostazioni' },
]

function TeacherLayout({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen md:flex">
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-white md:hidden">
        <span className="font-semibold">Quiz Manager</span>
        <button className="btn bg-white/10" onClick={() => setOpen(!open)}>Menu</button>
      </header>
      <aside className={`${open ? 'block' : 'hidden'} w-full shrink-0 bg-brand text-white md:block md:w-60`}>
        <div className="hidden px-5 py-5 text-lg font-semibold md:block">Quiz Manager</div>
        <nav className="flex flex-col gap-1 px-3 pb-4">
          {MENU.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.to === '/'} onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-white/15 font-medium' : 'text-white/80 hover:bg-white/10'}`}>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/15 px-5 py-4 text-xs text-white/70">
          <div className="mb-2 truncate">{session.user.email}</div>
          <button className="underline" onClick={() => supabase.auth.signOut()}>Esci</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/nuova" element={<NewQuiz />} />
          <Route path="/verifica/:id" element={<QuizEditor />} />
          <Route path="/archivio" element={<QuizList />} />
          <Route path="/pubblicate" element={<QuizList onlyPublished />} />
          <Route path="/risultati" element={<Results />} />
          <Route path="/risultati/:id" element={<ResultDetail />} />
          <Route path="/domande" element={<Soon title="Archivio domande" phase={4} />} />
          <Route path="/impostazioni" element={<Soon title="Impostazioni" phase={4} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
        {/* L'area studente (fase 5) sarà qui, fuori dal login: /s/:token */}
        <Route path="/s/:token" element={<Student />} />
        <Route path="/*" element={session ? <TeacherLayout session={session} /> : <Login />} />
      </Routes>
    </HashRouter>
  )
}
