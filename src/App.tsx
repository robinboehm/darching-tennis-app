import { AdminPage } from './pages/AdminPage'
import { Shell, SignupPage } from './pages/SignupPage'
import { TrainerPlanPage, TrainerSignupPage } from './pages/TrainerPages'
import { useRoute } from './router'

export default function App() {
  const [page, id, sub] = useRoute()

  return (
    <>
      <PrototypeBanner />
      {page === 'anmelden' && <SignupPage key={id ?? 'new'} editId={id} />}
      {page === 'trainer-anmelden' && <TrainerSignupPage key={id ?? 'new'} editId={id} />}
      {page === 'trainer' && sub === 'plan' && <TrainerPlanPage trainerId={id} />}
      {page === 'admin' && <AdminPage tab={(id as 'plan') ?? 'plan'} />}
      {!page && <Home />}
    </>
  )
}

function PrototypeBanner() {
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
      Prototyp zum Ausprobieren · Daten bleiben nur in diesem Browser ·{' '}
      <a href="#/" className="font-semibold underline">Übersicht</a>
    </div>
  )
}

function Home() {
  const links = [
    { href: '#/anmelden', title: 'Eltern & Spieler:innen', text: 'Das Formular, das per WhatsApp-Link verschickt wird. Am besten am Handy ansehen.' },
    { href: '#/admin/plan', title: 'Jugendwartin', text: 'Anmeldungen einstufen, Vorschlag berechnen lassen und per Drag & Drop anpassen.' },
    { href: '#/trainer-anmelden', title: 'Trainer:innen', text: 'Eigene Zeiten, Stundenlimit und Lieblingsgruppen eintragen.' },
    { href: '#/trainer/t1/plan', title: 'Plan einer Trainerin', text: 'So sieht Anna ihren persönlichen Wochenplan.' },
  ]
  return (
    <Shell title="Trainingsplanung – Prototyp">
      <p className="text-slate-600">
        Mit Demodaten: 80 Kinder, 12 Erwachsene, 4 Trainer:innen, Hallenzeiten für den Winter. Probiert die drei Sichten aus:
      </p>
      <div className="mt-6 space-y-3">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-emerald-400">
            <div className="font-semibold text-slate-900">{l.title} →</div>
            <div className="text-sm text-slate-600">{l.text}</div>
          </a>
        ))}
      </div>
    </Shell>
  )
}
