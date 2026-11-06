import { ageOf, maxGroupSize, minGroupSize, parseSlot, resolveNames, uid } from './domain'
import type { AppState, BallColor, Group, Player, SlotKey, Trainer } from './types'

interface Context {
  state: AppState
  players: Map<string, Player>
  trainers: Map<string, Trainer>
  avail: Map<string, Set<SlotKey>>
  trainerAvail: Map<string, Set<SlotKey>>
  friends: Map<string, Set<string>>
  siblings: Map<string, Set<string>>
  need: Map<string, number>
}

export function buildContext(state: AppState): Context {
  const players = new Map(state.players.map((p) => [p.id, p]))
  const friends = new Map<string, Set<string>>()
  const siblings = new Map<string, Set<string>>()
  for (const p of state.players) {
    friends.set(p.id, new Set(resolveNames(p.friendNames, state.players, p.id)))
    if (!siblings.has(p.id)) siblings.set(p.id, new Set())
    for (const s of resolveNames(p.siblingNames, state.players, p.id)) {
      siblings.get(p.id)!.add(s)
      if (!siblings.has(s)) siblings.set(s, new Set())
      siblings.get(s)!.add(p.id)
    }
  }
  const open = (slot: SlotKey) => (state.season.courts[slot] ?? 0) > 0
  return {
    state,
    players,
    trainers: new Map(state.trainers.map((t) => [t.id, t])),
    avail: new Map(state.players.map((p) => [p.id, new Set(p.availability.filter(open))])),
    trainerAvail: new Map(state.trainers.map((t) => [t.id, new Set(t.availability)])),
    friends,
    siblings,
    need: new Map(
      state.players.filter((p) => p.ballColor && p.availability.length > 0).map((p) => [p.id, p.sessionsPerWeek]),
    ),
  }
}

const cloneGroups = (groups: Group[]) => groups.map((g) => ({ ...g, memberIds: [...g.memberIds] }))

function scorePlan(ctx: Context, groups: Group[]): number {
  let score = 0
  const playerGroups = new Map<string, Group[]>()
  const trainerDays = new Map<string, Map<number, number[]>>()

  for (const g of groups) {
    const size = g.memberIds.length
    if (size === 0) continue
    score -= 20
    const min = minGroupSize(g.color)
    if (size < min) score -= 35 * (min - size)
    const members = g.memberIds.map((id) => ctx.players.get(id)!)
    const levels = members.map((m) => m.level ?? 3)
    const ages = members.map(ageOf)
    const years = members.map((m) => m.yearsPlaying ?? 0)
    score -= 12 * (Math.max(...levels) - Math.min(...levels))
    score -= 3 * Math.max(0, Math.max(...ages) - Math.min(...ages) - 2)
    score -= 2 * Math.max(0, Math.max(...years) - Math.min(...years) - 3)
    for (const m of g.memberIds) {
      const f = ctx.friends.get(m)
      if (f) for (const other of g.memberIds) if (f.has(other)) score += 8
      if (!playerGroups.has(m)) playerGroups.set(m, [])
      playerGroups.get(m)!.push(g)
    }
    if (g.trainerId) {
      const t = ctx.trainers.get(g.trainerId)
      if (t?.preferredColors.includes(g.color)) score += 4
      const { day, hour } = parseSlot(g.slot)
      if (!trainerDays.has(g.trainerId)) trainerDays.set(g.trainerId, new Map())
      const days = trainerDays.get(g.trainerId)!
      if (!days.has(day)) days.set(day, [])
      days.get(day)!.push(hour)
    }
  }

  for (const [pid, need] of ctx.need) {
    score -= 300 * Math.max(0, need - (playerGroups.get(pid)?.length ?? 0))
  }

  for (const [pid, sibs] of ctx.siblings) {
    const p = ctx.players.get(pid)
    if (!p?.fromNeighborVillage) continue
    for (const sid of sibs) {
      if (sid < pid || !ctx.need.has(sid) || !ctx.need.has(pid)) continue
      let best = -20
      for (const a of playerGroups.get(pid) ?? []) {
        for (const b of playerGroups.get(sid) ?? []) {
          const sa = parseSlot(a.slot)
          const sb = parseSlot(b.slot)
          if (sa.day !== sb.day) continue
          const dh = Math.abs(sa.hour - sb.hour)
          best = Math.max(best, dh <= 1 ? 25 : dh === 2 ? 5 : best)
        }
      }
      score += best
    }
  }

  for (const days of trainerDays.values()) {
    for (const hours of days.values()) {
      const span = Math.max(...hours) - Math.min(...hours) + 1
      score -= 6 * (span - new Set(hours).size)
    }
  }
  return score
}

function sameDayConflict(groups: Group[], pid: string, slot: SlotKey, excludeGroupId?: string) {
  const day = parseSlot(slot).day
  return groups.some((g) => g.id !== excludeGroupId && g.memberIds.includes(pid) && parseSlot(g.slot).day === day)
}

function canJoin(ctx: Context, groups: Group[], g: Group, pid: string) {
  const p = ctx.players.get(pid)!
  if (p.ballColor !== g.color) return false
  if (!ctx.avail.get(pid)!.has(g.slot)) return false
  if (g.memberIds.length >= maxGroupSize(g.color)) return false
  if (g.memberIds.includes(pid)) return false
  const sibs = ctx.siblings.get(pid)
  if (sibs && g.memberIds.some((m) => sibs.has(m))) return false
  return !sameDayConflict(groups, pid, g.slot, g.id)
}

function courtFree(ctx: Context, groups: Group[], slot: SlotKey, excludeGroupId?: string) {
  const used = groups.filter((g) => g.slot === slot && g.id !== excludeGroupId && g.memberIds.length > 0).length
  return used < (ctx.state.season.courts[slot] ?? 0)
}

function trainerOk(ctx: Context, groups: Group[], tid: string, slot: SlotKey, color: BallColor, excludeGroupId?: string) {
  const t = ctx.trainers.get(tid)!
  if (!ctx.trainerAvail.get(tid)!.has(slot) || !t.colors.includes(color)) return false
  let hours = 0
  for (const g of groups) {
    if (g.id === excludeGroupId || g.trainerId !== tid || g.memberIds.length === 0) continue
    if (g.slot === slot) return false
    hours++
  }
  return hours < t.maxHours
}

function bestTrainer(ctx: Context, groups: Group[], slot: SlotKey, color: BallColor, excludeGroupId?: string) {
  const { day, hour } = parseSlot(slot)
  let best: string | null = null
  let bestScore = -Infinity
  for (const t of ctx.state.trainers) {
    if (!trainerOk(ctx, groups, t.id, slot, color, excludeGroupId)) continue
    let s = t.preferredColors.includes(color) ? 3 : 0
    for (const g of groups) {
      if (g.trainerId !== t.id || g.id === excludeGroupId) continue
      const o = parseSlot(g.slot)
      if (o.day === day && Math.abs(o.hour - hour) === 1) s += 5
    }
    s -= groups.filter((g) => g.trainerId === t.id).length / t.maxHours
    if (s > bestScore) {
      bestScore = s
      best = t.id
    }
  }
  return best
}

function newGroupOptions(ctx: Context, groups: Group[], pid: string): Group[] {
  const p = ctx.players.get(pid)!
  const options: Group[] = []
  for (const slot of ctx.avail.get(pid)!) {
    if (!courtFree(ctx, groups, slot) || sameDayConflict(groups, pid, slot)) continue
    const trainerId = bestTrainer(ctx, groups, slot, p.ballColor!)
    if (trainerId) options.push({ id: uid(), slot, court: 0, trainerId, memberIds: [pid], color: p.ballColor! })
  }
  return options
}

const assignedCount = (groups: Group[], pid: string) => groups.filter((g) => g.memberIds.includes(pid)).length

function greedy(ctx: Context, initial: Group[]): Group[] {
  let groups = cloneGroups(initial)
  const sessions: string[] = []
  for (const [pid, need] of ctx.need) for (let i = 0; i < need; i++) sessions.push(pid)
  sessions.sort((a, b) => ctx.avail.get(a)!.size - ctx.avail.get(b)!.size || Math.random() - 0.5)

  for (const pid of sessions) {
    if (assignedCount(groups, pid) >= ctx.need.get(pid)!) continue
    let best: Group[] | null = null
    let bestScore = -Infinity
    const consider = (candidate: Group[]) => {
      const s = scorePlan(ctx, candidate)
      if (s > bestScore) {
        bestScore = s
        best = candidate
      }
    }
    for (const g of groups) {
      if (g.locked || !canJoin(ctx, groups, g, pid)) continue
      const next = cloneGroups(groups)
      next.find((x) => x.id === g.id)!.memberIds.push(pid)
      consider(next)
    }
    for (const option of newGroupOptions(ctx, groups, pid)) consider([...cloneGroups(groups), option])
    if (best) groups = best
  }
  return groups
}

const pick = <T,>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)]

function mutate(ctx: Context, groups: Group[]): Group[] | null {
  const next = cloneGroups(groups)
  const movable = next.filter((g) => !g.locked && g.memberIds.length > 0)
  const g = pick(movable)
  if (!g) return null
  const r = Math.random()

  if (r < 0.4) {
    const pid = pick(g.memberIds)!
    g.memberIds = g.memberIds.filter((m) => m !== pid)
    const targets = next.filter((o) => o.id !== g.id && !o.locked && canJoin(ctx, next, o, pid))
    if (targets.length > 0 && Math.random() < 0.75) {
      pick(targets)!.memberIds.push(pid)
    } else {
      const option = pick(newGroupOptions(ctx, next, pid))
      if (!option) return null
      next.push(option)
    }
  } else if (r < 0.65) {
    const other = pick(movable.filter((o) => o.id !== g.id && o.color === g.color))
    if (!other) return null
    const a = pick(g.memberIds)!
    const b = pick(other.memberIds)!
    g.memberIds = g.memberIds.filter((m) => m !== a)
    other.memberIds = other.memberIds.filter((m) => m !== b)
    if (!canJoin(ctx, next, g, b) || !canJoin(ctx, next, other, a)) return null
    g.memberIds.push(b)
    other.memberIds.push(a)
  } else if (r < 0.8) {
    const slots = [...ctx.avail.get(g.memberIds[0])!].filter(
      (s) =>
        s !== g.slot &&
        g.memberIds.every((m) => ctx.avail.get(m)!.has(s) && !sameDayConflict(next, m, s, g.id)) &&
        courtFree(ctx, next, s, g.id),
    )
    const slot = pick(slots)
    if (!slot) return null
    const keep = g.trainerId && trainerOk(ctx, next, g.trainerId, slot, g.color, g.id)
    const trainerId = keep ? g.trainerId : bestTrainer(ctx, next, slot, g.color, g.id)
    if (!trainerId) return null
    g.slot = slot
    g.trainerId = trainerId
  } else if (r < 0.9) {
    const options = ctx.state.trainers.filter(
      (t) => t.id !== g.trainerId && trainerOk(ctx, next, t.id, g.slot, g.color, g.id),
    )
    const t = pick(options)
    if (!t) return null
    g.trainerId = t.id
  } else {
    const members = [...g.memberIds]
    g.memberIds = []
    for (const pid of members) {
      const target = pick(next.filter((o) => o.id !== g.id && !o.locked && canJoin(ctx, next, o, pid)))
      if (!target) return null
      target.memberIds.push(pid)
    }
  }
  return next.filter((x) => x.memberIds.length > 0)
}

function anneal(ctx: Context, start: Group[], iterations: number): Group[] {
  let cur = start
  let curScore = scorePlan(ctx, cur)
  let best = cur
  let bestScore = curScore
  const t0 = 30
  const t1 = 0.3
  for (let i = 0; i < iterations; i++) {
    const temp = t0 * Math.pow(t1 / t0, i / iterations)
    const next = mutate(ctx, cur)
    if (!next) continue
    const s = scorePlan(ctx, next)
    if (s >= curScore || Math.random() < Math.exp((s - curScore) / temp)) {
      cur = next
      curScore = s
      if (s > bestScore) {
        best = next
        bestScore = s
      }
    }
  }
  return best
}

function numberCourts(groups: Group[]) {
  const bySlot = new Map<SlotKey, Group[]>()
  for (const g of groups) {
    if (!bySlot.has(g.slot)) bySlot.set(g.slot, [])
    bySlot.get(g.slot)!.push(g)
  }
  for (const list of bySlot.values()) list.forEach((g, i) => (g.court = i + 1))
  return groups
}

export function solve(state: AppState, keepLocked: boolean, iterations = 30000): Group[] {
  const ctx = buildContext(state)
  const locked = keepLocked
    ? (state.plan ?? [])
        .filter((g) => g.locked)
        .map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => ctx.players.has(m)) }))
    : []
  let best: Group[] = []
  let bestScore = -Infinity
  for (let run = 0; run < 3; run++) {
    const result = anneal(ctx, greedy(ctx, locked), iterations)
    const s = scorePlan(ctx, result)
    if (s > bestScore) {
      bestScore = s
      best = result
    }
  }
  return numberCourts(best)
}

export interface PlanReport {
  groupIssues: Map<string, string[]>
  unassigned: { player: Player; reason: string; missing: number }[]
  trainerIssues: string[]
  friendPairs: { satisfied: number; total: number }
}

export function analyzePlan(state: AppState, groups: Group[]): PlanReport {
  const ctx = buildContext(state)
  const groupIssues = new Map<string, string[]>()
  const add = (gid: string, msg: string) => {
    if (!groupIssues.has(gid)) groupIssues.set(gid, [])
    groupIssues.get(gid)!.push(msg)
  }
  const firstName = (id: string) => ctx.players.get(id)?.name.split(' ')[0] ?? '?'

  for (const g of groups) {
    for (const m of g.memberIds) {
      const p = ctx.players.get(m)
      if (!p) continue
      if (p.ballColor !== g.color) add(g.id, `${firstName(m)} hat andere Ballfarbe`)
      if (!ctx.avail.get(m)!.has(g.slot)) add(g.id, `${firstName(m)} kann zu dieser Zeit nicht`)
      if (sameDayConflict(groups, m, g.slot, g.id)) add(g.id, `${firstName(m)} hat am selben Tag schon Training`)
      const sibs = ctx.siblings.get(m)
      for (const o of g.memberIds) if (o > m && sibs?.has(o)) add(g.id, `Geschwister ${firstName(m)} & ${firstName(o)} zusammen`)
    }
    if (g.memberIds.length > maxGroupSize(g.color)) add(g.id, `Zu voll (max. ${maxGroupSize(g.color)})`)
    if (g.memberIds.length < minGroupSize(g.color)) add(g.id, `Kleine Gruppe (${g.memberIds.length})`)
    if (!g.trainerId) add(g.id, 'Kein Trainer')
    else {
      const t = ctx.trainers.get(g.trainerId)
      if (t && !ctx.trainerAvail.get(t.id)!.has(g.slot)) add(g.id, `${t.name.split(' ')[0]} kann zu dieser Zeit nicht`)
      if (t && !t.colors.includes(g.color)) add(g.id, `${t.name.split(' ')[0]} trainiert diese Stufe nicht`)
      if (groups.some((o) => o.id !== g.id && o.trainerId === g.trainerId && o.slot === g.slot))
        add(g.id, `${t?.name.split(' ')[0]} ist doppelt gebucht`)
    }
    const atSlot = groups.filter((o) => o.slot === g.slot).length
    if (atSlot > (state.season.courts[g.slot] ?? 0)) add(g.id, `Nur ${state.season.courts[g.slot] ?? 0} Platz/Plätze frei`)
  }

  const trainerIssues: string[] = []
  for (const t of state.trainers) {
    const hours = groups.filter((g) => g.trainerId === t.id).length
    if (hours > t.maxHours) trainerIssues.push(`${t.name}: ${hours} Std. (max. ${t.maxHours})`)
  }

  const unassigned: PlanReport['unassigned'] = []
  for (const p of state.players) {
    const have = assignedCount(groups, p.id)
    const missing = p.sessionsPerWeek - have
    if (missing <= 0) continue
    const reason = !p.ballColor
      ? 'Noch nicht eingestuft'
      : p.availability.length === 0
        ? 'Keine Zeiten angegeben'
        : `Keine passende Gruppe in ${p.availability.length} möglichen Zeiten`
    unassigned.push({ player: p, reason, missing })
  }

  let satisfied = 0
  let total = 0
  for (const [pid, fs] of ctx.friends) {
    for (const f of fs) {
      total++
      if (groups.some((g) => g.memberIds.includes(pid) && g.memberIds.includes(f))) satisfied++
    }
  }

  return { groupIssues, unassigned, trainerIssues, friendPairs: { satisfied, total } }
}