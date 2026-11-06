import { useState } from 'react'
import { WeekGrid } from '../components/WeekGrid'
import { ageOf, BALL_COLORS, COLOR_CLASSES, COLOR_LABEL, DAY_NAMES_LONG, parseSlot, uid } from '../domain'
import { setState, useAppState } from '../store'
import type { BallColor, Trainer } from '../types'
import { Field, Section, Shell } from './SignupPage'

export function TrainerSignupPage({ editId }: { editId?: string }) {
  const state = useAppState()
  const existing = editId ? state.trainers.find((t) => t.id === editId) : undefined
  const [form, setForm] = useState<Trainer>(
    () => existing ?? { id: uid(), name: '', availability: [], maxHours: 8, colors: [], preferredColors: [] },
  )
  const [saved, setSaved] = useState(false)
  const update = (patch: Partial<Trainer>) => setForm((f) => ({ ...f, ...patch }))
  const toggleColor = (field: 'colors' | 'preferredColors', c: BallColor) =>
    update({ [field]: form[field].includes(c) ? form[field].filter((x) => x !== c) : [...form[field], c] })

  if (saved) {
    return (
      <Shell title="Danke! 🎾">
        <p className="text-slate-600">Deine Verfügbarkeit ist gespeichert. Sobald der Plan steht, siehst du hier deine Trainings:</p>
        <a className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white" href={`#/trainer/${form.id}/plan`}>
          Zu meinem Plan
        </a>
      </Shell>
    )
  }

  const submit = () => {
    setState((s) => ({
      ...s,
      trainers: existing ? s.trainers.map((t) => (t.id === form.id ? form : t)) : [...s.trainers, form],
    }))
    setSaved(true)
  }

  return (
    <Shell title={`Trainer-Verfügbarkeit ${state.season.name}`}>
      <Section title="Wer bist du?">
        <Field label="Name">
          <input className="input" value={form.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Maximal Stunden pro Woche">
          <input className="input" type="number" min={1} value={form.maxHours} onChange={(e) => update({ maxHours: Number(e.target.value) })} />
        </Field>
      </Section>
      <Section title="Welche Gruppen übernimmst du?">
        <ColorChips selected={form.colors} onToggle={(c) => toggleColor('colors', c)} />
        <p className="pt-2 text-xs font-medium text-slate-600">Am liebsten:</p>
        <ColorChips selected={form.preferredColors} onToggle={(c) => toggleColor('preferredColors', c)} />
      </Section>
      <Section title="Wann kannst du?">
        <WeekGrid season={state.season} selected={form.availability} onChange={(availability) => update({ availability })} />
      </Section>
      <button
        disabled={!form.name || form.colors.length === 0 || form.availability.length === 0}
        onClick={submit}
        className="mt-8 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:bg-slate-300"
      >
        Speichern
      </button>
    </Shell>
  )
}

function ColorChips({ selected, onToggle }: { selected: BallColor[]; onToggle: (c: BallColor) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {BALL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onToggle(c)}
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1 ${
            selected.includes(c) ? `${COLOR_CLASSES[c].bg} ${COLOR_CLASSES[c].border} ring-2 ring-emerald-500` : 'bg-white ring-slate-200'
          }`}
        >
          <span className={`size-2.5 rounded-full ${COLOR_CLASSES[c].dot}`} />
          {COLOR_LABEL[c]}
        </button>
      ))}
    </div>
  )
}

export function TrainerPlanPage({ trainerId }: { trainerId: string }) {
  const state = useAppState()
  const trainer = state.trainers.find((t) => t.id === trainerId)
  if (!trainer) return <Shell title="Unbekannter Link">Diesen Trainer gibt es nicht.</Shell>
  const groups = (state.plan ?? [])
    .filter((g) => g.trainerId === trainerId)
    .sort((a, b) => {
      const sa = parseSlot(a.slot)
      const sb = parseSlot(b.slot)
      return sa.day - sb.day || sa.hour - sb.hour
    })
  const byDay = new Map<number, typeof groups>()
  for (const g of groups) {
    const { day } = parseSlot(g.slot)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(g)
  }

  return (
    <Shell title={`Hallo ${trainer.name.split(' ')[0]}!`}>
      {!state.plan ? (
        <p className="text-slate-600">Der Plan ist noch nicht fertig.</p>
      ) : (
        <>
          <p className="text-slate-600">
            Deine Trainings im {state.season.name}: <b>{groups.length} Stunden</b> pro Woche.
          </p>
          {[...byDay.entries()].map(([day, list]) => (
            <Section key={day} title={DAY_NAMES_LONG[day]}>
              {list.map((g) => {
                const c = COLOR_CLASSES[g.color]
                return (
                  <div key={g.id} className={`rounded-xl border p-3 ${c.bg} ${c.border}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold tabular-nums">
                        {parseSlot(g.slot).hour}:00–{parseSlot(g.slot).hour + 1}:00
                      </span>
                      <span className={`text-xs font-medium ${c.text}`}>
                        {COLOR_LABEL[g.color]} · Platz {g.court}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {g.memberIds.map((id) => {
                        const p = state.players.find((x) => x.id === id)
                        return p ? (
                          <li key={id} className="flex justify-between">
                            <span>{p.name}</span>
                            <span className="text-slate-500">{p.kind === 'kind' ? `${ageOf(p)} J.` : ''} · {p.contact}</span>
                          </li>
                        ) : null
                      })}
                    </ul>
                  </div>
                )
              })}
            </Section>
          ))}
        </>
      )}
    </Shell>
  )
}
