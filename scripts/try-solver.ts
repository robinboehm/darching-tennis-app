import { createDemoState } from '../src/seed'
import { analyzePlan, solve } from '../src/solver'

const state = createDemoState()
const started = performance.now()
const plan = solve(state, false)
const ms = Math.round(performance.now() - started)
const report = analyzePlan(state, plan)

const sessions = state.players.reduce((n, p) => n + p.sessionsPerWeek, 0)
console.log(`Personen: ${state.players.length}, Einheiten gewünscht: ${sessions}`)
console.log(`Gruppen: ${plan.length} in ${ms} ms`)
console.log(`Größen:`, plan.map((g) => g.memberIds.length).sort().join(','))
console.log(`Nicht eingeteilt: ${report.unassigned.length}`)
for (const u of report.unassigned) console.log(`  ${u.player.name}: ${u.reason}`)
console.log(`Freundeswünsche erfüllt: ${report.friendPairs.satisfied}/${report.friendPairs.total}`)
console.log(`Gruppen mit Hinweisen: ${[...report.groupIssues.values()].flat().join(' | ')}`)
console.log(`Trainer:`, state.trainers.map((t) => `${t.name} ${plan.filter((g) => g.trainerId === t.id).length}/${t.maxHours}`).join(', '))
