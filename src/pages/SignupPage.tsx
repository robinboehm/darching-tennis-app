import { useState } from 'react'
import { WeekGrid } from '../components/WeekGrid'
import { CURRENT_YEAR, uid } from '../domain'
import { navigate } from '../router'
import { setState, useAppState } from '../store'
import type { Player } from '../types'

const emptyPlayer = (): Player => ({
  id: uid(),
  name: '',
  birthYear: CURRENT_YEAR - 9,
  kind: 'kind',
  contact: '',
  availability: [],
  friendNames: '',
  siblingNames: '',
  fromNeighborVillage: false,
  ballColor: null,
  level: null,
  yearsPlaying: null,
  sessionsPerWeek: 1,
})

export function SignupPage({ editId }: { editId?: string }) {
  const state = useAppState()
  const existing = editId ? state.players.find((p) => p.id === editId) : undefined
  const [form, setForm] = useState<Player>(() => existing ?? emptyPlayer())
  const [savedId, setSavedId] = useState<string | null>(null)
  const update = (patch: Partial<Player>) => setForm((f) => ({ ...f, ...patch }))

  if (editId && !existing && !savedId) {
    return <Shell title="Link nicht gefunden">Dieser persönliche Link ist ungültig.</Shell>
  }

  if (savedId) {
    const link = `${window.location.origin}${window.location.pathname}#/anmelden/${savedId}`
    return (
      <Shell title="Danke, angekommen! 🎾">
        <p className="text-slate-600">
          {form.name} ist für das {state.season.name}-Training eingetragen. Die Jugendwartin meldet sich mit dem Plan.
        </p>
        <div className="mt-6 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-sm font-medium text-emerald-900">Dein persönlicher Link zum Ändern</p>
          <p className="mt-1 break-all font-mono text-xs text-emerald-800">{link}</p>
          <button
            className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
            onClick={() => navigator.clipboard?.writeText(link)}
          >
            Link kopieren
          </button>
        </div>
        <button className="mt-6 text-sm text-slate-500 underline" onClick={() => { setSavedId(null); setForm(emptyPlayer()) }}>
          Weiteres Kind eintragen
        </button>
      </Shell>
    )
  }

  const valid = form.name.trim().split(' ').length >= 2 && form.contact.trim() && form.availability.length > 0

  const submit = () => {
    setState((s) => ({
      ...s,
      players: existing ? s.players.map((p) => (p.id === form.id ? form : p)) : [...s.players, form],
    }))
    setSavedId(form.id)
  }

  return (
    <Shell title={`Anmeldung ${state.season.name}`}>
      <p className="text-slate-600">Trag bitte ein, wann du Zeit hättest. Wir bauen daraus die Trainingsgruppen.</p>

      <Section title="Wer spielt?">
        <div className="flex gap-2">
          {(['kind', 'erwachsen'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => update({ kind: k, ballColor: k === 'erwachsen' ? 'erwachsen' : null })}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ring-1 ${
                form.kind === k ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-200'
              }`}
            >
              {k === 'kind' ? 'Kind / Jugend' : 'Erwachsene/r'}
            </button>
          ))}
        </div>
        <Field label="Vor- und Nachname">
          <input className="input" value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="z. B. Mia Huber" />
        </Field>
        <Field label="Geburtsjahr">
          <input
            className="input"
            type="number"
            value={form.birthYear}
            onChange={(e) => update({ birthYear: Number(e.target.value) })}
          />
        </Field>
        <Field label={form.kind === 'kind' ? 'Telefon der Eltern (WhatsApp)' : 'Telefon (WhatsApp)'}>
          <input className="input" value={form.contact} onChange={(e) => update({ contact: e.target.value })} placeholder="+49 …" />
        </Field>
      </Section>

      <Section title="Wann hast du Zeit?" hint="Tippe alle Stunden an, die gehen. Je mehr, desto leichter finden wir eine Gruppe.">
        <WeekGrid season={state.season} selected={form.availability} onChange={(availability) => update({ availability })} />
        <p className="text-xs text-slate-500">{form.availability.length} Stunden ausgewählt</p>
      </Section>

      <Section title="Mit wem spielst du gern?" hint="Freiwillig. Wir versuchen es, können aber nichts versprechen.">
        <input
          className="input"
          value={form.friendNames}
          onChange={(e) => update({ friendNames: e.target.value })}
          placeholder="z. B. Paul Huber, Lea Maier"
        />
      </Section>

      {form.kind === 'kind' && (
        <Section title="Geschwister & Anfahrt">
          <Field label="Geschwister, die auch trainieren">
            <input
              className="input"
              value={form.siblingNames}
              onChange={(e) => update({ siblingNames: e.target.value })}
              placeholder="Namen, falls vorhanden"
            />
          </Field>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-emerald-600"
              checked={form.fromNeighborVillage}
              onChange={(e) => update({ fromNeighborVillage: e.target.checked })}
            />
            Wir kommen aus einem Nachbarort. Geschwister sollen möglichst direkt nacheinander trainieren.
          </label>
        </Section>
      )}

      <button
        disabled={!valid}
        onClick={submit}
        className="mt-8 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-sm disabled:bg-slate-300"
      >
        {existing ? 'Änderungen speichern' : 'Absenden'}
      </button>
      {!valid && <p className="mt-2 text-center text-xs text-slate-500">Bitte Vor- und Nachname, Telefon und mindestens eine Zeit angeben.</p>}
      {existing && (
        <button className="mt-4 w-full text-sm text-slate-500 underline" onClick={() => navigate('/')}>
          Abbrechen
        </button>
      )}
    </Shell>
  )
}

export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">TC Darching · Jugendtraining</div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}
