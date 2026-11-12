import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PET_VITALS,
  applyDailyGreeting,
  applyFeeding,
  applyPetting,
  decayPetVitals,
  mergePetVitals,
  normalizePetVitals,
  vitalsIntimacyLevel,
  vitalsMoodLabel,
} from '../src/utils/desktopPetVitals.ts'

const HOUR = 3_600_000

test('养成状态遇到非法数值时回落到默认值', () => {
  const normalized = normalizePetVitals({
    mood: Number.NaN,
    satiety: 'bad' as unknown as number,
    intimacy: Infinity,
  })
  assert.equal(normalized.mood, DEFAULT_PET_VITALS.mood)
  assert.equal(normalized.satiety, DEFAULT_PET_VITALS.satiety)
  assert.equal(normalized.intimacy, DEFAULT_PET_VITALS.intimacy)
  assert.ok(Object.values(normalized).every((item) => item === item))
})

test('时间越久越饿，但亲密度不衰减', () => {
  const now = new Date('2026-11-12T12:00:00').getTime()
  const decayed = decayPetVitals(
    {
      ...DEFAULT_PET_VITALS,
      mood: 100,
      satiety: 100,
      intimacy: 40,
      updatedAt: now - 10 * HOUR,
    },
    now
  )
  assert.equal(decayed.satiety, 89)
  assert.equal(decayed.mood, 97)
  assert.equal(decayed.intimacy, 40)
  assert.equal(decayed.updatedAt, now)
})

test('喂食提升饱腹与心情，并遵守冷却和饱腹上限', () => {
  const now = new Date('2026-11-12T12:00:00').getTime()
  const base = {
    ...DEFAULT_PET_VITALS,
    satiety: 30,
    mood: 50,
    intimacy: 10,
    updatedAt: now,
    lastFedAt: 0,
  }
  const fed = applyFeeding(base, now)
  assert.equal(fed.effect, 'ok')
  assert.equal(fed.vitals.satiety, 60)
  assert.equal(fed.vitals.mood, 62)
  assert.equal(fed.vitals.intimacy, 12)

  const cooling = applyFeeding({ ...fed.vitals, lastFedAt: now - 30_000 }, now)
  assert.equal(cooling.effect, 'cooldown')
  assert.equal(cooling.vitals.satiety, fed.vitals.satiety)

  const full = applyFeeding(
    { ...base, satiety: 96, lastFedAt: 0 },
    now
  )
  assert.equal(full.effect, 'full')
  assert.equal(full.vitals.satiety, 96)
})

test('抚摸增加少量心情与亲密度', () => {
  const now = new Date('2026-11-12T12:00:00').getTime()
  const petted = applyPetting(
    { ...DEFAULT_PET_VITALS, mood: 80, intimacy: 20, updatedAt: now },
    now
  )
  assert.equal(petted.mood, 83)
  assert.equal(petted.intimacy, 21)
})

test('每日问候区分首次、跨日与同一天', () => {
  const first = applyDailyGreeting(
    { ...DEFAULT_PET_VITALS, firstVisitAt: 0 },
    new Date('2026-11-12T09:00:00')
  )
  assert.equal(first.kind, 'first')
  assert.equal(first.vitals.lastGreetingDate, '2026-11-12')
  assert.equal(first.vitals.intimacy, DEFAULT_PET_VITALS.intimacy + 2)

  const sameDay = applyDailyGreeting(
    first.vitals,
    new Date('2026-11-12T20:00:00')
  )
  assert.equal(sameDay.kind, 'none')

  const nextDay = applyDailyGreeting(
    { ...first.vitals, lastGreetingDate: '2026-11-12' },
    new Date('2026-11-13T08:00:00')
  )
  assert.equal(nextDay.kind, 'daily')
  assert.equal(nextDay.vitals.lastGreetingDate, '2026-11-13')
})

test('连续两天访问累加陪伴天数，断档后重置为 1', () => {
  const first = applyDailyGreeting(
    { ...DEFAULT_PET_VITALS, firstVisitAt: 1 },
    new Date('2026-11-12T09:00:00')
  )
  assert.equal(first.vitals.streakDays, 1)

  const nextDay = applyDailyGreeting(
    first.vitals,
    new Date('2026-11-13T09:00:00')
  )
  assert.equal(nextDay.vitals.streakDays, 2)

  const afterGap = applyDailyGreeting(
    nextDay.vitals,
    new Date('2026-11-15T09:00:00')
  )
  assert.equal(afterGap.vitals.streakDays, 1)
})

test('跨设备合并取较高进度并保留更早的首次访问时间', () => {
  const local = normalizePetVitals({
    ...DEFAULT_PET_VITALS,
    mood: 40,
    satiety: 30,
    intimacy: 12,
    streakDays: 2,
    totalInteractions: 8,
    lastVisitDate: '2026-11-12',
    firstVisitAt: 1_000,
  })
  const remote = {
    ...DEFAULT_PET_VITALS,
    mood: 80,
    satiety: 20,
    intimacy: 30,
    streakDays: 5,
    totalInteractions: 3,
    lastVisitDate: '2026-11-10',
    firstVisitAt: 2_000,
  }

  const merged = mergePetVitals(local, remote)
  assert.equal(merged.mood, 80)
  assert.equal(merged.satiety, 30)
  assert.equal(merged.intimacy, 30)
  assert.equal(merged.streakDays, 5)
  assert.equal(merged.totalInteractions, 8)
  assert.equal(merged.lastVisitDate, '2026-11-12')
  assert.equal(merged.firstVisitAt, 1_000)
})

test('心情文案与亲密度等级保持稳定', () => {
  assert.equal(vitalsMoodLabel({ ...DEFAULT_PET_VITALS, satiety: 10 }), '饿扁了')
  assert.equal(vitalsMoodLabel({ ...DEFAULT_PET_VITALS, mood: 90 }), '超开心')
  assert.equal(vitalsIntimacyLevel({ ...DEFAULT_PET_VITALS, intimacy: 0 }), 1)
  assert.equal(vitalsIntimacyLevel({ ...DEFAULT_PET_VITALS, intimacy: 100 }), 5)
})
