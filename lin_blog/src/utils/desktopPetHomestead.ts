export type HomesteadCropId = 'radish' | 'tomato' | 'corn' | 'strawberry'
export type HomesteadProduceItemId = 'egg' | 'milk'
export type HomesteadAnimalId = 'chicken' | 'cow'
export type HomesteadItemId =
  | HomesteadCropId
  | HomesteadProduceItemId
  | 'fish'
  | 'fertilizer'

export interface HomesteadCropDefinition {
  id: HomesteadCropId
  name: string
  icon: string
  growMs: number
  yield: number
}

export interface HomesteadAnimalDefinition {
  id: HomesteadAnimalId
  name: string
  icon: string
  produceItem: HomesteadProduceItemId
  produceName: string
  produceIcon: string
  produceMs: number
  manureMs: number
}

export interface HomesteadItemDefinition {
  id: HomesteadItemId
  name: string
  icon: string
}

export interface HomesteadPlotState {
  cropId: HomesteadCropId | null
  plantedAt: number
  wateredAt: number
  fertilizedAt: number
}

export interface HomesteadAnimalState {
  lastProduceAt: number
  lastManureAt: number
}

export interface HomesteadTotals {
  harvests: number
  eggs: number
  milk: number
  fish: number
  manure: number
}

export type HomesteadAchievementMetric = keyof HomesteadTotals | 'products'

export interface HomesteadAchievementDefinition {
  id: string
  name: string
  description: string
  icon: string
  metric: HomesteadAchievementMetric
  target: number
  reward: number
}

export interface HomesteadAchievementProgress
  extends HomesteadAchievementDefinition {
  current: number
  unlocked: boolean
  claimed: boolean
  percent: number
}

export interface HomesteadAutoHelpState {
  enabled: boolean
  lastAt: number
  day: string
  count: number
  total: number
}

export type HomesteadOrderItemId = Exclude<HomesteadItemId, 'fertilizer'>

export interface HomesteadOrderRequirement {
  itemId: HomesteadOrderItemId
  count: number
}

export interface HomesteadOrderState {
  id: string
  requirements: HomesteadOrderRequirement[]
  reward: number
  completedAt: number
}

export type HomesteadDecorationId =
  | 'lantern'
  | 'birdhouse'
  | 'bench'
  | 'fountain'
  | 'pumpkin'
  | 'kite'

export interface HomesteadDecorationDefinition {
  id: HomesteadDecorationId
  name: string
  icon: string
  price: number
  description: string
}

export interface HomesteadUpgradeDefinition {
  level: number
  price: number
}

export interface HomesteadState {
  plots: HomesteadPlotState[]
  plotCount: number
  animals: Record<HomesteadAnimalId, HomesteadAnimalState>
  lastFishedAt: number
  inventory: Record<HomesteadItemId, number>
  coins: number
  experience: number
  seedStock: Record<HomesteadCropId, number>
  ordersDay: string
  orders: HomesteadOrderState[]
  claimedAchievements: string[]
  totals: HomesteadTotals
  autoHelp: HomesteadAutoHelpState
  barnLevel: number
  pondLevel: number
  decorations: HomesteadDecorationId[]
  /** 小院独立版本号，重置后递增，阻止旧设备把进度合回来 */
  stateVersion: number
  updatedAt: number
}

export const HOMESTEAD_PLOT_COUNT = 8
export const HOMESTEAD_MAX_PLOT_COUNT = 12
export const HOMESTEAD_BARN_MAX_LEVEL = 3
export const HOMESTEAD_POND_MAX_LEVEL = 3
export const HOMESTEAD_FISH_COOLDOWN_MS = 3 * 60_000
export const HOMESTEAD_WATER_BONUS_RATE = 0.2
export const HOMESTEAD_FERTILIZER_BONUS_RATE = 0.2
export const HOMESTEAD_STARTING_COINS = 80
export const HOMESTEAD_ORDER_COUNT = 3
export const HOMESTEAD_MAX_EXPERIENCE = 9_999_999
export const HOMESTEAD_EXPERIENCE_REWARDS = {
  water: 2,
  fertilize: 3,
  harvest: 12,
  produce: 7,
  manure: 4,
  fish: 10,
  order: 25
} as const

export interface HomesteadLevelDefinition {
  level: number
  title: string
  experience: number
}

export const HOMESTEAD_LEVELS: readonly HomesteadLevelDefinition[] = [
  { level: 1, title: '小院新丁', experience: 0 },
  { level: 2, title: '见习农夫', experience: 120 },
  { level: 3, title: '勤劳园丁', experience: 320 },
  { level: 4, title: '小院管家', experience: 680 },
  { level: 5, title: '种植能手', experience: 1_200 },
  { level: 6, title: '养殖达人', experience: 1_900 },
  { level: 7, title: '钓鱼行家', experience: 2_800 },
  { level: 8, title: '四季丰收', experience: 4_000 },
  { level: 9, title: '金牌农场主', experience: 5_500 },
  { level: 10, title: '传奇庄园主', experience: 7_500 }
]

export interface HomesteadLevelProgress {
  level: number
  title: string
  experience: number
  currentLevelXp: number
  nextLevelXp: number
  remaining: number
  percent: number
  isMax: boolean
}

export function homesteadLevelProgress(
  experience: number
): HomesteadLevelProgress {
  const xp = Math.min(
    HOMESTEAD_MAX_EXPERIENCE,
    Math.max(0, Math.round(Number(experience) || 0))
  )
  let index = 0
  for (let cursor = 0; cursor < HOMESTEAD_LEVELS.length; cursor++) {
    if (HOMESTEAD_LEVELS[cursor].experience > xp) break
    index = cursor
  }
  const current = HOMESTEAD_LEVELS[index]
  const next = HOMESTEAD_LEVELS[index + 1] || null
  return {
    level: current.level,
    title: current.title,
    experience: xp,
    currentLevelXp: current.experience,
    nextLevelXp: next?.experience ?? current.experience,
    remaining: next ? Math.max(0, next.experience - xp) : 0,
    percent: next
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((xp - current.experience) /
                Math.max(1, next.experience - current.experience)) *
                100
            )
          )
        )
      : 100,
    isMax: !next
  }
}
export const HOMESTEAD_SEED_PACKS: Record<
  HomesteadCropId,
  { price: number; count: number }
> = {
  radish: { price: 12, count: 3 },
  tomato: { price: 21, count: 3 },
  corn: { price: 33, count: 3 },
  strawberry: { price: 45, count: 3 }
}
export const HOMESTEAD_FERTILIZER_PACK = { price: 24, count: 2 } as const
export const HOMESTEAD_PLOT_EXPANSIONS: readonly {
  plotCount: number
  price: number
}[] = [
  { plotCount: 9, price: 900 },
  { plotCount: 10, price: 1250 },
  { plotCount: 11, price: 1650 },
  { plotCount: 12, price: 2150 }
]
export const HOMESTEAD_BARN_UPGRADES: readonly HomesteadUpgradeDefinition[] = [
  { level: 2, price: 300 },
  { level: 3, price: 720 }
]
export const HOMESTEAD_POND_UPGRADES: readonly HomesteadUpgradeDefinition[] = [
  { level: 2, price: 260 },
  { level: 3, price: 600 }
]
export const HOMESTEAD_DECORATIONS: readonly HomesteadDecorationDefinition[] =
  [
    {
      id: 'lantern',
      name: '门前灯笼',
      icon: '🏮',
      price: 90,
      description: '在院子里挂一盏暖光灯笼。'
    },
    {
      id: 'birdhouse',
      name: '小鸟屋',
      icon: '🐦',
      price: 140,
      description: '给路过的小鸟准备一个落脚点。'
    },
    {
      id: 'bench',
      name: '木长椅',
      icon: '🪑',
      price: 180,
      description: '忙完农活，坐下来歇一会儿。'
    },
    {
      id: 'fountain',
      name: '石艺喷泉',
      icon: '⛲',
      price: 320,
      description: '让院子多一点清凉的水声。'
    },
    {
      id: 'pumpkin',
      name: '南瓜角',
      icon: '🎃',
      price: 120,
      description: '一小片金灿灿的南瓜装饰。'
    },
    {
      id: 'kite',
      name: '风筝',
      icon: '🪁',
      price: 100,
      description: '天气好的时候，它会在院子上空飘。'
    }
  ]

export function homesteadBarnSpeedMultiplier(
  level: number,
  weatherId?: HomesteadWeatherId
): number {
  const normalized = Math.min(
    HOMESTEAD_BARN_MAX_LEVEL,
    Math.max(1, Math.round(Number(level) || 1))
  )
  const base = 1 - (normalized - 1) * 0.15
  const weatherMultiplier = weatherId
    ? homesteadWeatherEffect(weatherId).animalProduceMultiplier
    : 1
  return base / weatherMultiplier
}

export function homesteadPondCooldownMs(
  state: Pick<HomesteadState, 'pondLevel'>,
  weatherId?: HomesteadWeatherId
): number {
  const normalized = Math.min(
    HOMESTEAD_POND_MAX_LEVEL,
    Math.max(1, Math.round(Number(state.pondLevel) || 1))
  )
  const base = HOMESTEAD_FISH_COOLDOWN_MS * (1 - (normalized - 1) * 0.2)
  const weatherMultiplier = weatherId
    ? homesteadWeatherEffect(weatherId).pondCooldownMultiplier
    : 1
  return Math.round(base * weatherMultiplier)
}

export const HOMESTEAD_ACHIEVEMENTS: readonly HomesteadAchievementDefinition[] =
  [
    {
      id: 'first-harvest',
      name: '第一捧收成',
      description: '从菜地里收获 1 次作物。',
      icon: '🌱',
      metric: 'harvests',
      target: 1,
      reward: 20
    },
    {
      id: 'diligent-farmer',
      name: '勤劳农夫',
      description: '累计收获 25 次作物。',
      icon: '🌾',
      metric: 'harvests',
      target: 25,
      reward: 80
    },
    {
      id: 'egg-basket',
      name: '鸡蛋满筐',
      description: '累计捡到 20 个鸡蛋。',
      icon: '🥚',
      metric: 'eggs',
      target: 20,
      reward: 50
    },
    {
      id: 'milk-free',
      name: '牛奶自由',
      description: '累计挤取 20 份牛奶。',
      icon: '🥛',
      metric: 'milk',
      target: 20,
      reward: 50
    },
    {
      id: 'fishing-expert',
      name: '钓鱼达人',
      description: '累计钓到 20 条鱼。',
      icon: '🎣',
      metric: 'fish',
      target: 20,
      reward: 50
    },
    {
      id: 'clean-yard',
      name: '清洁能手',
      description: '累计清理 15 份粪便。',
      icon: '🧹',
      metric: 'manure',
      target: 15,
      reward: 40
    },
    {
      id: 'all-round-farmer',
      name: '全能农场主',
      description: '小院累计产出 100 份劳动成果。',
      icon: '🏆',
      metric: 'products',
      target: 100,
      reward: 150
    }
  ]

export function homesteadAchievementCurrent(
  state: HomesteadState,
  metric: HomesteadAchievementMetric
): number {
  if (metric === 'products') {
    return (
      state.totals.harvests +
      state.totals.eggs +
      state.totals.milk +
      state.totals.fish +
      state.totals.manure
    )
  }
  return state.totals[metric]
}

export function homesteadAchievements(
  state: HomesteadState
): HomesteadAchievementProgress[] {
  const claimed = new Set(state.claimedAchievements)
  return HOMESTEAD_ACHIEVEMENTS.map((achievement) => {
    const current = homesteadAchievementCurrent(state, achievement.metric)
    return {
      ...achievement,
      current,
      unlocked: current >= achievement.target,
      claimed: claimed.has(achievement.id),
      percent: Math.min(
        100,
        Math.round((current / Math.max(1, achievement.target)) * 100)
      )
    }
  })
}

export type HomesteadAchievementClaimReason =
  | 'ok'
  | 'unknown'
  | 'locked'
  | 'claimed'

export interface HomesteadAchievementClaimResult {
  state: HomesteadState
  achievement: HomesteadAchievementProgress | null
  changed: boolean
  reason: HomesteadAchievementClaimReason
}

export function claimHomesteadAchievement(
  state: HomesteadState,
  achievementId: string,
  now = Date.now()
): HomesteadAchievementClaimResult {
  const achievement =
    homesteadAchievements(state).find((item) => item.id === achievementId) ||
    null
  if (!achievement) {
    return { state, achievement: null, changed: false, reason: 'unknown' }
  }
  if (!achievement.unlocked) {
    return { state, achievement, changed: false, reason: 'locked' }
  }
  if (achievement.claimed) {
    return { state, achievement, changed: false, reason: 'claimed' }
  }
  return {
    state: {
      ...state,
      coins: state.coins + achievement.reward,
      claimedAchievements: [...state.claimedAchievements, achievement.id],
      updatedAt: now
    },
    achievement: { ...achievement, claimed: true },
    changed: true,
    reason: 'ok'
  }
}

export const HOMESTEAD_CROPS: readonly HomesteadCropDefinition[] = [
  {
    id: 'radish',
    name: '胡萝卜',
    icon: '🥕',
    growMs: 5 * 60_000,
    yield: 2
  },
  {
    id: 'tomato',
    name: '番茄',
    icon: '🍅',
    growMs: 10 * 60_000,
    yield: 2
  },
  {
    id: 'corn',
    name: '玉米',
    icon: '🌽',
    growMs: 15 * 60_000,
    yield: 3
  },
  {
    id: 'strawberry',
    name: '草莓',
    icon: '🍓',
    growMs: 20 * 60_000,
    yield: 2
  }
]

export const HOMESTEAD_ANIMALS: Record<
  HomesteadAnimalId,
  HomesteadAnimalDefinition
> = {
  chicken: {
    id: 'chicken',
    name: '母鸡',
    icon: '🐔',
    produceItem: 'egg',
    produceName: '鸡蛋',
    produceIcon: '🥚',
    produceMs: 8 * 60_000,
    manureMs: 6 * 60_000
  },
  cow: {
    id: 'cow',
    name: '奶牛',
    icon: '🐄',
    produceItem: 'milk',
    produceName: '牛奶',
    produceIcon: '🥛',
    produceMs: 12 * 60_000,
    manureMs: 10 * 60_000
  }
}

export const HOMESTEAD_ANIMAL_IDS: readonly HomesteadAnimalId[] = [
  'chicken',
  'cow'
]

export const HOMESTEAD_ITEMS: readonly HomesteadItemDefinition[] = [
  ...HOMESTEAD_CROPS.map((crop) => ({
    id: crop.id,
    name: crop.name,
    icon: crop.icon
  })),
  { id: 'egg', name: '鸡蛋', icon: '🥚' },
  { id: 'milk', name: '牛奶', icon: '🥛' },
  { id: 'fish', name: '鱼', icon: '🐟' },
  { id: 'fertilizer', name: '肥料', icon: '🌱' }
]

const HOMESTEAD_ORDER_ITEM_VALUES: Record<HomesteadOrderItemId, number> = {
  radish: 4,
  tomato: 7,
  corn: 11,
  strawberry: 9,
  egg: 7,
  milk: 12,
  fish: 10
}

const HOMESTEAD_ACHIEVEMENT_IDS = new Set(
  HOMESTEAD_ACHIEVEMENTS.map((achievement) => achievement.id)
)

const HOMESTEAD_DECORATION_IDS = new Set(
  HOMESTEAD_DECORATIONS.map((decoration) => decoration.id)
)

const DEFAULT_SEED_STOCK: Record<HomesteadCropId, number> = {
  radish: 4,
  tomato: 3,
  corn: 2,
  strawberry: 1
}

const CROP_MAP = new Map<HomesteadCropId, HomesteadCropDefinition>(
  HOMESTEAD_CROPS.map((crop) => [crop.id, crop])
)

const ITEM_MAP = Object.fromEntries(
  HOMESTEAD_ITEMS.map((item) => [item.id, item])
) as Record<HomesteadItemId, HomesteadItemDefinition>

const STORAGE_KEY = 'LINBLOG_DESKTOP_PET_HOMESTEAD'

const readStorage = (key: string): string | null => {
  try {
    return typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(key)
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

const currentStorageKey = (): string => {
  const userId = readCurrentUserId()
  return userId ? `${STORAGE_KEY}:u${userId}` : STORAGE_KEY
}

export function getHomesteadCrop(
  id: HomesteadCropId | null | undefined
): HomesteadCropDefinition | null {
  return id ? CROP_MAP.get(id) || null : null
}

export function getHomesteadItem(
  id: HomesteadItemId
): HomesteadItemDefinition {
  return ITEM_MAP[id]
}

const emptyInventory = (): Record<HomesteadItemId, number> => ({
  radish: 0,
  tomato: 0,
  corn: 0,
  strawberry: 0,
  egg: 0,
  milk: 0,
  fish: 0,
  fertilizer: 0
})

const emptyPlot = (): HomesteadPlotState => ({
  cropId: null,
  plantedAt: 0,
  wateredAt: 0,
  fertilizedAt: 0
})

const emptyTotals = (): HomesteadTotals => ({
  harvests: 0,
  eggs: 0,
  milk: 0,
  fish: 0,
  manure: 0
})

/** 小院按本地自然日重置每日帮忙次数 */
export function homesteadDayKey(now = Date.now()): string {
  const date = new Date(now)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

export type HomesteadWeatherId = 'sunny' | 'cloudy' | 'rainy' | 'windy'

export interface HomesteadWeatherDefinition {
  id: HomesteadWeatherId
  label: string
  icon: string
  description: string
}

export const HOMESTEAD_WEATHERS: readonly HomesteadWeatherDefinition[] = [
  {
    id: 'sunny',
    label: '晴朗',
    icon: '☀️',
    description: '阳光正好，小院暖洋洋的。'
  },
  {
    id: 'cloudy',
    label: '多云',
    icon: '⛅',
    description: '云层遮住太阳，适合慢慢打理小院。'
  },
  {
    id: 'rainy',
    label: '小雨',
    icon: '🌧️',
    description: '雨点落在菜叶和鱼塘上，空气湿湿润润的。'
  },
  {
    id: 'windy',
    label: '微风',
    icon: '🍃',
    description: '风穿过树梢，把落叶吹得满院子跑。'
  }
]

export interface HomesteadWeatherEffect {
  id: HomesteadWeatherId
  title: string
  summary: string
  detail: string
  cropGrowMultiplier: number
  animalProduceMultiplier: number
  pondCooldownMultiplier: number
}

export const HOMESTEAD_WEATHER_EFFECTS: Record<
  HomesteadWeatherId,
  HomesteadWeatherEffect
> = {
  sunny: {
    id: 'sunny',
    title: '阳光正好',
    summary: '作物生长 +15%',
    detail: '日照充足，菜地里的作物成熟得更快。',
    cropGrowMultiplier: 1.15,
    animalProduceMultiplier: 1,
    pondCooldownMultiplier: 1
  },
  cloudy: {
    id: 'cloudy',
    title: '悠闲午后',
    summary: '动物产出 +15%',
    detail: '天气凉爽，鸡舍和牧场里的动物更愿意活动。',
    cropGrowMultiplier: 1,
    animalProduceMultiplier: 1.15,
    pondCooldownMultiplier: 1
  },
  rainy: {
    id: 'rainy',
    title: '雨水滋养',
    summary: '作物生长 +25%',
    detail: '雨水浸润土壤，菜地里的作物长得格外快。',
    cropGrowMultiplier: 1.25,
    animalProduceMultiplier: 1,
    pondCooldownMultiplier: 1
  },
  windy: {
    id: 'windy',
    title: '顺风垂钓',
    summary: '钓鱼冷却 -25%',
    detail: '风把水面吹出波纹，鱼更容易上钩。',
    cropGrowMultiplier: 1,
    animalProduceMultiplier: 1,
    pondCooldownMultiplier: 0.75
  }
}

export function homesteadWeatherEffect(
  weatherId: HomesteadWeatherId
): HomesteadWeatherEffect {
  return HOMESTEAD_WEATHER_EFFECTS[weatherId] || HOMESTEAD_WEATHER_EFFECTS.sunny
}

/** 同一天内天气保持稳定，跨设备也能看到同样的天气。 */
export function homesteadWeatherForDay(
  day: string
): HomesteadWeatherDefinition {
  const roll = (hashText(`weather:${day}`) % 1000) / 10
  if (roll < 42) return HOMESTEAD_WEATHERS[0]
  if (roll < 68) return HOMESTEAD_WEATHERS[1]
  if (roll < 86) return HOMESTEAD_WEATHERS[2]
  return HOMESTEAD_WEATHERS[3]
}

export function getHomesteadWeather(
  now = Date.now()
): HomesteadWeatherDefinition {
  return homesteadWeatherForDay(homesteadDayKey(now))
}

export type HomesteadDayPhaseId = 'morning' | 'day' | 'evening' | 'night'

export interface HomesteadDayPhaseDefinition {
  id: HomesteadDayPhaseId
  label: string
  icon: string
  description: string
}

export const HOMESTEAD_DAY_PHASES: readonly HomesteadDayPhaseDefinition[] = [
  {
    id: 'morning',
    label: '清晨',
    icon: '🌅',
    description: '空气微凉，适合先浇一轮水。'
  },
  {
    id: 'day',
    label: '白天',
    icon: '☀️',
    description: '光线正好，小院最热闹的时候。'
  },
  {
    id: 'evening',
    label: '傍晚',
    icon: '🌇',
    description: '天色渐暖，适合收尾和清点收获。'
  },
  {
    id: 'night',
    label: '夜晚',
    icon: '🌙',
    description: '小院安静下来，宠物会放慢脚步。'
  }
]

export function getHomesteadDayPhase(
  now = Date.now()
): HomesteadDayPhaseDefinition {
  const hour = new Date(now).getHours()
  if (hour >= 5 && hour < 10) return HOMESTEAD_DAY_PHASES[0]
  if (hour >= 10 && hour < 17) return HOMESTEAD_DAY_PHASES[1]
  if (hour >= 17 && hour < 20) return HOMESTEAD_DAY_PHASES[2]
  return HOMESTEAD_DAY_PHASES[3]
}

const isDayKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const hashText = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const ORDER_POOL: readonly (readonly HomesteadOrderItemId[])[] = [
  ['radish', 'egg'],
  ['tomato', 'milk'],
  ['corn', 'fish'],
  ['strawberry', 'egg'],
  ['radish', 'tomato'],
  ['egg', 'milk'],
  ['fish', 'corn'],
  ['strawberry', 'milk'],
  ['radish', 'egg', 'fish'],
  ['tomato', 'corn']
]

export function createDailyOrders(
  day = homesteadDayKey()
): HomesteadOrderState[] {
  const random = mulberry32(hashText(`orders:${day}`))
  const available = ORDER_POOL.slice()
  const orders: HomesteadOrderState[] = []
  for (let index = 0; index < HOMESTEAD_ORDER_COUNT; index++) {
    const poolIndex = Math.floor(random() * available.length)
    const [items] = available.splice(poolIndex, 1)
    const requirements = items.map((itemId, itemIndex) => ({
      itemId,
      count: (itemIndex === 0 ? 2 : 1) + Math.floor(random() * 2)
    }))
    const baseValue = requirements.reduce(
      (total, requirement) =>
        total +
        HOMESTEAD_ORDER_ITEM_VALUES[requirement.itemId] * requirement.count,
      0
    )
    orders.push({
      id: `${day}-${index + 1}`,
      requirements,
      reward: Math.max(10, Math.round((baseValue * 1.45 + 8) / 5) * 5),
      completedAt: 0
    })
  }
  return orders
}

const normalizeClaimedAchievements = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string' || !HOMESTEAD_ACHIEVEMENT_IDS.has(item)) {
      continue
    }
    if (seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

const normalizeDecorations = (
  value: unknown
): HomesteadDecorationId[] => {
  if (!Array.isArray(value)) return []
  const result: HomesteadDecorationId[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string' || !HOMESTEAD_DECORATION_IDS.has(item as HomesteadDecorationId)) {
      continue
    }
    if (seen.has(item)) continue
    seen.add(item)
    result.push(item as HomesteadDecorationId)
  }
  return result
}

const normalizeDailyOrders = (
  value: unknown,
  now: number
): HomesteadOrderState[] => {
  if (!Array.isArray(value) || value.length !== HOMESTEAD_ORDER_COUNT) {
    return []
  }
  const ids = new Set<string>()
  const orders: HomesteadOrderState[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return []
    const raw = item as Partial<HomesteadOrderState>
    if (typeof raw.id !== 'string' || !raw.id || ids.has(raw.id)) return []
    if (!Array.isArray(raw.requirements)) return []
    const requirements: HomesteadOrderRequirement[] = []
    for (const requirement of raw.requirements) {
      if (!requirement || typeof requirement !== 'object') return []
      const itemId = requirement.itemId as HomesteadOrderItemId
      if (!(itemId in HOMESTEAD_ORDER_ITEM_VALUES)) return []
      const count = intOr(requirement.count, 0, 9)
      if (count <= 0) return []
      requirements.push({ itemId, count })
    }
    if (!requirements.length || requirements.length > 3) return []
    const reward = intOr(raw.reward, 0, 999_999)
    if (reward <= 0) return []
    ids.add(raw.id)
    orders.push({
      id: raw.id,
      requirements,
      reward,
      completedAt: Math.min(now, safeTimestamp(raw.completedAt, 0))
    })
  }
  return orders
}

const defaultAutoHelp = (now = Date.now()): HomesteadAutoHelpState => ({
  enabled: true,
  lastAt: 0,
  day: homesteadDayKey(now),
  count: 0,
  total: 0
})

const intOr = (value: unknown, fallback: number, max = 1_000_000_000): number => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(0, Math.round(number)))
}

const safeTimestamp = (value: unknown, fallback: number): number => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.min(Math.round(number), Number.MAX_SAFE_INTEGER)
}

export function createDefaultHomestead(
  now = Date.now(),
  stateVersion = 0
): HomesteadState {
  const day = homesteadDayKey(now)
  return {
    plots: Array.from({ length: HOMESTEAD_PLOT_COUNT }, emptyPlot),
    plotCount: HOMESTEAD_PLOT_COUNT,
    animals: {
      chicken: {
        lastProduceAt: now - HOMESTEAD_ANIMALS.chicken.produceMs,
        lastManureAt: now - HOMESTEAD_ANIMALS.chicken.manureMs
      },
      cow: {
        lastProduceAt: now - HOMESTEAD_ANIMALS.cow.produceMs,
        lastManureAt: now - HOMESTEAD_ANIMALS.cow.manureMs
      }
    },
    lastFishedAt: now - HOMESTEAD_FISH_COOLDOWN_MS,
    inventory: emptyInventory(),
    coins: HOMESTEAD_STARTING_COINS,
    experience: 0,
    seedStock: { ...DEFAULT_SEED_STOCK },
    ordersDay: day,
    orders: createDailyOrders(day),
    claimedAchievements: [],
    totals: emptyTotals(),
    autoHelp: defaultAutoHelp(now),
    barnLevel: 1,
    pondLevel: 1,
    decorations: [],
    stateVersion: intOr(stateVersion, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: now
  }
}

const isFreshHomestead = (state: HomesteadState): boolean =>
  state.plots.every((plot) => !plot.cropId) &&
  HOMESTEAD_ITEMS.every((item) => state.inventory[item.id] === 0) &&
  HOMESTEAD_CROPS.every(
    (crop) =>
      state.seedStock[crop.id] === DEFAULT_SEED_STOCK[crop.id]
  ) &&
  state.coins === HOMESTEAD_STARTING_COINS &&
  state.experience === 0 &&
  state.claimedAchievements.length === 0 &&
  Object.values(state.totals).every((value) => value === 0) &&
  state.autoHelp.total === 0 &&
  state.plotCount === HOMESTEAD_PLOT_COUNT &&
  state.barnLevel === 1 &&
  state.pondLevel === 1 &&
  state.decorations.length === 0

export function normalizeHomestead(
  value?: Partial<HomesteadState> | null,
  now = Date.now()
): HomesteadState {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<HomesteadState>
  const rawPlots = Array.isArray(raw.plots) ? raw.plots : []
  const plotCount = Math.min(
    HOMESTEAD_MAX_PLOT_COUNT,
    Math.max(
      HOMESTEAD_PLOT_COUNT,
      intOr(raw.plotCount, rawPlots.length || HOMESTEAD_PLOT_COUNT, HOMESTEAD_MAX_PLOT_COUNT),
      rawPlots.length
    )
  )
  const plots = Array.from({ length: plotCount }, (_, index) => {
    const item = rawPlots[index]
    const crop = getHomesteadCrop(item?.cropId)
    if (!crop) return emptyPlot()
    const plantedAt = Math.min(now, safeTimestamp(item?.plantedAt, now))
    const wateredRaw = safeTimestamp(item?.wateredAt, 0)
    const fertilizedRaw = safeTimestamp(item?.fertilizedAt, 0)
    return {
      cropId: crop.id,
      plantedAt,
      wateredAt:
        wateredRaw > plantedAt && wateredRaw <= now ? wateredRaw : 0,
      fertilizedAt:
        fertilizedRaw > plantedAt && fertilizedRaw <= now
          ? fertilizedRaw
          : 0
    }
  })

  const rawAnimals =
    raw.animals && typeof raw.animals === 'object'
      ? raw.animals
      : ({} as Partial<Record<HomesteadAnimalId, HomesteadAnimalState>>)
  const animals = {} as Record<HomesteadAnimalId, HomesteadAnimalState>
  for (const id of HOMESTEAD_ANIMAL_IDS) {
    const definition = HOMESTEAD_ANIMALS[id]
    const item = rawAnimals[id]
    animals[id] = {
      lastProduceAt: Math.min(
        now,
        safeTimestamp(item?.lastProduceAt, now - definition.produceMs)
      ),
      lastManureAt: Math.min(
        now,
        safeTimestamp(item?.lastManureAt, now - definition.manureMs)
      )
    }
  }

  const rawInventory = (
    raw.inventory && typeof raw.inventory === 'object' ? raw.inventory : {}
  ) as Partial<Record<HomesteadItemId, number>>
  const inventory = emptyInventory()
  for (const item of HOMESTEAD_ITEMS) {
    inventory[item.id] = intOr(rawInventory[item.id], 0, 999_999)
  }

  const hasSeedStock =
    raw.seedStock && typeof raw.seedStock === 'object'
  const rawSeedStock = (hasSeedStock ? raw.seedStock : {}) as Partial<
    Record<HomesteadCropId, number>
  >
  const seedStock = {} as Record<HomesteadCropId, number>
  for (const crop of HOMESTEAD_CROPS) {
    seedStock[crop.id] = hasSeedStock
      ? intOr(rawSeedStock[crop.id], 0, 999)
      : DEFAULT_SEED_STOCK[crop.id]
  }
  const coins =
    raw.coins === undefined
      ? HOMESTEAD_STARTING_COINS
      : intOr(raw.coins, 0, 9_999_999)
  const experience =
    raw.experience === undefined
      ? 0
      : intOr(raw.experience, 0, HOMESTEAD_MAX_EXPERIENCE)

  const rawTotals = (
    raw.totals && typeof raw.totals === 'object' ? raw.totals : {}
  ) as Partial<HomesteadTotals>
  const rawAutoHelp = (
    raw.autoHelp && typeof raw.autoHelp === 'object' ? raw.autoHelp : {}
  ) as Partial<HomesteadAutoHelpState>
  const today = homesteadDayKey(now)
  const autoHelpDay = isDayKey(rawAutoHelp.day) ? rawAutoHelp.day : today
  const storedOrders = normalizeDailyOrders(raw.orders, now)
  const orders =
    raw.ordersDay === today && storedOrders.length === HOMESTEAD_ORDER_COUNT
      ? storedOrders
      : createDailyOrders(today)
  return {
    plots,
    plotCount,
    animals,
    lastFishedAt: Math.min(
      now,
      safeTimestamp(raw.lastFishedAt, now - HOMESTEAD_FISH_COOLDOWN_MS)
    ),
    inventory,
    coins,
    experience,
    seedStock,
    ordersDay: today,
    orders,
    claimedAchievements: normalizeClaimedAchievements(
      raw.claimedAchievements
    ),
    totals: {
      harvests: intOr(rawTotals.harvests, 0),
      eggs: intOr(rawTotals.eggs, 0),
      milk: intOr(rawTotals.milk, 0),
      fish: intOr(rawTotals.fish, 0),
      manure: intOr(rawTotals.manure, 0)
    },
    autoHelp: {
      enabled:
        typeof rawAutoHelp.enabled === 'boolean' ? rawAutoHelp.enabled : true,
      lastAt: Math.min(now, safeTimestamp(rawAutoHelp.lastAt, 0)),
      day: today,
      count:
        autoHelpDay === today
          ? intOr(rawAutoHelp.count, 0, 99)
          : 0,
      total: intOr(rawAutoHelp.total, 0)
    },
    barnLevel: Math.min(
      HOMESTEAD_BARN_MAX_LEVEL,
      Math.max(1, intOr(raw.barnLevel, 1, HOMESTEAD_BARN_MAX_LEVEL))
    ),
    pondLevel: Math.min(
      HOMESTEAD_POND_MAX_LEVEL,
      Math.max(1, intOr(raw.pondLevel, 1, HOMESTEAD_POND_MAX_LEVEL))
    ),
    decorations: normalizeDecorations(raw.decorations),
    stateVersion: intOr(raw.stateVersion, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: Math.min(now, safeTimestamp(raw.updatedAt, now))
  }
}

export function getHomesteadState(now = Date.now()): HomesteadState {
  let stored: Partial<HomesteadState> | null = null
  try {
    const raw = readStorage(currentStorageKey())
    if (raw) stored = JSON.parse(raw) as Partial<HomesteadState>
  } catch {
    stored = null
  }
  const state = normalizeHomestead(stored, now)
  writeStorage(currentStorageKey(), JSON.stringify(state))
  return state
}

export function setHomesteadState(
  state: HomesteadState,
  now = Date.now()
): HomesteadState {
  const normalized = normalizeHomestead(state, now)
  writeStorage(currentStorageKey(), JSON.stringify(normalized))
  return normalized
}

export function resetHomesteadState(
  now = Date.now(),
  current?: Partial<HomesteadState> | null
): HomesteadState {
  const previous = normalizeHomestead(current, now)
  const state = createDefaultHomestead(
    now,
    Math.max(now, previous.stateVersion + 1)
  )
  writeStorage(currentStorageKey(), JSON.stringify(state))
  return state
}

const plotLastEventAt = (plot: HomesteadPlotState): number =>
  Math.max(plot.plantedAt, plot.wateredAt, plot.fertilizedAt)

const mergeHomesteadPlots = (
  local: HomesteadState,
  remote: HomesteadState
): HomesteadPlotState[] =>
  Array.from(
    {
      length: Math.min(
        HOMESTEAD_MAX_PLOT_COUNT,
        Math.max(
          HOMESTEAD_PLOT_COUNT,
          local.plotCount,
          remote.plotCount,
          local.plots.length,
          remote.plots.length
        )
      )
    },
    (_, index) => {
    const a = local.plots[index] || emptyPlot()
    const b = remote.plots[index] || emptyPlot()
    if (!a.cropId && !b.cropId) return emptyPlot()
    if (!a.cropId || !b.cropId) {
      const planted = a.cropId ? a : b
      const plantedState = a.cropId ? local : remote
      const emptyFrom = a.cropId ? remote : local
      return emptyFrom.totals.harvests > plantedState.totals.harvests &&
        emptyFrom.updatedAt >= plotLastEventAt(planted)
        ? emptyPlot()
        : planted
    }
    if (a.cropId !== b.cropId) {
      return a.plantedAt >= b.plantedAt ? a : b
    }
    return {
      cropId: a.cropId,
      plantedAt: Math.min(a.plantedAt, b.plantedAt),
      wateredAt: Math.max(a.wateredAt, b.wateredAt),
      fertilizedAt: Math.max(a.fertilizedAt, b.fertilizedAt)
    }
    }
  )

const mergeHomesteadOrders = (
  local: HomesteadState,
  remote: HomesteadState
): Pick<HomesteadState, 'ordersDay' | 'orders'> => {
  if (local.ordersDay !== remote.ordersDay) {
    return local.ordersDay > remote.ordersDay
      ? { ordersDay: local.ordersDay, orders: local.orders }
      : { ordersDay: remote.ordersDay, orders: remote.orders }
  }
  const localOrders = new Map(local.orders.map((order) => [order.id, order]))
  return {
    ordersDay: local.ordersDay,
    orders: remote.orders.map((order) => {
      const other = localOrders.get(order.id)
      return {
        ...order,
        completedAt: Math.max(order.completedAt, other?.completedAt || 0)
      }
    })
  }
}

/**
 * 跨设备合并小院快照。
 * 同版本时保守地保留两端更高的资源进度，避免同步后金币、种子或收成倒退。
 */
export function mergeHomesteads(
  local: HomesteadState,
  remote?: Partial<HomesteadState> | null,
  now = Date.now()
): HomesteadState {
  const a = normalizeHomestead(local, now)
  const b = normalizeHomestead(remote, now)
  if (a.stateVersion !== b.stateVersion) {
    return a.stateVersion > b.stateVersion ? a : b
  }
  const newer = b.updatedAt >= a.updatedAt ? b : a
  const localFresh = isFreshHomestead(a)
  const remoteFresh = isFreshHomestead(b)
  const economicSource = localFresh && !remoteFresh ? b : a
  const otherEconomicSource =
    economicSource === a ? b : a
  const inventory = emptyInventory()
  for (const item of HOMESTEAD_ITEMS) {
    inventory[item.id] =
      localFresh !== remoteFresh
        ? economicSource.inventory[item.id]
        : Math.max(
            otherEconomicSource.inventory[item.id],
            economicSource.inventory[item.id]
          )
  }
  const seedStock = {} as Record<HomesteadCropId, number>
  for (const crop of HOMESTEAD_CROPS) {
    seedStock[crop.id] =
      localFresh !== remoteFresh
        ? economicSource.seedStock[crop.id]
        : Math.max(
            otherEconomicSource.seedStock[crop.id],
            economicSource.seedStock[crop.id]
          )
  }
  const orderState = mergeHomesteadOrders(a, b)
  const autoHelpDay =
    a.autoHelp.day === b.autoHelp.day
      ? a.autoHelp.day
      : a.autoHelp.day > b.autoHelp.day
        ? a.autoHelp.day
        : b.autoHelp.day
  const autoHelpSource =
    a.autoHelp.day === autoHelpDay ? a.autoHelp : b.autoHelp
  return normalizeHomestead(
    {
      plots: mergeHomesteadPlots(a, b),
      plotCount: Math.max(a.plotCount, b.plotCount),
      animals: {
        chicken: {
          lastProduceAt: Math.max(
            a.animals.chicken.lastProduceAt,
            b.animals.chicken.lastProduceAt
          ),
          lastManureAt: Math.max(
            a.animals.chicken.lastManureAt,
            b.animals.chicken.lastManureAt
          )
        },
        cow: {
          lastProduceAt: Math.max(
            a.animals.cow.lastProduceAt,
            b.animals.cow.lastProduceAt
          ),
          lastManureAt: Math.max(
            a.animals.cow.lastManureAt,
            b.animals.cow.lastManureAt
          )
        }
      },
      lastFishedAt: Math.max(a.lastFishedAt, b.lastFishedAt),
      inventory,
      coins:
        localFresh !== remoteFresh
          ? economicSource.coins
          : Math.max(a.coins, b.coins),
      experience: Math.max(a.experience, b.experience),
      seedStock,
      ordersDay: orderState.ordersDay,
      orders: orderState.orders,
      claimedAchievements: [
        ...new Set([
          ...a.claimedAchievements,
          ...b.claimedAchievements
        ])
      ],
      totals: {
        harvests: Math.max(a.totals.harvests, b.totals.harvests),
        eggs: Math.max(a.totals.eggs, b.totals.eggs),
        milk: Math.max(a.totals.milk, b.totals.milk),
        fish: Math.max(a.totals.fish, b.totals.fish),
        manure: Math.max(a.totals.manure, b.totals.manure)
      },
      autoHelp: {
        enabled: newer.autoHelp.enabled,
        lastAt: Math.max(a.autoHelp.lastAt, b.autoHelp.lastAt),
        day: autoHelpDay,
        count:
          a.autoHelp.day === b.autoHelp.day
            ? Math.max(a.autoHelp.count, b.autoHelp.count)
            : autoHelpSource.count,
        total: Math.max(a.autoHelp.total, b.autoHelp.total)
      },
      barnLevel: Math.max(a.barnLevel, b.barnLevel),
      pondLevel: Math.max(a.pondLevel, b.pondLevel),
      decorations: [
        ...new Set([...a.decorations, ...b.decorations])
      ],
      stateVersion: a.stateVersion,
      updatedAt: Math.max(a.updatedAt, b.updatedAt)
    },
    now
  )
}

export function plotEffectiveGrowMs(
  plot: HomesteadPlotState,
  weatherId?: HomesteadWeatherId
): number {
  const crop = getHomesteadCrop(plot.cropId)
  if (!crop) return 0
  let multiplier = 1
  if (plot.wateredAt) multiplier -= HOMESTEAD_WATER_BONUS_RATE
  if (plot.fertilizedAt) multiplier -= HOMESTEAD_FERTILIZER_BONUS_RATE
  const weatherMultiplier = weatherId
    ? homesteadWeatherEffect(weatherId).cropGrowMultiplier
    : 1
  return Math.round(
    (crop.growMs * Math.max(0.4, multiplier)) / weatherMultiplier
  )
}

export function plotProgress(
  plot: HomesteadPlotState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): number {
  const duration = plotEffectiveGrowMs(plot, weatherId)
  if (!duration || !plot.plantedAt) return 0
  const elapsed = Math.max(0, now - plot.plantedAt)
  return Math.min(1, elapsed / duration)
}

export function plotRemainingMs(
  plot: HomesteadPlotState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): number {
  const duration = plotEffectiveGrowMs(plot, weatherId)
  if (!duration || !plot.plantedAt) return 0
  return Math.max(0, plot.plantedAt + duration - now)
}

export function isPlotRipe(
  plot: HomesteadPlotState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): boolean {
  return Boolean(plot.cropId) && plotRemainingMs(plot, now, weatherId) <= 0
}

export function animalProduceRemainingMs(
  animal: HomesteadAnimalState,
  definition: HomesteadAnimalDefinition,
  now = Date.now(),
  speedMultiplier = 1
): number {
  const duration = Math.round(
    definition.produceMs * Math.min(1, Math.max(0.4, speedMultiplier))
  )
  return Math.max(0, animal.lastProduceAt + duration - now)
}

export function animalManureRemainingMs(
  animal: HomesteadAnimalState,
  definition: HomesteadAnimalDefinition,
  now = Date.now(),
  speedMultiplier = 1
): number {
  const duration = Math.round(
    definition.manureMs * Math.min(1, Math.max(0.4, speedMultiplier))
  )
  return Math.max(0, animal.lastManureAt + duration - now)
}

export function isAnimalProduceReady(
  animal: HomesteadAnimalState,
  definition: HomesteadAnimalDefinition,
  now = Date.now(),
  speedMultiplier = 1
): boolean {
  return (
    animalProduceRemainingMs(animal, definition, now, speedMultiplier) <= 0
  )
}

export function isAnimalManureReady(
  animal: HomesteadAnimalState,
  definition: HomesteadAnimalDefinition,
  now = Date.now(),
  speedMultiplier = 1
): boolean {
  return (
    animalManureRemainingMs(animal, definition, now, speedMultiplier) <= 0
  )
}

export function pondRemainingMs(
  state: HomesteadState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): number {
  return Math.max(
    0,
    state.lastFishedAt + homesteadPondCooldownMs(state, weatherId) - now
  )
}

export function isPondReady(
  state: HomesteadState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): boolean {
  return pondRemainingMs(state, now, weatherId) <= 0
}

export function plantCrop(
  state: HomesteadState,
  plotIndex: number,
  cropId: HomesteadCropId,
  now = Date.now()
): HomesteadState {
  const crop = getHomesteadCrop(cropId)
  const plot = state.plots[plotIndex]
  if (!crop || !plot || plot.cropId) return state
  const plots = state.plots.slice()
  plots[plotIndex] = {
    cropId: crop.id,
    plantedAt: now,
    wateredAt: 0,
    fertilizedAt: 0
  }
  return { ...state, plots, updatedAt: now }
}

export function plantCropWithSeed(
  state: HomesteadState,
  plotIndex: number,
  cropId: HomesteadCropId,
  now = Date.now()
): HomesteadState {
  if ((state.seedStock[cropId] || 0) <= 0) return state
  const next = plantCrop(state, plotIndex, cropId, now)
  if (next === state) return state
  return {
    ...next,
    seedStock: {
      ...next.seedStock,
      [cropId]: next.seedStock[cropId] - 1
    },
    updatedAt: now
  }
}

export function buySeedPack(
  state: HomesteadState,
  cropId: HomesteadCropId,
  now = Date.now()
): HomesteadState {
  const pack = HOMESTEAD_SEED_PACKS[cropId]
  if (!pack || state.coins < pack.price) return state
  return {
    ...state,
    coins: state.coins - pack.price,
    seedStock: {
      ...state.seedStock,
      [cropId]: state.seedStock[cropId] + pack.count
    },
    updatedAt: now
  }
}

export function buyFertilizerPack(
  state: HomesteadState,
  now = Date.now()
): HomesteadState {
  if (state.coins < HOMESTEAD_FERTILIZER_PACK.price) return state
  return {
    ...state,
    coins: state.coins - HOMESTEAD_FERTILIZER_PACK.price,
    inventory: {
      ...state.inventory,
      fertilizer: state.inventory.fertilizer + HOMESTEAD_FERTILIZER_PACK.count
    },
    updatedAt: now
  }
}

export type HomesteadPurchaseReason =
  | 'ok'
  | 'max'
  | 'coins'
  | 'owned'
  | 'unknown'

export interface HomesteadPurchaseResult {
  state: HomesteadState
  changed: boolean
  reason: HomesteadPurchaseReason
}

export function nextHomesteadPlotExpansion(
  state: HomesteadState
): { plotCount: number; price: number } | null {
  return (
    HOMESTEAD_PLOT_EXPANSIONS.find(
      (expansion) => expansion.plotCount > state.plotCount
    ) || null
  )
}

export function buyHomesteadPlot(
  state: HomesteadState,
  now = Date.now()
): HomesteadPurchaseResult {
  const expansion = nextHomesteadPlotExpansion(state)
  if (!expansion) return { state, changed: false, reason: 'max' }
  if (state.coins < expansion.price) {
    return { state, changed: false, reason: 'coins' }
  }
  const missingPlots = Math.max(
    0,
    expansion.plotCount - state.plots.length
  )
  return {
    state: {
      ...state,
      plotCount: expansion.plotCount,
      plots: [
        ...state.plots,
        ...Array.from({ length: missingPlots }, emptyPlot)
      ],
      coins: state.coins - expansion.price,
      updatedAt: now
    },
    changed: true,
    reason: 'ok'
  }
}

export function nextHomesteadBarnUpgrade(
  state: HomesteadState
): HomesteadUpgradeDefinition | null {
  return (
    HOMESTEAD_BARN_UPGRADES.find(
      (upgrade) => upgrade.level > state.barnLevel
    ) || null
  )
}

export function upgradeHomesteadBarn(
  state: HomesteadState,
  now = Date.now()
): HomesteadPurchaseResult {
  const upgrade = nextHomesteadBarnUpgrade(state)
  if (!upgrade) return { state, changed: false, reason: 'max' }
  if (state.coins < upgrade.price) {
    return { state, changed: false, reason: 'coins' }
  }
  return {
    state: {
      ...state,
      barnLevel: upgrade.level,
      coins: state.coins - upgrade.price,
      updatedAt: now
    },
    changed: true,
    reason: 'ok'
  }
}

export function nextHomesteadPondUpgrade(
  state: HomesteadState
): HomesteadUpgradeDefinition | null {
  return (
    HOMESTEAD_POND_UPGRADES.find(
      (upgrade) => upgrade.level > state.pondLevel
    ) || null
  )
}

export function upgradeHomesteadPond(
  state: HomesteadState,
  now = Date.now()
): HomesteadPurchaseResult {
  const upgrade = nextHomesteadPondUpgrade(state)
  if (!upgrade) return { state, changed: false, reason: 'max' }
  if (state.coins < upgrade.price) {
    return { state, changed: false, reason: 'coins' }
  }
  return {
    state: {
      ...state,
      pondLevel: upgrade.level,
      coins: state.coins - upgrade.price,
      updatedAt: now
    },
    changed: true,
    reason: 'ok'
  }
}

export function getHomesteadDecoration(
  decorationId: string
): HomesteadDecorationDefinition | null {
  return (
    HOMESTEAD_DECORATIONS.find(
      (decoration) => decoration.id === decorationId
    ) || null
  )
}

export function buyHomesteadDecoration(
  state: HomesteadState,
  decorationId: string,
  now = Date.now()
): HomesteadPurchaseResult {
  const decoration = getHomesteadDecoration(decorationId)
  if (!decoration) {
    return { state, changed: false, reason: 'unknown' }
  }
  if (state.decorations.includes(decoration.id)) {
    return { state, changed: false, reason: 'owned' }
  }
  if (state.coins < decoration.price) {
    return { state, changed: false, reason: 'coins' }
  }
  return {
    state: {
      ...state,
      coins: state.coins - decoration.price,
      decorations: [...state.decorations, decoration.id],
      updatedAt: now
    },
    changed: true,
    reason: 'ok'
  }
}

export function canCompleteOrder(
  state: HomesteadState,
  order: HomesteadOrderState
): boolean {
  if (order.completedAt > 0) return false
  return order.requirements.every(
    (requirement) => state.inventory[requirement.itemId] >= requirement.count
  )
}

export interface HomesteadOrderCompleteResult {
  state: HomesteadState
  order: HomesteadOrderState | null
  changed: boolean
  reason: 'ok' | 'unknown' | 'completed' | 'missing'
}

export function completeOrder(
  state: HomesteadState,
  orderId: string,
  now = Date.now()
): HomesteadOrderCompleteResult {
  const order = state.orders.find((item) => item.id === orderId)
  if (!order) {
    return { state, order: null, changed: false, reason: 'unknown' }
  }
  if (order.completedAt > 0) {
    return { state, order, changed: false, reason: 'completed' }
  }
  if (!canCompleteOrder(state, order)) {
    return { state, order, changed: false, reason: 'missing' }
  }
  const inventory = { ...state.inventory }
  for (const requirement of order.requirements) {
    inventory[requirement.itemId] -= requirement.count
  }
  return {
    state: {
      ...state,
      inventory,
      coins: state.coins + order.reward,
      experience: Math.min(
        HOMESTEAD_MAX_EXPERIENCE,
        state.experience + HOMESTEAD_EXPERIENCE_REWARDS.order
      ),
      orders: state.orders.map((item) =>
        item.id === order.id ? { ...item, completedAt: now } : item
      ),
      updatedAt: now
    },
    order,
    changed: true,
    reason: 'ok'
  }
}

export function waterPlot(
  state: HomesteadState,
  plotIndex: number,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): HomesteadState {
  const plot = state.plots[plotIndex]
  if (
    !plot?.cropId ||
    plot.wateredAt ||
    isPlotRipe(plot, now, weatherId)
  ) {
    return state
  }
  const plots = state.plots.slice()
  plots[plotIndex] = { ...plot, wateredAt: now }
  return {
    ...state,
    plots,
    experience: Math.min(
      HOMESTEAD_MAX_EXPERIENCE,
      state.experience + HOMESTEAD_EXPERIENCE_REWARDS.water
    ),
    updatedAt: now
  }
}

export function fertilizePlot(
  state: HomesteadState,
  plotIndex: number,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): HomesteadState {
  const plot = state.plots[plotIndex]
  if (
    !plot?.cropId ||
    plot.fertilizedAt ||
    isPlotRipe(plot, now, weatherId) ||
    state.inventory.fertilizer <= 0
  ) {
    return state
  }
  const plots = state.plots.slice()
  plots[plotIndex] = { ...plot, fertilizedAt: now }
  return {
    ...state,
    plots,
    inventory: {
      ...state.inventory,
      fertilizer: state.inventory.fertilizer - 1
    },
    experience: Math.min(
      HOMESTEAD_MAX_EXPERIENCE,
      state.experience + HOMESTEAD_EXPERIENCE_REWARDS.fertilize
    ),
    updatedAt: now
  }
}

export interface HomesteadHarvestResult {
  state: HomesteadState
  crop: HomesteadCropDefinition | null
  amount: number
  changed: boolean
}

export function harvestPlot(
  state: HomesteadState,
  plotIndex: number,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): HomesteadHarvestResult {
  const plot = state.plots[plotIndex]
  const crop = getHomesteadCrop(plot?.cropId)
  if (!plot || !crop || !isPlotRipe(plot, now, weatherId)) {
    return { state, crop, amount: 0, changed: false }
  }
  const plots = state.plots.slice()
  plots[plotIndex] = emptyPlot()
  return {
    state: {
      ...state,
      plots,
      inventory: {
        ...state.inventory,
        [crop.id]: state.inventory[crop.id] + crop.yield
      },
      totals: {
        ...state.totals,
        harvests: state.totals.harvests + 1
      },
      experience: Math.min(
        HOMESTEAD_MAX_EXPERIENCE,
        state.experience + HOMESTEAD_EXPERIENCE_REWARDS.harvest
      ),
      updatedAt: now
    },
    crop,
    amount: crop.yield,
    changed: true
  }
}

export interface HomesteadCollectedItem {
  item: HomesteadItemDefinition
  count: number
}

export interface HomesteadAnimalCollectResult {
  state: HomesteadState
  items: HomesteadCollectedItem[]
  changed: boolean
}

export function collectAnimal(
  state: HomesteadState,
  animalId: HomesteadAnimalId,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): HomesteadAnimalCollectResult {
  const definition = HOMESTEAD_ANIMALS[animalId]
  const animal = state.animals[animalId]
  const items: HomesteadCollectedItem[] = []
  const inventory = { ...state.inventory }
  const totals = { ...state.totals }
  const nextAnimal = { ...animal }
  const speedMultiplier = homesteadBarnSpeedMultiplier(
    state.barnLevel,
    weatherId
  )
  let changed = false

  if (isAnimalProduceReady(animal, definition, now, speedMultiplier)) {
    inventory[definition.produceItem] += 1
    totals[definition.produceItem === 'egg' ? 'eggs' : 'milk'] += 1
    nextAnimal.lastProduceAt = now
    items.push({
      item: getHomesteadItem(definition.produceItem),
      count: 1
    })
    changed = true
  }
  if (isAnimalManureReady(animal, definition, now, speedMultiplier)) {
    inventory.fertilizer += 1
    totals.manure += 1
    nextAnimal.lastManureAt = now
    items.push({
      item: getHomesteadItem('fertilizer'),
      count: 1
    })
    changed = true
  }

  if (!changed) return { state, items: [], changed: false }
  const experienceGain = items.reduce(
    (total, item) =>
      total +
      (item.item.id === 'fertilizer'
        ? HOMESTEAD_EXPERIENCE_REWARDS.manure
        : HOMESTEAD_EXPERIENCE_REWARDS.produce),
    0
  )
  return {
    state: {
      ...state,
      animals: { ...state.animals, [animalId]: nextAnimal },
      inventory,
      totals,
      experience: Math.min(
        HOMESTEAD_MAX_EXPERIENCE,
        state.experience + experienceGain
      ),
      updatedAt: now
    },
    items,
    changed: true
  }
}

export interface HomesteadFishResult {
  state: HomesteadState
  changed: boolean
}

export function fishPond(
  state: HomesteadState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): HomesteadFishResult {
  if (!isPondReady(state, now, weatherId)) return { state, changed: false }
  return {
    state: {
      ...state,
      lastFishedAt: now,
      inventory: {
        ...state.inventory,
        fish: state.inventory.fish + 1
      },
      totals: { ...state.totals, fish: state.totals.fish + 1 },
      experience: Math.min(
        HOMESTEAD_MAX_EXPERIENCE,
        state.experience + HOMESTEAD_EXPERIENCE_REWARDS.fish
      ),
      updatedAt: now
    },
    changed: true
  }
}

export interface HomesteadTendResult {
  state: HomesteadState
  watered: number
  fertilized: number
  harvested: number
  collected: HomesteadCollectedItem[]
  fished: boolean
  changed: boolean
}

export function tendHomestead(
  state: HomesteadState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): HomesteadTendResult {
  let next = state
  let watered = 0
  let fertilized = 0
  let harvested = 0
  const collected: HomesteadCollectedItem[] = []
  let fished = false

  for (let index = 0; index < next.plots.length; index++) {
    let plot = next.plots[index]
    if (isPlotRipe(plot, now, weatherId)) {
      const result = harvestPlot(next, index, now, weatherId)
      if (result.changed) {
        harvested++
        next = result.state
      }
      continue
    }
    if (plot.cropId && !plot.wateredAt) {
      const wateredState = waterPlot(next, index, now, weatherId)
      if (wateredState !== next) {
        watered++
        next = wateredState
        plot = next.plots[index]
      }
    }
    if (
      plot.cropId &&
      plot.wateredAt &&
      !plot.fertilizedAt &&
      next.inventory.fertilizer > 0
    ) {
      const fertilizedState = fertilizePlot(next, index, now, weatherId)
      if (fertilizedState !== next) {
        fertilized++
        next = fertilizedState
      }
    }
  }

  for (const animalId of HOMESTEAD_ANIMAL_IDS) {
    const result = collectAnimal(next, animalId, now, weatherId)
    if (result.changed) {
      collected.push(...result.items)
      next = result.state
    }
  }

  if (isPondReady(next, now, weatherId)) {
    const result = fishPond(next, now, weatherId)
    if (result.changed) {
      fished = true
      next = result.state
    }
  }

  return {
    state: next,
    watered,
    fertilized,
    harvested,
    collected,
    fished,
    changed: next !== state
  }
}

export function formatHomesteadDuration(ms: number): string {
  if (ms <= 0) return '马上'
  if (ms < 60_000) return '不到 1 分钟'
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function plotStatusText(
  plot: HomesteadPlotState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): string {
  const crop = getHomesteadCrop(plot.cropId)
  if (!crop) return '空地，点击播种'
  if (isPlotRipe(plot, now, weatherId)) return `${crop.name}可以收获了`
  const remaining = formatHomesteadDuration(
    plotRemainingMs(plot, now, weatherId)
  )
  const states = [plot.wateredAt ? '已浇水' : '还没浇水']
  if (plot.fertilizedAt) states.push('已施肥')
  return `${crop.name}${states.join('，')}，${remaining}后成熟`
}

export function animalStatusText(
  state: HomesteadState,
  animalId: HomesteadAnimalId,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): string {
  const definition = HOMESTEAD_ANIMALS[animalId]
  const animal = state.animals[animalId]
  const speedMultiplier = homesteadBarnSpeedMultiplier(
    state.barnLevel,
    weatherId
  )
  const produce = isAnimalProduceReady(
    animal,
    definition,
    now,
    speedMultiplier
  )
    ? `${definition.produceName}可以收了`
    : `${definition.produceName}还要 ${formatHomesteadDuration(
        animalProduceRemainingMs(animal, definition, now, speedMultiplier)
      )}`
  const manure = isAnimalManureReady(
    animal,
    definition,
    now,
    speedMultiplier
  )
    ? '可以清理粪便'
    : `粪便还要 ${formatHomesteadDuration(
        animalManureRemainingMs(animal, definition, now, speedMultiplier)
      )}`
  return `${definition.name}：${produce}，${manure}`
}

export function pondStatusText(
  state: HomesteadState,
  now = Date.now(),
  weatherId?: HomesteadWeatherId
): string {
  return isPondReady(state, now, weatherId)
    ? '鱼塘可以钓鱼了'
    : `鱼塘还要 ${formatHomesteadDuration(
        pondRemainingMs(state, now, weatherId)
      )}`
}
