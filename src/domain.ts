import type { BallColor, Player, Season, SlotKey } from './types'

export const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const DAY_NAMES_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export const slotKey = (day: number, hour: number): SlotKey => `${day}-${hour}`

export function parseSlot(slot: SlotKey) {
  const [day, hour] = slot.split('-').map(Number)
  return { day, hour }
}

export const formatSlot = (slot: SlotKey) => {
  const { day, hour } = parseSlot(slot)
  return `${DAY_NAMES[day]} ${hour}–${hour + 1} Uhr`
}

export function seasonHours(season: Season) {
  const hours: number[] = []
  for (let h = season.startHour; h < season.endHour; h++) hours.push(h)
  return hours
}

export function openSlots(season: Season): SlotKey[] {
  const result: SlotKey[] = []
  for (const day of season.days) {
    for (const hour of seasonHours(season)) {
      const key = slotKey(day, hour)
      if ((season.courts[key] ?? 0) > 0) result.push(key)
    }
  }
  return result
}

export const BALL_COLORS: BallColor[] = ['rot', 'orange', 'gruen', 'gelb', 'erwachsen']

export const COLOR_LABEL: Record<BallColor, string> = {
  rot: 'Rot',
  orange: 'Orange',
  gruen: 'Grün',
  gelb: 'Gelb',
  erwachsen: 'Erwachsene',
}

export const COLOR_CLASSES: Record<BallColor, { bg: string; border: string; text: string; dot: string }> = {
  rot: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', dot: 'bg-red-500' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', dot: 'bg-orange-500' },
  gruen: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800', dot: 'bg-green-600' },
  gelb: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', dot: 'bg-yellow-400' },
  erwachsen: { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-800', dot: 'bg-slate-500' },
}

export const maxGroupSize = (color: BallColor) => (color === 'rot' ? 6 : 4)
export const minGroupSize = (color: BallColor) => (color === 'erwachsen' ? 2 : 3)

export const CURRENT_YEAR = new Date().getFullYear()
export const ageOf = (p: Player) => CURRENT_YEAR - p.birthYear

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

/** Matches free-text names ("Mia, Paul Huber und Lea") against registered players. */
export function resolveNames(text: string, players: Player[], selfId: string): string[] {
  if (!text.trim()) return []
  const parts = text
    .split(/,|;|\n|\bund\b|&/i)
    .map(normalize)
    .filter(Boolean)
  const ids = new Set<string>()
  for (const part of parts) {
    const others = players.filter((p) => p.id !== selfId)
    const full = others.filter((p) => normalize(p.name) === part)
    if (full.length === 1) {
      ids.add(full[0].id)
      continue
    }
    const first = others.filter((p) => normalize(p.name).split(' ')[0] === part)
    if (first.length === 1) ids.add(first[0].id)
  }
  return [...ids]
}

export const uid = () => Math.random().toString(36).slice(2, 10)
