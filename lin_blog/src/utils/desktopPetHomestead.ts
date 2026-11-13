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

export interface HomesteadAutoHelpState {
  enabled: boolean
  lastAt: number
  day: string
  count: number
  total: number
}

export interface HomesteadState {
  plots: HomesteadPlotState[]
  animals: Record<HomesteadAnimalId, HomesteadAnimalState>
  lastFishedAt: number
  inventory: Record<HomesteadItemId, number>
  totals: HomesteadTotals
  autoHelp: HomesteadAutoHelpState
  updatedAt: number
}

export const HOMESTEAD_PLOT_COUNT = 4
export const HOMESTEAD_FISH_COOLDOWN_MS = 3 * 60_000
export const HOMESTEAD_WATER_BONUS_RATE = 0.2
export const HOMESTEAD_FERTILIZER_BONUS_RATE = 0.2

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

const isDayKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

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

export function createDefaultHomestead(now = Date.now()): HomesteadState {
  return {
    plots: Array.from({ length: HOMESTEAD_PLOT_COUNT }, emptyPlot),
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
    totals: emptyTotals(),
    autoHelp: defaultAutoHelp(now),
    updatedAt: now
  }
}

export function normalizeHomestead(
  value?: Partial<HomesteadState> | null,
  now = Date.now()
): HomesteadState {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<HomesteadState>
  const rawPlots = Array.isArray(raw.plots) ? raw.plots : []
  const plots = Array.from({ length: HOMESTEAD_PLOT_COUNT }, (_, index) => {
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

  const rawTotals = (
    raw.totals && typeof raw.totals === 'object' ? raw.totals : {}
  ) as Partial<HomesteadTotals>
  const rawAutoHelp = (
    raw.autoHelp && typeof raw.autoHelp === 'object' ? raw.autoHelp : {}
  ) as Partial<HomesteadAutoHelpState>
  const today = homesteadDayKey(now)
  const autoHelpDay = isDayKey(rawAutoHelp.day) ? rawAutoHelp.day : today
  return {
    plots,
    animals,
    lastFishedAt: Math.min(
      now,
      safeTimestamp(raw.lastFishedAt, now - HOMESTEAD_FISH_COOLDOWN_MS)
    ),
    inventory,
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

export function resetHomesteadState(now = Date.now()): HomesteadState {
  const state = createDefaultHomestead(now)
  writeStorage(currentStorageKey(), JSON.stringify(state))
  return state
}

export function plotEffectiveGrowMs(plot: HomesteadPlotState): number {
  const crop = getHomesteadCrop(plot.cropId)
  if (!crop) return 0
  let multiplier = 1
  if (plot.wateredAt) multiplier -= HOMESTEAD_WATER_BONUS_RATE
  if (plot.fertilizedAt) multiplier -= HOMESTEAD_FERTILIZER_BONUS_RATE
  return Math.round(crop.growMs * Math.max(0.4, multiplier))
}

export function plotProgress(
  plot: HomesteadPlotState,
  now = Date.now()
): number {
  const duration = plotEffectiveGrowMs(plot)
  if (!duration || !plot.plantedAt) return 0
  const elapsed = Math.max(0, now - plot.plantedAt)
  return Math.min(1, elapsed / duration)
}

export function plotRemainingMs(
  plot: HomesteadPlotState,
  now = Date.now()
): number {
  const duration = plotEffectiveGrowMs(plot)
  if (!duration || !plot.plantedAt) return 0
  return Math.max(0, plot.plantedAt + duration - now)
}

export function isPlotRipe(
  plot: HomesteadPlotState,
  now = Date.now()
): boolean {
  return Boolean(plot.cropId) && plotRemainingMs(plot, now) <= 0
}

export function animalProduceRemainingMs(
  animal: HomesteadAnimalState,
  definition: HomesteadAnimalDefinition,
  now = Date.now()
): number {
  return Math.max(0, animal.lastProduceAt + definition.produceMs - now)
}

export function animalManureRemainingMs(
  animal: HomesteadAnimalState,
  definition: HomesteadAnimalDefinition,
  now = Date.now()
): number {
  return Math.max(0, animal.lastManureAt + definition.manureMs - now)
}

export function isAnimalProduceReady(
  animal: HomesteadAnimalState,
  definition: HomesteadAnimalDefinition,
  now = Date.now()
): boolean {
  return animalProduceRemainingMs(animal, definition, now) <= 0
}

export function isAnimalManureReady(
  animal: HomesteadAnimalState,
  definition: HomesteadAnimalDefinition,
  now = Date.now()
): boolean {
  return animalManureRemainingMs(animal, definition, now) <= 0
}

export function pondRemainingMs(
  state: HomesteadState,
  now = Date.now()
): number {
  return Math.max(0, state.lastFishedAt + HOMESTEAD_FISH_COOLDOWN_MS - now)
}

export function isPondReady(
  state: HomesteadState,
  now = Date.now()
): boolean {
  return pondRemainingMs(state, now) <= 0
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

export function waterPlot(
  state: HomesteadState,
  plotIndex: number,
  now = Date.now()
): HomesteadState {
  const plot = state.plots[plotIndex]
  if (!plot?.cropId || plot.wateredAt || isPlotRipe(plot, now)) return state
  const plots = state.plots.slice()
  plots[plotIndex] = { ...plot, wateredAt: now }
  return { ...state, plots, updatedAt: now }
}

export function fertilizePlot(
  state: HomesteadState,
  plotIndex: number,
  now = Date.now()
): HomesteadState {
  const plot = state.plots[plotIndex]
  if (
    !plot?.cropId ||
    plot.fertilizedAt ||
    isPlotRipe(plot, now) ||
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
  now = Date.now()
): HomesteadHarvestResult {
  const plot = state.plots[plotIndex]
  const crop = getHomesteadCrop(plot?.cropId)
  if (!plot || !crop || !isPlotRipe(plot, now)) {
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
  now = Date.now()
): HomesteadAnimalCollectResult {
  const definition = HOMESTEAD_ANIMALS[animalId]
  const animal = state.animals[animalId]
  const items: HomesteadCollectedItem[] = []
  const inventory = { ...state.inventory }
  const totals = { ...state.totals }
  const nextAnimal = { ...animal }
  let changed = false

  if (isAnimalProduceReady(animal, definition, now)) {
    inventory[definition.produceItem] += 1
    totals[definition.produceItem === 'egg' ? 'eggs' : 'milk'] += 1
    nextAnimal.lastProduceAt = now
    items.push({
      item: getHomesteadItem(definition.produceItem),
      count: 1
    })
    changed = true
  }
  if (isAnimalManureReady(animal, definition, now)) {
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
  return {
    state: {
      ...state,
      animals: { ...state.animals, [animalId]: nextAnimal },
      inventory,
      totals,
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
  now = Date.now()
): HomesteadFishResult {
  if (!isPondReady(state, now)) return { state, changed: false }
  return {
    state: {
      ...state,
      lastFishedAt: now,
      inventory: {
        ...state.inventory,
        fish: state.inventory.fish + 1
      },
      totals: { ...state.totals, fish: state.totals.fish + 1 },
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
  now = Date.now()
): HomesteadTendResult {
  let next = state
  let watered = 0
  let fertilized = 0
  let harvested = 0
  const collected: HomesteadCollectedItem[] = []
  let fished = false

  for (let index = 0; index < next.plots.length; index++) {
    let plot = next.plots[index]
    if (isPlotRipe(plot, now)) {
      const result = harvestPlot(next, index, now)
      if (result.changed) {
        harvested++
        next = result.state
      }
      continue
    }
    if (plot.cropId && !plot.wateredAt) {
      const wateredState = waterPlot(next, index, now)
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
      const fertilizedState = fertilizePlot(next, index, now)
      if (fertilizedState !== next) {
        fertilized++
        next = fertilizedState
      }
    }
  }

  for (const animalId of HOMESTEAD_ANIMAL_IDS) {
    const result = collectAnimal(next, animalId, now)
    if (result.changed) {
      collected.push(...result.items)
      next = result.state
    }
  }

  if (isPondReady(next, now)) {
    const result = fishPond(next, now)
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
  now = Date.now()
): string {
  const crop = getHomesteadCrop(plot.cropId)
  if (!crop) return '空地，点击播种'
  if (isPlotRipe(plot, now)) return `${crop.name}可以收获了`
  const remaining = formatHomesteadDuration(plotRemainingMs(plot, now))
  const states = [plot.wateredAt ? '已浇水' : '还没浇水']
  if (plot.fertilizedAt) states.push('已施肥')
  return `${crop.name}${states.join('，')}，${remaining}后成熟`
}

export function animalStatusText(
  state: HomesteadState,
  animalId: HomesteadAnimalId,
  now = Date.now()
): string {
  const definition = HOMESTEAD_ANIMALS[animalId]
  const animal = state.animals[animalId]
  const produce = isAnimalProduceReady(animal, definition, now)
    ? `${definition.produceName}可以收了`
    : `${definition.produceName}还要 ${formatHomesteadDuration(
        animalProduceRemainingMs(animal, definition, now)
      )}`
  const manure = isAnimalManureReady(animal, definition, now)
    ? '可以清理粪便'
    : `粪便还要 ${formatHomesteadDuration(
        animalManureRemainingMs(animal, definition, now)
      )}`
  return `${definition.name}：${produce}，${manure}`
}

export function pondStatusText(
  state: HomesteadState,
  now = Date.now()
): string {
  return isPondReady(state, now)
    ? '鱼塘可以钓鱼了'
    : `鱼塘还要 ${formatHomesteadDuration(pondRemainingMs(state, now))}`
}
