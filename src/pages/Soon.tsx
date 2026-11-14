export default function Soon({ title, phase }: { title: string; phase: number }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand">{title}</h1>
      <p className="mt-3 text-sm text-slate-600">Questa sezione sarà realizzata nella fase {phase}.</p>
    </div>
  )
}
