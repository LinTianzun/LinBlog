import {
  HOMESTEAD_ANIMALS,
  collectAnimal,
  fertilizePlot,
  fishPond,
  getHomesteadCrop,
  harvestPlot,
  homesteadBarnSpeedMultiplier,
  homesteadDayKey,
  isAnimalManureReady,
  isAnimalProduceReady,
  isPlotRipe,
  isPondReady,
  waterPlot,
  type HomesteadAnimalId,
  type HomesteadState
} from './desktopPetHomestead.ts'

export const HOMESTEAD_AUTO_HELP_COOLDOWN_MS = 60_000
export const HOMESTEAD_AUTO_HELP_DAILY_LIMIT = 6
export const HOMESTEAD_AUTO_HELP_EVENT = 'linblog:homestead-auto-help'
export const HOMESTEAD_TAB_EVENT = 'linblog:homestead-tab'

export type HomesteadTabId = 'home' | 'grow' | 'raise' | 'fish'

export type HomesteadAutoHelpAction =
  | 'harvest'
  | 'water'
  | 'fertilize'
  | 'collect'
  | 'fish'

export type HomesteadAutoHelpTarget =
  | { kind: 'plot'; index: number; anchor: string }
  | { kind: 'animal'; animalId: HomesteadAnimalId; anchor: string }
  | { kind: 'pond'; anchor: string }

export interface HomesteadAutoHelpTask {
  action: HomesteadAutoHelpAction
  target: HomesteadAutoHelpTarget
  anchor: string
  emoji: string
  animation: string
}

export type HomesteadAutoHelpBlockReason =
  | 'disabled'
  | 'cooldown'
  | 'daily-limit'
  | 'empty'

export interface HomesteadAutoHelpAvailability {
  allowed: boolean
  reason: HomesteadAutoHelpBlockReason | null
  remainingMs: number
  used: number
  limit: number
}

export interface HomesteadAutoHelpResult {
  state: HomesteadState
  task: HomesteadAutoHelpTask
  message: string
  emoji: string
}

export interface HomesteadAutoHelpEventDetail {
  state: HomesteadState
  task: HomesteadAutoHelpTask
  message: string
  emoji: string
}

const plotAnchor = (index: number): string => `plot-${index}`

/**
 * 优先做收益最高、最需要照看的活；一次只安排一件事，
 * 让宠物真的走过去，而不是瞬间把整个小院收完。
 */
export function findAutoHelpTask(
  state: HomesteadState,
  now = Date.now()
): HomesteadAutoHelpTask | null {
  for (let index = 0; index < state.plots.length; index++) {
    if (isPlotRipe(state.plots[index], now)) {
      return {
        action: 'harvest',
        target: { kind: 'plot', index, anchor: plotAnchor(index) },
        anchor: plotAnchor(index),
        emoji: getHomesteadCrop(state.plots[index].cropId)?.icon || '🧺',
        animation: '点击回应-开心跃动'
      }
    }
  }

  for (const animalId of ['chicken', 'cow'] as const) {
    const definition = HOMESTEAD_ANIMALS[animalId]
    const animal = state.animals[animalId]
    const speedMultiplier = homesteadBarnSpeedMultiplier(state.barnLevel)
    if (
      isAnimalProduceReady(animal, definition, now, speedMultiplier) ||
      isAnimalManureReady(animal, definition, now, speedMultiplier)
    ) {
      return {
        action: 'collect',
        target: {
          kind: 'animal',
          animalId,
          anchor: animalId === 'chicken' ? 'coop' : 'cow'
        },
        anchor: animalId === 'chicken' ? 'coop' : 'cow',
        emoji: definition.icon,
        animation: '撸猫'
      }
    }
  }

  if (isPondReady(state, now)) {
    return {
      action: 'fish',
      target: { kind: 'pond', anchor: 'pond' },
      anchor: 'pond',
      emoji: '🎣',
      animation: '悠闲哼歌'
    }
  }

  for (let index = 0; index < state.plots.length; index++) {
    const plot = state.plots[index]
    if (plot.cropId && !plot.wateredAt) {
      return {
        action: 'water',
        target: { kind: 'plot', index, anchor: plotAnchor(index) },
        anchor: plotAnchor(index),
        emoji: '💧',
        animation: '悠闲哼歌'
      }
    }
  }

  if (state.inventory.fertilizer > 0) {
    for (let index = 0; index < state.plots.length; index++) {
      const plot = state.plots[index]
      if (plot.cropId && plot.wateredAt && !plot.fertilizedAt) {
        return {
          action: 'fertilize',
          target: { kind: 'plot', index, anchor: plotAnchor(index) },
          anchor: plotAnchor(index),
          emoji: '🌱',
          animation: '悠闲哼歌'
        }
      }
    }
  }

  return null
}

export function canAutoHelp(
  state: HomesteadState,
  now = Date.now(),
  options: { ignoreCooldown?: boolean } = {}
): HomesteadAutoHelpAvailability {
  const used = state.autoHelp.day === homesteadDayKey(now)
    ? state.autoHelp.count
    : 0
  const remainingMs = Math.max(
    0,
    state.autoHelp.lastAt + HOMESTEAD_AUTO_HELP_COOLDOWN_MS - now
  )
  const base = {
    remainingMs,
    used,
    limit: HOMESTEAD_AUTO_HELP_DAILY_LIMIT
  }

  if (!state.autoHelp.enabled) {
    return { ...base, allowed: false, reason: 'disabled' }
  }
  if (used >= HOMESTEAD_AUTO_HELP_DAILY_LIMIT) {
    return { ...base, allowed: false, reason: 'daily-limit' }
  }
  if (!options.ignoreCooldown && remainingMs > 0) {
    return { ...base, allowed: false, reason: 'cooldown' }
  }
  if (!findAutoHelpTask(state, now)) {
    return { ...base, allowed: false, reason: 'empty' }
  }
  return { ...base, allowed: true, reason: null }
}

export function performAutoHelp(
  state: HomesteadState,
  now = Date.now()
): HomesteadAutoHelpResult | null {
  if (!state.autoHelp.enabled) return null
  const usedToday =
    state.autoHelp.day === homesteadDayKey(now) ? state.autoHelp.count : 0
  if (usedToday >= HOMESTEAD_AUTO_HELP_DAILY_LIMIT) return null
  const task = findAutoHelpTask(state, now)
  if (!task) return null

  let next = state
  let message = ''
  let emoji = task.emoji
  let changed = false

  if (task.target.kind === 'plot') {
    const plot = state.plots[task.target.index]
    const crop = getHomesteadCrop(plot?.cropId)
    if (task.action === 'harvest') {
      const result = harvestPlot(state, task.target.index, now)
      if (result.changed && result.crop) {
        next = result.state
        emoji = result.crop.icon
        message = `收了 ${result.amount} 个${result.crop.name}，放进仓库啦`
        changed = true
      }
    } else if (task.action === 'water' && crop) {
      const watered = waterPlot(state, task.target.index, now)
      if (watered !== state) {
        next = watered
        emoji = '💧'
        message = `给${crop.name}浇了水，成熟快一点啦`
        changed = true
      }
    } else if (task.action === 'fertilize' && crop) {
      const fertilized = fertilizePlot(state, task.target.index, now)
      if (fertilized !== state) {
        next = fertilized
        emoji = '🌱'
        message = `给${crop.name}施了肥，长得更快啦`
        changed = true
      }
    }
  } else if (task.target.kind === 'animal') {
    const animalId = task.target.animalId
    const definition = HOMESTEAD_ANIMALS[animalId]
    const result = collectAnimal(state, animalId, now)
    if (result.changed) {
      next = result.state
      const parts: string[] = []
      for (const item of result.items) {
        if (item.item.id === 'egg') {
          parts.push(`捡到 ${item.count} 个鸡蛋`)
        } else if (item.item.id === 'milk') {
          parts.push(`挤了 ${item.count} 份牛奶`)
        } else if (item.item.id === 'fertilizer') {
          parts.push(animalId === 'chicken' ? '清理了鸡舍' : '清理了牛棚')
        }
      }
      emoji = definition.icon
      message = parts.join('，') || `帮${definition.name}收拾好了`
      changed = true
    }
  } else if (task.action === 'fish') {
    const result = fishPond(state, now)
    if (result.changed) {
      next = result.state
      emoji = '🐟'
      message = '在鱼塘钓到一条鱼，今晚加餐！'
      changed = true
    }
  }

  if (!changed) return null

  const day = homesteadDayKey(now)
  const count = (state.autoHelp.day === day ? state.autoHelp.count : 0) + 1
  return {
    state: {
      ...next,
      autoHelp: {
        ...state.autoHelp,
        lastAt: now,
        day,
        count,
        total: state.autoHelp.total + 1
      },
      updatedAt: now
    },
    task,
    message,
    emoji
  }
}

export function autoHelpStatusText(
  state: HomesteadState,
  now = Date.now()
): string {
  if (!state.autoHelp.enabled) {
    return '已关闭，它只会在小院里休息'
  }
  const used =
    state.autoHelp.day === homesteadDayKey(now) ? state.autoHelp.count : 0
  if (used >= HOMESTEAD_AUTO_HELP_DAILY_LIMIT) {
    return `今日已帮忙 ${used}/${HOMESTEAD_AUTO_HELP_DAILY_LIMIT} 次，明天再来`
  }
  const remaining = Math.max(
    0,
    state.autoHelp.lastAt + HOMESTEAD_AUTO_HELP_COOLDOWN_MS - now
  )
  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000)
    return `下次帮忙还要 ${seconds} 秒 · 今日 ${used}/${HOMESTEAD_AUTO_HELP_DAILY_LIMIT}`
  }
  if (!findAutoHelpTask(state, now)) {
    return '小院暂时没有需要忙的'
  }
  return `闲下来会去菜地、鸡舍、牛棚和鱼塘帮忙 · 今日 ${used}/${HOMESTEAD_AUTO_HELP_DAILY_LIMIT}`
}

export function notifyHomesteadAutoHelp(
  detail: HomesteadAutoHelpEventDetail
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<HomesteadAutoHelpEventDetail>(
      HOMESTEAD_AUTO_HELP_EVENT,
      { detail }
    )
  )
}
