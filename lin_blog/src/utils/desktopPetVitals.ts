export interface PetVitals {
  mood: number
  satiety: number
  intimacy: number
  lastFedAt: number
  lastGreetingDate: string
  firstVisitAt: number
  updatedAt: number
}

const STORAGE_KEY = 'LINBLOG_DESKTOP_PET_VITALS'
const FEED_COOLDOWN_MS = 60_000

export const DEFAULT_PET_VITALS: PetVitals = {
  mood: 70,
  satiety: 60,
  intimacy: 10,
  lastFedAt: 0,
  lastGreetingDate: '',
  firstVisitAt: 0,
  updatedAt: 0
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value))

const roundStat = (value: number): number => Math.round(clamp(value))

const statOr = (value: unknown, fallback: number): number => {
  const number = Number(value)
  return Number.isFinite(number) ? roundStat(number) : fallback
}

export function normalizePetVitals(
  value?: Partial<PetVitals> | null
): PetVitals {
  const raw = value || {}
  return {
    mood: statOr(raw.mood, DEFAULT_PET_VITALS.mood),
    satiety: statOr(raw.satiety, DEFAULT_PET_VITALS.satiety),
    intimacy: statOr(raw.intimacy, DEFAULT_PET_VITALS.intimacy),
    lastFedAt: Number.isFinite(Number(raw.lastFedAt))
      ? Math.max(0, Number(raw.lastFedAt))
      : 0,
    lastGreetingDate:
      typeof raw.lastGreetingDate === 'string' ? raw.lastGreetingDate : '',
    firstVisitAt: Number.isFinite(Number(raw.firstVisitAt))
      ? Math.max(0, Number(raw.firstVisitAt))
      : 0,
    updatedAt: Number.isFinite(Number(raw.updatedAt))
      ? Math.max(0, Number(raw.updatedAt))
      : 0
  }
}

/** 时间越久越饿、心情越平淡；亲密度不衰减，避免长期不访问直接清零 */
export function decayPetVitals(
  value: PetVitals,
  now = Date.now()
): PetVitals {
  const vitals = normalizePetVitals(value)
  if (!vitals.updatedAt) {
    return { ...vitals, updatedAt: now }
  }
  const hours = Math.max(0, (now - vitals.updatedAt) / 3_600_000)
  if (hours < 0.05) return vitals
  return {
    ...vitals,
    mood: roundStat(vitals.mood - hours * 0.35),
    satiety: roundStat(vitals.satiety - hours * 1.1),
    updatedAt: now
  }
}

export function getPetVitals(now = Date.now()): PetVitals {
  let stored: Partial<PetVitals> | null = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) stored = JSON.parse(raw) as Partial<PetVitals>
  } catch {
    stored = null
  }
  const vitals = decayPetVitals(
    normalizePetVitals(stored || DEFAULT_PET_VITALS),
    now
  )
  setPetVitals(vitals)
  return vitals
}

export function setPetVitals(vitals: PetVitals): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vitals))
  } catch {
    // 忽略持久化失败
  }
}

export interface FeedResult {
  vitals: PetVitals
  effect: 'ok' | 'full' | 'cooldown'
}

export function applyFeeding(vitals: PetVitals, now = Date.now()): FeedResult {
  const current = decayPetVitals(vitals, now)
  if (now - current.lastFedAt < FEED_COOLDOWN_MS) {
    return { vitals: current, effect: 'cooldown' }
  }
  if (current.satiety >= 95) {
    return {
      vitals: { ...current, lastFedAt: now, updatedAt: now },
      effect: 'full'
    }
  }
  return {
    vitals: {
      ...current,
      satiety: roundStat(current.satiety + 30),
      mood: roundStat(current.mood + 12),
      intimacy: roundStat(current.intimacy + 2),
      lastFedAt: now,
      updatedAt: now
    },
    effect: 'ok'
  }
}

export function applyPetting(vitals: PetVitals, now = Date.now()): PetVitals {
  const current = decayPetVitals(vitals, now)
  return {
    ...current,
    mood: roundStat(current.mood + 3),
    intimacy: roundStat(current.intimacy + 0.5),
    updatedAt: now
  }
}

export type GreetingKind = 'first' | 'daily' | 'none'

export function applyDailyGreeting(
  vitals: PetVitals,
  now = new Date()
): { vitals: PetVitals; kind: GreetingKind } {
  const timestamp = now.getTime()
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')
  const current = decayPetVitals(vitals, timestamp)
  if (!current.firstVisitAt) {
    return {
      kind: 'first',
      vitals: {
        ...current,
        firstVisitAt: timestamp,
        lastGreetingDate: today,
        intimacy: roundStat(current.intimacy + 2),
        updatedAt: timestamp
      }
    }
  }
  if (current.lastGreetingDate !== today) {
    return {
      kind: 'daily',
      vitals: {
        ...current,
        lastGreetingDate: today,
        intimacy: roundStat(current.intimacy + 1),
        updatedAt: timestamp
      }
    }
  }
  return { kind: 'none', vitals: current }
}

export function vitalsMoodLabel(vitals: PetVitals): string {
  if (vitals.satiety < 20) return '饿扁了'
  if (vitals.mood < 25) return '有点低落'
  if (vitals.mood > 80) return '超开心'
  return '还不错'
}

export function vitalsIntimacyLevel(vitals: PetVitals): number {
  return Math.min(5, Math.floor(vitals.intimacy / 20) + 1)
}

