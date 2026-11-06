import { useMemo, useState } from 'react'
import {
  ageOf,
  BALL_COLORS,
  COLOR_CLASSES,
  COLOR_LABEL,
  DAY_NAMES,
  DAY_NAMES_LONG,
  maxGroupSize,
  resolveNames,
  seasonHours,
  slotKey,
  uid,
} from '../domain'
import { navigate } from '../router'
import { analyzePlan, solve } from '../solver'
import { resetDemo, setState, useAppState } from '../store'
import type { AppState, BallColor, Group, Player, SlotKey } from '../types'

type Tab = 'plan' | 'personen' | 'trainer' | 'saison'
const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'personen', label: 'Spieler:innen' },
  { id: 'trainer', label: 'Trainer:innen' },
  { id: 'saison', label: 'Plätze & Zeiten' },
]

export function AdminPage({ tab }: { tab: Tab }) {
  const state = useAppState()
  const signupLink = `${window.location.origin}${window.location.pathname}#/anmelden`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">TC Darching · Jugendwartin</div>
            <div className="font-bold text-slate-900">{state.season.name}</div>
          </div>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={`#/admin/${t.id}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200"
              onClick={() => navigator.clipboard?.writeText(`Hallo zusammen! Bitte tragt bis Sonntag ein, wann eure Kinder Zeit fürs Wintertraining haben: ${signupLink}`)}
              title={signupLink}
            >
              📋 WhatsApp-Nachricht kopieren
            </button>
            <button
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
              onClick={() => confirm('Alle Daten durch die Demodaten ersetzen?') && resetDemo()}
            >
              Demodaten zurücksetzen
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {tab === 'plan' && <PlanTab state={state} />}
        {tab === 'personen' && <PlayersTab state={state} />}
        {tab === 'trainer' && <TrainersTab state={state} />}
        {tab === 'saison' && <SeasonTab state={state} />}
      </main>
    </div>
  )
}

/* ---------------------------------- Plan ---------------------------------- */

type DragData = { type: 'player'; pid: string; from: string | null } | { type: 'group'; gid: string }

const updatePlan = (fn: (plan: Group[]) => Group[]) =>
  setState((s) => ({ ...s, plan: fn((s.plan ?? []).map((g) => ({ ...g, memberIds: [...g.memberIds] }))).filter((g) => g.memberIds.length > 0) }))

function renumberCourts(plan: Group[]) {
  const counts = new Map<SlotKey, number>()
  for (const g of plan) {
    const n = (counts.get(g.slot) ?? 0) + 1
    counts.set(g.slot, n)
    g.court = n
  }
  return plan
}

function PlanTab({ state }: { state: AppState }) {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState<DragData | null>(null)
  const plan = state.plan
  const report = useMemo(() => (plan ? analyzePlan(state, plan) : null), [state, plan])
  const players = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players])
  const lockedCount = plan?.filter((g) => g.locked).length ?? 0

  const run = (keepLocked: boolean) => {
    setBusy(true)
    setTimeout(() => {
      const result = solve(state, keepLocked)
      setState((s) => ({ ...s, plan: result }))
      setBusy(false)
    }, 30)
  }

  const days = state.season.days.filter((d) => seasonHours(state.season).some((h) => (state.season.courts[slotKey(d, h)] ?? 0) > 0))
  const hours = seasonHours(state.season).filter((h) => days.some((d) => (state.season.courts[slotKey(d, h)] ?? 0) > 0))

  const onDrop = (target: { group?: Group; slot?: SlotKey; unassign?: boolean }) => {
    const data = dragging
    setDragging(null)
    if (!data) return
    if (data.type === 'group') {
      if (!target.slot) return
      updatePlan((p) => renumberCourts(p.map((g) => (g.id === data.gid ? { ...g, slot: target.slot! } : g))))
      return
    }
    const player = players.get(data.pid)
    if (!player) return
    if (target.group && target.group.id === data.from) return
    updatePlan((p) => {
      let next = p.map((g) => (g.id === data.from ? { ...g, memberIds: g.memberIds.filter((m) => m !== data.pid) } : g))
      if (target.group) {
        next = next.map((g) => (g.id === target.group!.id ? { ...g, memberIds: [...g.memberIds, data.pid] } : g))
      } else if (target.slot && player.ballColor) {
        const trainer = state.trainers.find(
          (t) =>
            t.availability.includes(target.slot!) &&
            t.colors.includes(player.ballColor!) &&
            !next.some((g) => g.trainerId === t.id && g.slot === target.slot),
        )
        next.push({ id: uid(), slot: target.slot, court: 0, trainerId: trainer?.id ?? null, memberIds: [data.pid], color: player.ballColor })
      }
      return renumberCourts(next.filter((g) => g.memberIds.length > 0))
    })
  }

  const fits = (g: Group | null, slot: SlotKey) => {
    if (!dragging || dragging.type !== 'player') return false
    const p = players.get(dragging.pid)
    if (!p || !p.availability.includes(slot)) return false
    return g ? p.ballColor === g.color && g.memberIds.length < maxGroupSize(g.color) && !g.memberIds.includes(p.id) : true
  }

  const totalSessions = state.players.reduce((n, p) => n + p.sessionsPerWeek, 0)
  const missing = report?.unassigned.reduce((n, u) => n + u.missing, 0) ?? totalSessions
  const issueCount = report ? [...report.groupIssues.values()].flat().filter((i) => !i.startsWith('Kleine')).length + report.trainerIssues.length : 0

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => run(false)}
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Rechne…' : plan ? '✨ Neuen Vorschlag berechnen' : '✨ Vorschlag berechnen'}
          </button>
          {lockedCount > 0 && (
            <button
              onClick={() => run(true)}
              disabled={busy}
              className="rounded-xl bg-white px-4 py-2.5 font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Neu berechnen, {lockedCount} fixierte Gruppen behalten
            </button>
          )}
          {plan && report && (
            <div className="flex flex-wrap gap-2 text-sm">
              <Stat label="Gruppen" value={plan.length} />
              <Stat label="Eingeteilt" value={`${totalSessions - missing}/${totalSessions}`} tone={missing ? 'warn' : 'ok'} />
              <Stat label="Freundeswünsche" value={`${report.friendPairs.satisfied}/${report.friendPairs.total}`} />
              <Stat label="Konflikte" value={issueCount} tone={issueCount ? 'bad' : 'ok'} />
            </div>
          )}
        </div>

        {!plan ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center text-slate-500">
            {state.players.length} Anmeldungen und {state.trainers.length} Trainer:innen sind da. Klick auf „Vorschlag berechnen“.
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500">
              Namen per Drag & Drop in andere Gruppen ziehen, Gruppen über ⠿ in andere Zeiten verschieben. 🔒 fixiert eine Gruppe für die nächste Berechnung.
              Am Namen: Alter·Spielstärke, ♥ Freundeswunsch erfüllt, 🚗 Nachbarort. Maus auf einen Namen zeigt Details.
            </p>
            <div className="overflow-x-auto pb-4">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(210px, 1fr))` }}>
                {days.map((d) => (
                  <div key={d} className="space-y-2">
                    <div className="px-1 text-sm font-semibold text-slate-700">{DAY_NAMES_LONG[d]}</div>
                    {hours
                      .filter((h) => (state.season.courts[slotKey(d, h)] ?? 0) > 0)
                      .map((h) => (
                        <SlotCell key={h} day={d} hour={h} state={state} plan={plan} report={report!} players={players}
                          dragging={dragging} setDragging={setDragging} onDrop={onDrop} fits={fits} />
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {plan && report && (
        <aside className="w-72 shrink-0 space-y-4">
          <div
            className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${dragging?.type === 'player' ? 'ring-2 ring-amber-400' : 'ring-slate-200'}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop({ unassign: true })}
          >
            <h3 className="font-semibold text-slate-900">Nicht eingeteilt ({report.unassigned.length})</h3>
            <p className="text-xs text-slate-500">Hierher ziehen, um jemanden aus einer Gruppe zu nehmen.</p>
            <ul className="mt-3 space-y-2">
              {report.unassigned.map((u) => (
                <li key={u.player.id}>
                  <PlayerChip player={u.player} from={null} setDragging={setDragging} friendHere={false} />
                  <div className="mt-0.5 text-xs text-amber-700">{u.reason}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h3 className="font-semibold text-slate-900">Trainer:innen</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {state.trainers.map((t) => {
                const n = plan.filter((g) => g.trainerId === t.id).length
                return (
                  <li key={t.id} className="flex items-center justify-between">
                    <a className="hover:underline" href={`#/trainer/${t.id}/plan`}>{t.name}</a>
                    <span className={`tabular-nums ${n > t.maxHours ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                      {n}/{t.maxHours} Std.
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-red-700 bg-red-50' : tone === 'warn' ? 'text-amber-800 bg-amber-50' : tone === 'ok' ? 'text-emerald-800 bg-emerald-50' : 'text-slate-700 bg-slate-100'
  return (
    <span className={`rounded-lg px-2.5 py-1 ${color}`}>
      {label}: <b className="tabular-nums">{value}</b>
    </span>
  )
}

interface SlotCellProps {
  day: number
  hour: number
  state: AppState
  plan: Group[]
  report: ReturnType<typeof analyzePlan>
  players: Map<string, Player>
  dragging: DragData | null
  setDragging: (d: DragData | null) => void
  onDrop: (t: { group?: Group; slot?: SlotKey }) => void
  fits: (g: Group | null, slot: SlotKey) => boolean
}

function SlotCell({ day, hour, state, plan, report, players, dragging, setDragging, onDrop, fits }: SlotCellProps) {
  const slot = slotKey(day, hour)
  const courts = state.season.courts[slot] ?? 0
  const groups = plan.filter((g) => g.slot === slot)
  const free = courts - groups.length
  const highlight = dragging && (dragging.type === 'group' || fits(null, slot))
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (e.defaultPrevented) return
        onDrop({ slot })
      }}
      className={`space-y-1.5 rounded-xl p-1.5 ${highlight ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'bg-white/70 ring-1 ring-slate-200'}`}
    >
      <div className="flex items-baseline justify-between px-1">
        <span className="text-xs font-semibold text-slate-600 tabular-nums">{hour}–{hour + 1} Uhr</span>
        <span className={`text-[11px] ${free < 0 ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
          {free < 0 ? `${-free} Platz zu wenig!` : free > 0 ? `${free} von ${courts} frei` : `${courts} Pl. belegt`}
        </span>
      </div>
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} state={state} players={players} issues={report.groupIssues.get(g.id) ?? []}
          setDragging={setDragging} onDrop={onDrop} fits={fits(g, slot)} dragging={dragging} />
      ))}
    </div>
  )
}

function GroupCard({ group, state, players, issues, setDragging, onDrop, fits, dragging }: {
  group: Group
  state: AppState
  players: Map<string, Player>
  issues: string[]
  setDragging: (d: DragData | null) => void
  onDrop: (t: { group?: Group }) => void
  fits: boolean
  dragging: DragData | null
}) {
  const c = COLOR_CLASSES[group.color]
  const friendsHere = (pid: string) => {
    const p = players.get(pid)!
    return resolveNames(p.friendNames, state.players, pid).some((f) => group.memberIds.includes(f))
  }
  const serious = issues.filter((i) => !i.startsWith('Kleine'))
  return (
    <div
      onDragOver={(e) => {
        if (dragging?.type === 'player') e.preventDefault()
      }}
      onDrop={(e) => {
        if (dragging?.type !== 'player') return
        e.preventDefault()
        onDrop({ group })
      }}
      className={`rounded-lg border p-1.5 ${c.bg} ${serious.length ? 'border-red-400 ring-1 ring-red-300' : c.border} ${fits ? 'ring-2 ring-emerald-500' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', group.id)
            setDragging({ type: 'group', gid: group.id })
          }}
          onDragEnd={() => setDragging(null)}
          className="cursor-grab select-none text-slate-400"
          title="Gruppe verschieben"
        >
          ⠿
        </span>
        <span className={`size-2.5 rounded-full ${c.dot}`} />
        <select
          value={group.trainerId ?? ''}
          onChange={(e) => updatePlan((p) => p.map((g) => (g.id === group.id ? { ...g, trainerId: e.target.value || null } : g)))}
          className="min-w-0 flex-1 truncate rounded bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
        >
          <option value="">– kein Trainer –</option>
          {state.trainers.map((t) => {
            const ok = t.availability.includes(group.slot) && t.colors.includes(group.color)
            return (
              <option key={t.id} value={t.id}>
                {t.name}{ok ? '' : ' (passt nicht)'}
              </option>
            )
          })}
        </select>
        <button
          onClick={() => updatePlan((p) => p.map((g) => (g.id === group.id ? { ...g, locked: !g.locked } : g)))}
          className={`text-xs ${group.locked ? '' : 'opacity-30 hover:opacity-70'}`}
          title={group.locked ? 'Fixiert – wird bei Neuberechnung behalten' : 'Fixieren'}
        >
          🔒
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {group.memberIds.map((pid) => {
          const p = players.get(pid)
          return p ? <PlayerChip key={pid} player={p} from={group.id} setDragging={setDragging} friendHere={friendsHere(pid)} /> : null
        })}
      </div>
      {issues.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {issues.map((i) => (
            <li key={i} className={`text-[11px] ${i.startsWith('Kleine') ? 'text-slate-500' : 'font-medium text-red-700'}`}>
              {i.startsWith('Kleine') ? 'ⓘ' : '⚠'} {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PlayerChip({ player, from, setDragging, friendHere }: {
  player: Player
  from: string | null
  setDragging: (d: DragData | null) => void
  friendHere: boolean
}) {
  const details = [
    player.name,
    player.kind === 'kind' ? `${ageOf(player)} Jahre` : 'Erwachsen',
    player.ballColor ? COLOR_LABEL[player.ballColor] : 'nicht eingestuft',
    player.level ? `Stärke ${player.level}` : '',
    player.yearsPlaying != null ? `${player.yearsPlaying} J. dabei` : '',
    player.friendNames ? `Spielt gern mit: ${player.friendNames}` : '',
    player.fromNeighborVillage ? 'Nachbarort' : '',
  ].filter(Boolean)
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData('text/plain', player.id)
        setDragging({ type: 'player', pid: player.id, from })
      }}
      onDragEnd={() => setDragging(null)}
      title={details.join('\n')}
      className="inline-flex cursor-grab items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-xs text-slate-800 shadow-sm ring-1 ring-slate-200 active:cursor-grabbing"
    >
      {player.ballColor && from === null && <span className={`size-2 rounded-full ${COLOR_CLASSES[player.ballColor].dot}`} />}
      {player.name.split(' ')[0]} {player.name.split(' ').slice(-1)[0][0]}.
      <span className="text-slate-400 tabular-nums">
        {player.kind === 'kind' ? ageOf(player) : ''}
        {player.level ? `·${player.level}` : ''}
      </span>
      {friendHere && <span title="Freundeswunsch erfüllt">♥</span>}
      {player.fromNeighborVillage && <span title="Nachbarort">🚗</span>}
    </span>
  )
}

/* -------------------------------- Personen -------------------------------- */

function PlayersTab({ state }: { state: AppState }) {
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [query, setQuery] = useState('')
  const patch = (id: string, p: Partial<Player>) =>
    setState((s) => ({ ...s, players: s.players.map((x) => (x.id === id ? { ...x, ...p } : x)) }))
  const list = state.players
    .filter((p) => !onlyOpen || !p.ballColor || !p.level)
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
  const open = state.players.filter((p) => !p.ballColor || !p.level).length

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Suchen…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="accent-emerald-600" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Nur noch nicht eingestufte ({open})
        </label>
        <span className="ml-auto text-sm text-slate-500">
          {state.players.filter((p) => p.kind === 'kind').length} Kinder · {state.players.filter((p) => p.kind === 'erwachsen').length} Erwachsene
        </span>
        <button onClick={() => navigate('/anmelden')} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
          + Anmeldung (Eltern-Ansicht)
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-2">Alter</th>
              <th className="px-2">Zeiten</th>
              <th className="px-2">Ballfarbe</th>
              <th className="px-2" title="1 = schwächer, 5 = stärker (Bauchgefühl)">Stärke</th>
              <th className="px-2">Jahre dabei</th>
              <th className="px-2">Training/Woche</th>
              <th className="px-2">Spielt gern mit</th>
              <th className="px-2">Geschwister</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((p) => {
              const friendIds = resolveNames(p.friendNames, state.players, p.id)
              const unresolved = p.friendNames.trim() && friendIds.length === 0
              return (
                <tr key={p.id} className={!p.ballColor || !p.level ? 'bg-amber-50/60' : ''}>
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.contact}{p.fromNeighborVillage && ' · 🚗 Nachbarort'}</div>
                  </td>
                  <td className="px-2 tabular-nums">{p.kind === 'kind' ? ageOf(p) : 'Erw.'}</td>
                  <td className="px-2 tabular-nums" title={p.availability.join(', ')}>{p.availability.length}</td>
                  <td className="px-2">
                    <select
                      className={`rounded-md border px-1.5 py-1 text-xs ${p.ballColor ? `${COLOR_CLASSES[p.ballColor].bg} ${COLOR_CLASSES[p.ballColor].border}` : 'border-amber-400 bg-white'}`}
                      value={p.ballColor ?? ''}
                      onChange={(e) => patch(p.id, { ballColor: (e.target.value || null) as BallColor | null })}
                    >
                      <option value="">– wählen –</option>
                      {BALL_COLORS.map((c) => <option key={c} value={c}>{COLOR_LABEL[c]}</option>)}
                    </select>
                  </td>
                  <td className="px-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => patch(p.id, { level: n })}
                          className={`size-6 rounded text-xs ${p.level === n ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-2">
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded-md border border-slate-200 px-1.5 py-1 text-xs"
                      value={p.yearsPlaying ?? ''}
                      onChange={(e) => patch(p.id, { yearsPlaying: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2">
                    <select
                      className="rounded-md border border-slate-200 px-1.5 py-1 text-xs"
                      value={p.sessionsPerWeek}
                      onChange={(e) => patch(p.id, { sessionsPerWeek: Number(e.target.value) as 1 | 2 })}
                    >
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                    </select>
                  </td>
                  <td className="px-2 text-xs">
                    {p.friendNames && (
                      <span className={unresolved ? 'text-amber-700' : 'text-slate-700'} title={unresolved ? 'Name nicht eindeutig gefunden' : ''}>
                        {p.friendNames} {unresolved ? '?' : '✓'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 text-xs text-slate-700">{p.siblingNames}</td>
                  <td className="px-2 text-right whitespace-nowrap">
                    <a className="text-xs text-slate-500 hover:underline" href={`#/anmelden/${p.id}`}>Bearbeiten</a>
                    <button
                      className="ml-2 text-xs text-red-500 hover:underline"
                      onClick={() => confirm(`${p.name} löschen?`) && setState((s) => ({
                        ...s,
                        players: s.players.filter((x) => x.id !== p.id),
                        plan: s.plan?.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== p.id) })).filter((g) => g.memberIds.length) ?? null,
                      }))}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* -------------------------------- Trainer --------------------------------- */

function TrainersTab({ state }: { state: AppState }) {
  const trainerLink = `${window.location.origin}${window.location.pathname}#/trainer-anmelden`
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200"
          onClick={() => navigator.clipboard?.writeText(trainerLink)}
        >
          📋 Link für Trainer:innen kopieren
        </button>
        <a href="#/trainer-anmelden" className="text-sm text-slate-600 hover:underline">Formular öffnen</a>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {state.trainers.map((t) => {
          const hours = state.plan?.filter((g) => g.trainerId === t.id).length ?? 0
          return (
            <div key={t.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="font-semibold text-slate-900">{t.name}</div>
              <div className="mt-1 text-sm text-slate-600">
                Max. {t.maxHours} Std./Woche · verplant: {hours} · {t.availability.length} freie Stunden
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.colors.map((c) => (
                  <span key={c} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${COLOR_CLASSES[c].bg} ${COLOR_CLASSES[c].border}`}>
                    <span className={`size-2 rounded-full ${COLOR_CLASSES[c].dot}`} />
                    {COLOR_LABEL[c]}{t.preferredColors.includes(c) ? ' ★' : ''}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-3 text-sm">
                <a className="text-emerald-700 hover:underline" href={`#/trainer-anmelden/${t.id}`}>Verfügbarkeit</a>
                <a className="text-emerald-700 hover:underline" href={`#/trainer/${t.id}/plan`}>Persönlicher Plan</a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------- Saison --------------------------------- */

function SeasonTab({ state }: { state: AppState }) {
  const { season } = state
  const setCourts = (slot: SlotKey, n: number) =>
    setState((s) => ({ ...s, season: { ...s.season, courts: { ...s.season.courts, [slot]: Math.max(0, n) } } }))

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Saison</span>
          <input className="input" value={season.name} onChange={(e) => setState((s) => ({ ...s, season: { ...s.season, name: e.target.value } }))} />
        </label>
        <p className="text-sm text-slate-500">Wie viele Plätze sind zu welcher Stunde fürs Training frei? Klick erhöht, Rechtsklick verringert.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <table className="border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th />
              {[0, 1, 2, 3, 4, 5, 6].map((d) => <th key={d} className="w-16 font-medium text-slate-600">{DAY_NAMES[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 15 }, (_, i) => 8 + i).map((h) => (
              <tr key={h}>
                <td className="pr-2 text-right text-xs text-slate-500 tabular-nums">{h}:00</td>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const key = slotKey(d, h)
                  const n = season.courts[key] ?? 0
                  return (
                    <td key={d}>
                      <button
                        onClick={() => setCourts(key, (n + 1) % 5)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setCourts(key, n - 1)
                        }}
                        className={`h-8 w-16 rounded-md text-xs font-semibold tabular-nums ${
                          n === 0 ? 'bg-slate-100 text-slate-300' : n === 1 ? 'bg-emerald-100 text-emerald-800' : n === 2 ? 'bg-emerald-300 text-emerald-900' : 'bg-emerald-500 text-white'
                        }`}
                      >
                        {n === 0 ? '–' : `${n} Pl.`}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SeasonRangeSync />
    </div>
  )
}

/** Keeps the season's day/hour range in sync with whatever court cells are filled. */
function SeasonRangeSync() {
  const state = useAppState()
  const slots = Object.entries(state.season.courts).filter(([, n]) => n > 0).map(([k]) => k.split('-').map(Number))
  if (slots.length === 0) return null
  const days = [...new Set(slots.map(([d]) => d))].sort()
  const startHour = Math.min(...slots.map(([, h]) => h))
  const endHour = Math.max(...slots.map(([, h]) => h)) + 1
  const s = state.season
  if (s.startHour !== startHour || s.endHour !== endHour || s.days.join() !== days.join()) {
    queueMicrotask(() => setState((st) => ({ ...st, season: { ...st.season, days, startHour, endHour } })))
  }
  return null
}
