export type SlotKey = string

export type BallColor = 'rot' | 'orange' | 'gruen' | 'gelb' | 'erwachsen'

export interface Player {
  id: string
  name: string
  birthYear: number
  kind: 'kind' | 'erwachsen'
  contact: string
  availability: SlotKey[]
  friendNames: string
  siblingNames: string
  fromNeighborVillage: boolean
  ballColor: BallColor | null
  level: number | null
  yearsPlaying: number | null
  sessionsPerWeek: 1 | 2
}

export interface Trainer {
  id: string
  name: string
  availability: SlotKey[]
  maxHours: number
  colors: BallColor[]
  preferredColors: BallColor[]
}

export interface Season {
  name: string
  days: number[]
  startHour: number
  endHour: number
  courts: Record<SlotKey, number>
}

export interface Group {
  id: string
  slot: SlotKey
  court: number
  trainerId: string | null
  memberIds: string[]
  color: BallColor
  locked?: boolean
}

export interface AppState {
  season: Season
  players: Player[]
  trainers: Trainer[]
  plan: Group[] | null
}
