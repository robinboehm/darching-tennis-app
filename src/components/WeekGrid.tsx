import { DAY_NAMES, seasonHours, slotKey } from '../domain'
import type { Season, SlotKey } from '../types'

interface Props {
  season: Season
  selected: SlotKey[]
  onChange: (next: SlotKey[]) => void
}

/** Tap-to-toggle weekly grid; only shows hours where the club actually has a court. */
export function WeekGrid({ season, selected, onChange }: Props) {
  const days = season.days.filter((d) => seasonHours(season).some((h) => (season.courts[slotKey(d, h)] ?? 0) > 0))
  const hours = seasonHours(season).filter((h) => days.some((d) => (season.courts[slotKey(d, h)] ?? 0) > 0))
  const set = new Set(selected)
  const toggle = (key: SlotKey) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange([...next])
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="w-14" />
            {days.map((d) => (
              <th key={d} className="font-medium text-slate-600">
                {DAY_NAMES[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h}>
              <td className="pr-1 text-right text-xs text-slate-500 tabular-nums">{h}:00</td>
              {days.map((d) => {
                const key = slotKey(d, h)
                const open = (season.courts[key] ?? 0) > 0
                const on = set.has(key)
                return (
                  <td key={d}>
                    <button
                      type="button"
                      disabled={!open}
                      onClick={() => toggle(key)}
                      className={`h-10 w-full rounded-lg text-xs font-medium transition ${
                        !open
                          ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                          : on
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-white text-slate-400 ring-1 ring-slate-200 hover:ring-emerald-400'
                      }`}
                    >
                      {open ? (on ? '✓' : '') : '–'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
