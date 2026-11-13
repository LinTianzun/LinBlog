export type PetAchievementKind = 'streak' | 'interaction'
export type DailyPetTaskKey = 'feed' | 'publish' | 'comment'

export interface DailyPetTasks {
  date: string
  progress: Record<DailyPetTaskKey, number>
  rewarded: DailyPetTaskKey[]
}

export interface PetDailyTaskDefinition {
  key: DailyPetTaskKey
  label: string
  description: string
  icon: string
  reward: {
    mood: number
    intimacy: number
  }
}

export interface PetVitals {
  name: string
  mood: number
  satiety: number
  intimacy: number
  streakDays: number
  lastVisitDate: string
  totalInteractions: number
  lastFedAt: number
  lastGreetingDate: string
  firstVisitAt: number
  unlockedAchievements: string[]
  celebratedAchievements: string[]
  dailyTasks: DailyPetTasks
  stateVersion: number
  updatedAt: number
}

const STORAGE_KEY = 'LINBLOG_DESKTOP_PET_VITALS'
const LEGACY_OWNER_KEY = `${STORAGE_KEY}:legacy-owner`
const FEED_COOLDOWN_MS = 60_000

const readStorage = (key: string): string | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: string): void => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // 忽略持久化失败
  }
}

const readCurrentUserId = (): number => {
  if (!readStorage('token')) return 0
  try {
    const raw = readStorage('userInfo')
    if (!raw) return 0
    const id = Number((JSON.parse(raw) as { id?: number }).id)
    return Number.isSafeInteger(id) && id > 0 ? id : 0
  } catch {
    return 0
  }
}

const userStorageKey = (userId: number): string => `${STORAGE_KEY}:u${userId}`

/** 老版本只有一份全局存档：只迁移给第一个登录账号，避免后续账号继承 */
const migrateLegacyVitals = (userId: number): void => {
  const scopedKey = userStorageKey(userId)
  if (readStorage(scopedKey)) return
  const owner = Number(readStorage(LEGACY_OWNER_KEY)) || 0
  if (owner && owner !== userId) return
  const legacy = readStorage(STORAGE_KEY)
  if (!legacy) return
  writeStorage(scopedKey, legacy)
  if (!owner) writeStorage(LEGACY_OWNER_KEY, String(userId))
}

const currentStorageKey = (): string => {
  const userId = readCurrentUserId()
  if (!userId) return STORAGE_KEY
  migrateLegacyVitals(userId)
  return userStorageKey(userId)
}

const dateKey = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')

const toDayNumber = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

export const PET_DAILY_TASK_DEFINITIONS: readonly PetDailyTaskDefinition[] = [
  {
    key: 'feed',
    label: '喂它一次',
    description: '准备一份小零食，让它今天也元气满满。',
    icon: '🍚',
    reward: { mood: 8, intimacy: 1 }
  },
  {
    key: 'publish',
    label: '发布一篇内容',
    description: '发布文章或图库，它会为你放一场小烟花。',
    icon: '🎉',
    reward: { mood: 10, intimacy: 3 }
  },
  {
    key: 'comment',
    label: '留下一句评论',
    description: '在文章、图库或随笔下留下一次真诚回应。',
    icon: '💬',
    reward: { mood: 6, intimacy: 2 }
  }
]

const DAILY_TASK_KEYS = PET_DAILY_TASK_DEFINITIONS.map((task) => task.key)
const ACHIEVEMENT_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,31}:\d{1,6}$/
const STREAK_TARGETS = [3, 7, 14, 30, 60, 100, 365]
const INTERACTION_TARGETS = [10, 50, 100, 300, 500, 1000, 5000]

const createEmptyDailyTasks = (date = ''): DailyPetTasks => ({
  date,
  progress: { feed: 0, publish: 0, comment: 0 },
  rewarded: []
})

export const achievementKey = (
  kind: PetAchievementKind,
  target: number
): string => `${kind}:${target}`

export function achievementLabel(key: string): string {
  const [kind, rawTarget] = key.split(':')
  const target = Number(rawTarget)
  if (!Number.isSafeInteger(target) || target <= 0) return key
  if (kind === 'streak') return `连续陪伴 ${target} 天`
  if (kind === 'interaction') return `累计互动 ${target} 次`
  return key
}

/** 当前进度够得着的成就；即使旧存档没有 unlocked 字段也能正确展示 */
export function eligibleAchievementKeys(vitals: PetVitals): string[] {
  const result: string[] = []
  for (const target of STREAK_TARGETS) {
    if (vitals.streakDays >= target) {
      result.push(achievementKey('streak', target))
    }
  }
  for (const target of INTERACTION_TARGETS) {
    if (vitals.totalInteractions >= target) {
      result.push(achievementKey('interaction', target))
    }
  }
  return result
}

export function unlockEligibleAchievements(vitals: PetVitals): PetVitals {
  const unlocked = new Set(vitals.unlockedAchievements)
  for (const key of eligibleAchievementKeys(vitals)) unlocked.add(key)
  if (unlocked.size === vitals.unlockedAchievements.length) return vitals
  return {
    ...vitals,
    unlockedAchievements: [...unlocked]
  }
}

export function markAchievementsCelebrated(
  vitals: PetVitals,
  keys: readonly string[],
  now = Date.now()
): PetVitals {
  const unlocked = new Set(vitals.unlockedAchievements)
  const celebrated = new Set(vitals.celebratedAchievements)
  let changed = false
  for (const key of keys) {
    if (!unlocked.has(key) || celebrated.has(key)) continue
    celebrated.add(key)
    changed = true
  }
  if (!changed) return vitals
  return {
    ...vitals,
    celebratedAchievements: [...celebrated],
    updatedAt: now
  }
}

export const DEFAULT_PET_VITALS: PetVitals = {
  name: '',
  mood: 70,
  satiety: 60,
  intimacy: 10,
  streakDays: 0,
  lastVisitDate: '',
  totalInteractions: 0,
  lastFedAt: 0,
  lastGreetingDate: '',
  firstVisitAt: 0,
  unlockedAchievements: [],
  celebratedAchievements: [],
  dailyTasks: createEmptyDailyTasks(),
  stateVersion: 0,
  updatedAt: 0
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value))

const roundStat = (value: number): number => Math.round(clamp(value))

const statOr = (value: unknown, fallback: number): number => {
  const number = Number(value)
  return Number.isFinite(number) ? roundStat(number) : fallback
}

const intOr = (value: unknown, fallback: number, max = 1_000_000_000): number => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(0, Math.round(number)))
}

const isDateKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const uniqueStringList = (
  value: unknown,
  pattern: RegExp,
  max = 80
): string[] => {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const key = item.trim()
    if (!pattern.test(key) || seen.has(key)) continue
    seen.add(key)
    result.push(key)
    if (result.length >= max) break
  }
  return result
}

export function normalizeDailyTasks(
  value?: Partial<DailyPetTasks> | null,
  fallbackDate = ''
): DailyPetTasks {
  const raw = value && typeof value === 'object' ? value : {}
  const hasDate = isDateKey(raw.date)
  const date = hasDate ? raw.date : isDateKey(fallbackDate) ? fallbackDate : ''
  if (!date) return createEmptyDailyTasks()

  const rawProgress =
    raw.progress && typeof raw.progress === 'object' ? raw.progress : null
  const progress = {
    feed: hasDate ? intOr(rawProgress?.feed, 0, 1) : 0,
    publish: hasDate ? intOr(rawProgress?.publish, 0, 1) : 0,
    comment: hasDate ? intOr(rawProgress?.comment, 0, 1) : 0
  }
  const rewarded = hasDate
    ? uniqueStringList(raw.rewarded, /^(feed|publish|comment)$/).filter(
        (key): key is DailyPetTaskKey =>
          DAILY_TASK_KEYS.includes(key as DailyPetTaskKey) &&
          progress[key as DailyPetTaskKey] >= 1
      )
    : []

  return { date, progress, rewarded }
}

export function normalizePetVitals(
  value?: Partial<PetVitals> | null
): PetVitals {
  const raw = value || {}
  return {
    name:
      typeof raw.name === 'string'
        ? raw.name.trim().replace(/\s+/g, ' ').slice(0, 16)
        : '',
    mood: statOr(raw.mood, DEFAULT_PET_VITALS.mood),
    satiety: statOr(raw.satiety, DEFAULT_PET_VITALS.satiety),
    intimacy: statOr(raw.intimacy, DEFAULT_PET_VITALS.intimacy),
    streakDays: intOr(raw.streakDays, DEFAULT_PET_VITALS.streakDays, 36_500),
    lastVisitDate:
      typeof raw.lastVisitDate === 'string' ? raw.lastVisitDate : '',
    totalInteractions: intOr(
      raw.totalInteractions,
      DEFAULT_PET_VITALS.totalInteractions
    ),
    lastFedAt: Number.isFinite(Number(raw.lastFedAt))
      ? Math.max(0, Number(raw.lastFedAt))
      : 0,
    lastGreetingDate:
      typeof raw.lastGreetingDate === 'string' ? raw.lastGreetingDate : '',
    firstVisitAt: Number.isFinite(Number(raw.firstVisitAt))
      ? Math.max(0, Number(raw.firstVisitAt))
      : 0,
    unlockedAchievements: uniqueStringList(
      raw.unlockedAchievements,
      ACHIEVEMENT_KEY_PATTERN
    ),
    celebratedAchievements: uniqueStringList(
      raw.celebratedAchievements,
      ACHIEVEMENT_KEY_PATTERN
    ),
    dailyTasks: normalizeDailyTasks(raw.dailyTasks),
    stateVersion: intOr(
      raw.stateVersion,
      DEFAULT_PET_VITALS.stateVersion,
      Number.MAX_SAFE_INTEGER
    ),
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

/** 每日任务按本地日期重置；跨天时旧进度与领取记录一起清空 */
export function withTodayDailyTasks(
  vitals: PetVitals,
  now = Date.now()
): PetVitals {
  const today = dateKey(new Date(now))
  const tasks = normalizeDailyTasks(vitals.dailyTasks, today)
  if (tasks.date === today) return { ...vitals, dailyTasks: tasks }
  return { ...vitals, dailyTasks: createEmptyDailyTasks(today) }
}

function finalizePetVitals(
  vitals: PetVitals,
  now: number,
  decay = false
): PetVitals {
  const base = decay ? decayPetVitals(vitals, now) : normalizePetVitals(vitals)
  const hadAchievementState =
    base.unlockedAchievements.length > 0 ||
    base.celebratedAchievements.length > 0
  const settled = unlockEligibleAchievements(withTodayDailyTasks(base, now))
  if (
    !hadAchievementState &&
    settled.unlockedAchievements.length > 0
  ) {
    // 老存档升级：历史已达成的目标静默视为已庆祝，避免一次性冒出满屏红点
    return {
      ...settled,
      celebratedAchievements: [...settled.unlockedAchievements]
    }
  }
  return settled
}

export function getPetVitals(now = Date.now()): PetVitals {
  let stored: Partial<PetVitals> | null = null
  try {
    const raw = readStorage(currentStorageKey())
    if (raw) stored = JSON.parse(raw) as Partial<PetVitals>
  } catch {
    stored = null
  }
  const vitals = finalizePetVitals(
    normalizePetVitals(stored || DEFAULT_PET_VITALS),
    now,
    true
  )
  writeStorage(currentStorageKey(), JSON.stringify(vitals))
  return vitals
}

export function setPetVitals(vitals: PetVitals): void {
  writeStorage(
    currentStorageKey(),
    JSON.stringify(finalizePetVitals(normalizePetVitals(vitals), Date.now()))
  )
}

export interface FeedResult {
  vitals: PetVitals
  effect: 'ok' | 'full' | 'cooldown'
}

export function applyFeeding(vitals: PetVitals, now = Date.now()): FeedResult {
  const current = finalizePetVitals(vitals, now, true)
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
      totalInteractions: current.totalInteractions + 1,
      lastFedAt: now,
      updatedAt: now
    },
    effect: 'ok'
  }
}

export function applyPetting(vitals: PetVitals, now = Date.now()): PetVitals {
  const current = finalizePetVitals(vitals, now, true)
  return {
    ...current,
    mood: roundStat(current.mood + 3),
    intimacy: roundStat(current.intimacy + 0.5),
    totalInteractions: current.totalInteractions + 1,
    updatedAt: now
  }
}

export type GreetingKind = 'first' | 'daily' | 'none'

export function applyDailyGreeting(
  vitals: PetVitals,
  now = new Date()
): { vitals: PetVitals; kind: GreetingKind } {
  const timestamp = now.getTime()
  const today = dateKey(now)
  const current = finalizePetVitals(vitals, timestamp, true)
  if (!current.firstVisitAt) {
    return {
      kind: 'first',
      vitals: {
        ...current,
        firstVisitAt: timestamp,
        lastGreetingDate: today,
        lastVisitDate: today,
        streakDays: Math.max(1, current.streakDays),
        intimacy: roundStat(current.intimacy + 2),
        updatedAt: timestamp
      }
    }
  }
  if (current.lastGreetingDate !== today) {
    const todayNumber = toDayNumber(today)
    const lastVisitNumber = toDayNumber(current.lastVisitDate)
    let streakDays = Math.max(1, current.streakDays)
    if (todayNumber === null || lastVisitNumber === null) {
      streakDays = 1
    } else {
      const gap = todayNumber - lastVisitNumber
      if (gap === 1) streakDays += 1
      else if (gap > 1) streakDays = 1
    }
    return {
      kind: 'daily',
      vitals: {
        ...current,
        lastGreetingDate: today,
        lastVisitDate: today,
        streakDays,
        intimacy: roundStat(current.intimacy + 1),
        updatedAt: timestamp
      }
    }
  }
  return {
    kind: 'none',
    vitals: {
      ...current,
      lastVisitDate: current.lastVisitDate || today,
      streakDays: Math.max(1, current.streakDays)
    }
  }
}

const laterDate = (a: string, b: string): string => (a > b ? a : b)

export function mergeDailyPetTasks(
  local: DailyPetTasks,
  remote: DailyPetTasks
): DailyPetTasks {
  const a = normalizeDailyTasks(local)
  const b = normalizeDailyTasks(remote)
  if (!a.date) return b
  if (!b.date) return a
  if (a.date > b.date) return a
  if (b.date > a.date) return b

  const progress = {
    feed: Math.max(a.progress.feed, b.progress.feed),
    publish: Math.max(a.progress.publish, b.progress.publish),
    comment: Math.max(a.progress.comment, b.progress.comment)
  }
  const rewarded = [
    ...new Set([...a.rewarded, ...b.rewarded])
  ].filter((key) => progress[key] >= 1)
  return { date: a.date, progress, rewarded }
}

/** 跨设备合并：取两端更高的养成进度，亲密度与连续天数不会倒退 */
export function mergePetVitals(
  local: PetVitals,
  remote: Partial<PetVitals>,
  now = Date.now()
): PetVitals {
  const a = normalizePetVitals(local)
  const b = normalizePetVitals(remote)
  if (a.stateVersion !== b.stateVersion) {
    return finalizePetVitals(
      a.stateVersion > b.stateVersion ? a : b,
      now
    )
  }
  const newer = b.updatedAt >= a.updatedAt ? b : a
  const older = newer === a ? b : a
  return finalizePetVitals({
    name: newer.name || older.name,
    mood: Math.max(a.mood, b.mood),
    satiety: Math.max(a.satiety, b.satiety),
    intimacy: Math.max(a.intimacy, b.intimacy),
    streakDays: Math.max(a.streakDays, b.streakDays),
    lastVisitDate: laterDate(a.lastVisitDate, b.lastVisitDate),
    totalInteractions: Math.max(a.totalInteractions, b.totalInteractions),
    lastFedAt: Math.max(a.lastFedAt, b.lastFedAt),
    lastGreetingDate: laterDate(a.lastGreetingDate, b.lastGreetingDate),
    firstVisitAt:
      a.firstVisitAt && b.firstVisitAt
        ? Math.min(a.firstVisitAt, b.firstVisitAt)
        : a.firstVisitAt || b.firstVisitAt,
    unlockedAchievements: [
      ...new Set([...a.unlockedAchievements, ...b.unlockedAchievements])
    ],
    celebratedAchievements: [
      ...new Set([...a.celebratedAchievements, ...b.celebratedAchievements])
    ],
    dailyTasks: mergeDailyPetTasks(a.dailyTasks, b.dailyTasks),
    stateVersion: a.stateVersion,
    updatedAt: Math.max(a.updatedAt, b.updatedAt)
  }, now)
}

/** 重新养一只：清空名字、成长、成就与任务，并用更高版本阻止旧设备回灌 */
export function resetPetVitals(
  vitals: PetVitals,
  now = Date.now()
): PetVitals {
  const current = normalizePetVitals(vitals)
  return finalizePetVitals(
    {
      ...DEFAULT_PET_VITALS,
      stateVersion: Math.max(now, current.stateVersion + 1),
      updatedAt: now
    },
    now
  )
}

export function petDailyTaskDefinition(
  key: DailyPetTaskKey
): PetDailyTaskDefinition | null {
  return PET_DAILY_TASK_DEFINITIONS.find((task) => task.key === key) || null
}

export interface DailyTaskResult {
  vitals: PetVitals
  task: PetDailyTaskDefinition | null
  completedNow: boolean
  alreadyCompleted: boolean
}

/** 记录一次业务事件；同一天同一任务只发一次奖励 */
export function recordDailyTask(
  vitals: PetVitals,
  key: DailyPetTaskKey,
  now = Date.now()
): DailyTaskResult {
  const current = finalizePetVitals(vitals, now)
  const task = petDailyTaskDefinition(key)
  if (!task) {
    return {
      vitals: current,
      task: null,
      completedNow: false,
      alreadyCompleted: false
    }
  }
  if (current.dailyTasks.progress[key] >= 1) {
    return {
      vitals: current,
      task,
      completedNow: false,
      alreadyCompleted: true
    }
  }

  const alreadyRewarded = current.dailyTasks.rewarded.includes(key)
  const nextTasks: DailyPetTasks = {
    ...current.dailyTasks,
    progress: { ...current.dailyTasks.progress, [key]: 1 },
    rewarded: alreadyRewarded
      ? current.dailyTasks.rewarded
      : [...current.dailyTasks.rewarded, key]
  }
  let next: PetVitals = { ...current, dailyTasks: nextTasks }
  if (!alreadyRewarded) {
    next = {
      ...next,
      mood: roundStat(next.mood + task.reward.mood),
      intimacy: roundStat(next.intimacy + task.reward.intimacy),
      updatedAt: now
    }
  }
  return {
    vitals: unlockEligibleAchievements(next),
    task,
    completedNow: true,
    alreadyCompleted: false
  }
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

/** 陪伴称号：连续天数为主，累计互动与亲密度作为辅助 */
export function vitalsCompanionTitle(vitals: PetVitals): string {
  const stage = Math.max(
    vitals.streakDays,
    Math.floor(vitals.totalInteractions / 20),
    Math.floor(vitals.intimacy / 20)
  )
  if (stage >= 60) return '灵魂伙伴'
  if (stage >= 30) return '形影不离'
  if (stage >= 14) return '默契搭档'
  if (stage >= 7) return '熟悉的朋友'
  if (stage >= 3) return '常来串门'
  return '初来乍到'
}

export interface PetMilestone {
  kind: 'streak' | 'interaction'
  label: string
  current: number
  target: number
  remaining: number
}

export interface PetMilestoneProgress extends PetMilestone {
  key: string
  unlocked: boolean
  achieved: boolean
  celebrated: boolean
  isNew: boolean
}

export interface PetMilestoneGroup {
  kind: PetMilestone['kind']
  label: string
  items: PetMilestoneProgress[]
}

/** 成就墙：按目标类型分组，已完成的排在前面 */
export function vitalsMilestoneWall(
  vitals: PetVitals
): PetMilestoneGroup[] {
  const unlockedKeys = new Set([
    ...vitals.unlockedAchievements,
    ...eligibleAchievementKeys(vitals)
  ])
  const celebratedKeys = new Set(vitals.celebratedAchievements)
  const build = (
    kind: PetMilestone['kind'],
    label: string,
    targets: readonly number[],
    current: number
  ): PetMilestoneProgress[] =>
    targets.map((target) => {
      const key = achievementKey(kind, target)
      const unlocked = unlockedKeys.has(key)
      return {
        key,
        kind,
        label,
        current: Math.min(current, target),
        target,
        remaining: Math.max(0, target - current),
        unlocked,
        achieved: unlocked,
        celebrated: celebratedKeys.has(key),
        isNew: unlocked && !celebratedKeys.has(key)
      }
    })

  return [
    {
      kind: 'streak',
      label: '连续陪伴',
      items: build('streak', '连续陪伴', STREAK_TARGETS, vitals.streakDays)
    },
    {
      kind: 'interaction',
      label: '累计互动',
      items: build(
        'interaction',
        '累计互动',
        INTERACTION_TARGETS,
        vitals.totalInteractions
      )
    }
  ]
}

/** 取距离完成比例最近的下一个目标，全部完成后返回 null */
export function vitalsNextMilestone(vitals: PetVitals): PetMilestone | null {
  const candidates: PetMilestone[] = []
  const unlocked = new Set([
    ...vitals.unlockedAchievements,
    ...eligibleAchievementKeys(vitals)
  ])
  const streakTarget = STREAK_TARGETS.find(
    (target) =>
      vitals.streakDays < target &&
      !unlocked.has(achievementKey('streak', target))
  )
  if (streakTarget) {
    candidates.push({
      kind: 'streak',
      label: '连续陪伴',
      current: vitals.streakDays,
      target: streakTarget,
      remaining: streakTarget - vitals.streakDays
    })
  }
  const interactionTarget = INTERACTION_TARGETS.find(
    (target) =>
      vitals.totalInteractions < target &&
      !unlocked.has(achievementKey('interaction', target))
  )
  if (interactionTarget) {
    candidates.push({
      kind: 'interaction',
      label: '累计互动',
      current: vitals.totalInteractions,
      target: interactionTarget,
      remaining: interactionTarget - vitals.totalInteractions
    })
  }
  if (!candidates.length) return null
  return candidates.sort(
    (left, right) =>
      left.remaining / left.target - right.remaining / right.target
  )[0]
}

