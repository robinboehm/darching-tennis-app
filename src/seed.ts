import { CURRENT_YEAR, openSlots, parseSlot, slotKey } from './domain'
import type { AppState, BallColor, Player, Season, SlotKey, Trainer } from './types'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST_NAMES = [
  'Mia', 'Emma', 'Hannah', 'Sophia', 'Lea', 'Marie', 'Lina', 'Ella', 'Clara', 'Leni', 'Emilia', 'Anna', 'Lena',
  'Luisa', 'Frieda', 'Maja', 'Theresa', 'Johanna', 'Paula', 'Greta', 'Ida', 'Lotta', 'Amelie', 'Vroni', 'Magdalena',
  'Paul', 'Leon', 'Felix', 'Noah', 'Ben', 'Elias', 'Jonas', 'Luis', 'Maximilian', 'Finn', 'Lukas', 'Moritz', 'Jakob',
  'Anton', 'Valentin', 'Korbinian', 'Simon', 'Benedikt', 'Quirin', 'Vitus', 'Florian', 'Leopold', 'Emil', 'Matteo',
  'Xaver', 'Michael', 'Raphael', 'Tim', 'Julian', 'Samuel', 'Oskar', 'Theo', 'Karl', 'Niklas', 'David',
]
const LAST_NAMES = [
  'Huber', 'Bauer', 'Wagner', 'Maier', 'Schmid', 'Gruber', 'Hofmann', 'Fischer', 'Weber', 'Brunner', 'Mayr',
  'Lechner', 'Moser', 'Steiner', 'Berger', 'Fuchs', 'Winkler', 'Hartl', 'Obermeier', 'Zehetmair', 'Kellner',
  'Riedl', 'Haas', 'Wimmer', 'Lang', 'Pichler', 'Seidl', 'Eder', 'Kraus', 'Strasser', 'Aigner', 'Hinterberger',
]
const ADULT_FIRST = ['Andrea', 'Stefan', 'Claudia', 'Thomas', 'Sabine', 'Markus', 'Petra', 'Christian', 'Martina', 'Wolfgang', 'Birgit', 'Josef']

export function createSeason(): Season {
  const courts: Record<SlotKey, number> = {}
  const set = (day: number, from: number, to: number, n: number) => {
    for (let h = from; h < to; h++) courts[slotKey(day, h)] = n
  }
  set(0, 15, 19, 2)
  set(0, 19, 21, 1)
  set(1, 14, 20, 1)
  set(2, 14, 18, 2)
  set(2, 18, 21, 1)
  set(3, 15, 20, 1)
  set(4, 14, 18, 2)
  set(5, 9, 13, 3)
  return { name: 'Winter 2026/27', days: [0, 1, 2, 3, 4, 5], startHour: 9, endHour: 21, courts }
}

function colorForAge(age: number, r: () => number): BallColor {
  const shift = r() < 0.2 ? (r() < 0.5 ? -1 : 1) : 0
  const base = age <= 7 ? 0 : age <= 9 ? 1 : age <= 11 ? 2 : 3
  const colors: BallColor[] = ['rot', 'orange', 'gruen', 'gelb']
  return colors[Math.max(0, Math.min(3, base + shift))]
}

function pickAvailability(slots: SlotKey[], r: () => number, isAdult: boolean): SlotKey[] {
  const byDay = new Map<number, SlotKey[]>()
  for (const s of slots) {
    const { day, hour } = parseSlot(s)
    if (isAdult ? hour < 17 && day < 5 : hour >= 19) continue
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(s)
  }
  const days = [...byDay.keys()].sort(() => r() - 0.5)
  const dayCount = 2 + Math.floor(r() * 3)
  const result: SlotKey[] = []
  for (const day of days.slice(0, dayCount)) {
    const daySlots = byDay.get(day)!
    const len = Math.min(daySlots.length, 1 + Math.floor(r() * 3))
    const start = Math.floor(r() * (daySlots.length - len + 1))
    result.push(...daySlots.slice(start, start + len))
  }
  return result
}

export function createDemoState(): AppState {
  const r = rng(42)
  const season = createSeason()
  const slots = openSlots(season)
  const players: Player[] = []
  let n = 0
  const id = () => `p${++n}`

  const familyNames = [...LAST_NAMES]
  const usedFirst = new Set<string>()
  const pickFirst = () => {
    for (let i = 0; i < 100; i++) {
      const f = FIRST_NAMES[Math.floor(r() * FIRST_NAMES.length)]
      if (!usedFirst.has(f) || i > 50) {
        usedFirst.add(f)
        return f
      }
    }
    return 'Kim'
  }

  while (players.filter((p) => p.kind === 'kind').length < 80) {
    const last = familyNames[Math.floor(r() * familyNames.length)]
    const childCount = r() < 0.18 ? 2 : 1
    const neighbor = r() < 0.15
    const family: Player[] = []
    for (let c = 0; c < childCount; c++) {
      const birthYear = CURRENT_YEAR - (5 + Math.floor(r() * 12))
      const age = CURRENT_YEAR - birthYear
      const color = colorForAge(age, r)
      family.push({
        id: id(),
        name: `${pickFirst()} ${last}`,
        birthYear,
        kind: 'kind',
        contact: `+49 171 ${Math.floor(1000000 + r() * 8999999)}`,
        availability: pickAvailability(slots, r, false),
        friendNames: '',
        siblingNames: '',
        fromNeighborVillage: neighbor,
        ballColor: color,
        level: 1 + Math.floor(r() * 5),
        yearsPlaying: Math.max(0, Math.min(age - 4, Math.floor(r() * 6))),
        sessionsPerWeek: color === 'gelb' && r() < 0.35 ? 2 : 1,
      })
    }
    if (family.length === 2) {
      family[0].siblingNames = family[1].name
      family[1].siblingNames = family[0].name
      // Families driving in from neighbouring villages need overlapping days to make back-to-back slots possible.
      if (neighbor) family[1].availability = [...new Set([...family[1].availability, ...family[0].availability])]
    }
    players.push(...family)
  }

  for (const p of players) {
    if (r() < 0.6) {
      const sameColor = players.filter((o) => o.id !== p.id && o.ballColor === p.ballColor)
      const friend = sameColor[Math.floor(r() * sameColor.length)]
      if (friend) p.friendNames = friend.name
    }
  }

  for (const first of ADULT_FIRST) {
    const last = LAST_NAMES[Math.floor(r() * LAST_NAMES.length)]
    players.push({
      id: id(),
      name: `${first} ${last}`,
      birthYear: CURRENT_YEAR - (30 + Math.floor(r() * 30)),
      kind: 'erwachsen',
      contact: `${first.toLowerCase()}@example.de`,
      availability: pickAvailability(slots, r, true),
      friendNames: '',
      siblingNames: '',
      fromNeighborVillage: false,
      ballColor: 'erwachsen',
      level: 1 + Math.floor(r() * 5),
      yearsPlaying: Math.floor(r() * 20),
      sessionsPerWeek: 1,
    })
  }

  // A few fresh sign-ups that the Jugendwartin still has to classify.
  for (const p of players.filter((p) => p.kind === 'kind').slice(-3)) {
    p.ballColor = null
    p.level = null
    p.yearsPlaying = null
  }

  const trainerAvail = (filter: (day: number, hour: number) => boolean) =>
    slots.filter((s) => {
      const { day, hour } = parseSlot(s)
      return filter(day, hour)
    })

  const trainers: Trainer[] = [
    {
      id: 't1',
      name: 'Anna Kellner',
      availability: trainerAvail((d) => d !== 3),
      maxHours: 12,
      colors: ['rot', 'orange', 'gruen', 'gelb', 'erwachsen'],
      preferredColors: ['gelb'],
    },
    {
      id: 't2',
      name: 'Markus Riedl',
      availability: trainerAvail((d, h) => (d === 1 || d === 3 || d === 4 || d === 0) && h >= 16),
      maxHours: 9,
      colors: ['gruen', 'gelb', 'erwachsen'],
      preferredColors: ['erwachsen'],
    },
    {
      id: 't3',
      name: 'Lena Hartl',
      availability: trainerAvail((d, h) => (d === 0 || d === 2 || d === 4 || d === 5) && h < 18),
      maxHours: 10,
      colors: ['rot', 'orange'],
      preferredColors: ['rot'],
    },
    {
      id: 't4',
      name: 'Tobias Eder',
      availability: trainerAvail((d) => d === 1 || d === 2 || d === 3 || d === 5),
      maxHours: 8,
      colors: ['orange', 'gruen', 'gelb'],
      preferredColors: ['gruen'],
    },
  ]

  return { season, players, trainers, plan: null }
}
