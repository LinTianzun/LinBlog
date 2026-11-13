import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOMESTEAD_AUTO_HELP_DAILY_LIMIT,
  autoHelpStatusText,
  canAutoHelp,
  findAutoHelpTask,
  performAutoHelp,
} from '../src/utils/desktopPetAutoHelp.ts'
import {
  createDefaultHomestead,
  normalizeHomestead,
  plantCrop,
  type HomesteadState,
} from '../src/utils/desktopPetHomestead.ts'
import {
  DEFAULT_PET_VITALS,
  applyAutoHelpReward,
} from '../src/utils/desktopPetVitals.ts'

const NOW = new Date('2026-11-13T12:00:00').getTime()

/** 只留下菜地可操作，避免动物和鱼塘抢占自动帮忙的优先级 */
const quietFarm = (now = NOW): HomesteadState => {
  const state = createDefaultHomestead(now)
  state.animals.chicken = { lastProduceAt: now, lastManureAt: now }
  state.animals.cow = { lastProduceAt: now, lastManureAt: now }
  state.lastFishedAt = now
  return state
}

test('自动帮忙优先收获成熟作物，其次动物、鱼塘、浇水和施肥', () => {
  const state = createDefaultHomestead(NOW)
  const first = findAutoHelpTask(state, NOW)
  assert.equal(first?.action, 'collect')
  assert.equal(first?.anchor, 'coop')

  const withCrop = plantCrop(state, 0, 'radish', NOW - 10 * 60_000)
  const harvest = findAutoHelpTask(withCrop, NOW)
  assert.equal(harvest?.action, 'harvest')
  assert.equal(harvest?.target.kind, 'plot')
  if (harvest?.target.kind === 'plot') {
    assert.equal(harvest.target.index, 0)
  }

  const farm = quietFarm()
  const planted = plantCrop(farm, 1, 'tomato', NOW)
  assert.equal(findAutoHelpTask(planted, NOW)?.action, 'water')
  planted.inventory.fertilizer = 1
  const watered = {
    ...planted,
    plots: planted.plots.map((plot, index) =>
      index === 1 ? { ...plot, wateredAt: NOW } : plot
    )
  }
  assert.equal(findAutoHelpTask(watered, NOW)?.action, 'fertilize')
})

test('自动收获会写入仓库并记录当日帮忙次数', () => {
  let state = quietFarm()
  state = plantCrop(state, 0, 'radish', NOW - 10 * 60_000)
  state = plantCrop(state, 1, 'corn', NOW - 20 * 60_000)
  const result = performAutoHelp(state, NOW)

  assert.ok(result)
  assert.equal(result?.task.action, 'harvest')
  assert.equal(result?.state.inventory.radish, 2)
  assert.equal(result?.state.plots[0].cropId, null)
  assert.equal(result?.state.autoHelp.count, 1)
  assert.equal(result?.state.autoHelp.lastAt, NOW)
  assert.equal(result?.state.autoHelp.total, 1)
  assert.match(result?.message || '', /胡萝卜/)
})

test('自动帮忙会浇水、施肥并消耗肥料', () => {
  let state = quietFarm()
  state = plantCrop(state, 0, 'tomato', NOW)
  state.inventory.fertilizer = 1

  const watered = performAutoHelp(state, NOW)
  assert.equal(watered?.task.action, 'water')
  assert.ok(watered?.state.plots[0].wateredAt)
  assert.equal(watered?.state.inventory.fertilizer, 1)

  const fertilized = performAutoHelp(watered!.state, NOW + 1)
  assert.equal(fertilized?.task.action, 'fertilize')
  assert.ok(fertilized?.state.plots[0].fertilizedAt)
  assert.equal(fertilized?.state.inventory.fertilizer, 0)
})

test('自动帮忙会收鸡蛋、清理鸡舍，也会去鱼塘钓鱼', () => {
  const collected = performAutoHelp(createDefaultHomestead(NOW), NOW)
  assert.equal(collected?.task.action, 'collect')
  assert.equal(collected?.state.inventory.egg, 1)
  assert.equal(collected?.state.inventory.fertilizer, 1)
  assert.match(collected?.message || '', /鸡蛋/)
  assert.match(collected?.message || '', /鸡舍/)

  const farm = quietFarm()
  farm.lastFishedAt = 0
  const fished = performAutoHelp(farm, NOW)
  assert.equal(fished?.task.action, 'fish')
  assert.equal(fished?.state.inventory.fish, 1)
  assert.match(fished?.message || '', /鱼塘/)
})

test('冷却、每日上限、关闭开关和空小院都会阻止自动帮忙', () => {
  const ready = createDefaultHomestead(NOW)
  assert.equal(canAutoHelp(ready, NOW).allowed, true)

  const cooling = {
    ...ready,
    autoHelp: { ...ready.autoHelp, lastAt: NOW - 1_000 },
  }
  const cooldown = canAutoHelp(cooling, NOW)
  assert.equal(cooldown.allowed, false)
  assert.equal(cooldown.reason, 'cooldown')
  assert.ok(cooldown.remainingMs > 0)

  const capped = {
    ...ready,
    autoHelp: { ...ready.autoHelp, count: HOMESTEAD_AUTO_HELP_DAILY_LIMIT },
  }
  assert.equal(canAutoHelp(capped, NOW).reason, 'daily-limit')
  assert.equal(performAutoHelp(capped, NOW), null)

  const disabled = {
    ...ready,
    autoHelp: { ...ready.autoHelp, enabled: false },
  }
  assert.equal(canAutoHelp(disabled, NOW).reason, 'disabled')
  assert.equal(performAutoHelp(disabled, NOW), null)

  const empty = quietFarm()
  assert.equal(canAutoHelp(empty, NOW).reason, 'empty')
  assert.equal(performAutoHelp(empty, NOW), null)
})

test('跨天会重置帮忙次数，旧存档也能补全自动帮忙字段', () => {
  const normalized = normalizeHomestead(
    {
      autoHelp: {
        enabled: false,
        lastAt: NOW - 1_000,
        day: '2026-11-12',
        count: 5,
        total: 9,
      },
    },
    NOW
  )
  assert.equal(normalized.autoHelp.enabled, false)
  assert.equal(normalized.autoHelp.day, '2026-11-13')
  assert.equal(normalized.autoHelp.count, 0)
  assert.equal(normalized.autoHelp.total, 9)

  const legacy = normalizeHomestead({}, NOW)
  assert.equal(legacy.autoHelp.enabled, true)
  assert.equal(legacy.autoHelp.count, 0)

  const yesterday = {
    ...createDefaultHomestead(NOW),
    autoHelp: {
      enabled: true,
      lastAt: NOW - 3_600_000,
      day: '2026-11-12',
      count: HOMESTEAD_AUTO_HELP_DAILY_LIMIT,
      total: 12,
    },
  }
  assert.equal(canAutoHelp(yesterday, NOW).used, 0)
  const result = performAutoHelp(yesterday, NOW)
  assert.equal(result?.state.autoHelp.count, 1)
  assert.equal(result?.state.autoHelp.total, 13)
})

test('状态文案会显示冷却、今日次数和已完成', () => {
  const ready = createDefaultHomestead(NOW)
  assert.match(autoHelpStatusText(ready, NOW), /今日 0\/6/)

  const cooling = {
    ...ready,
    autoHelp: { ...ready.autoHelp, lastAt: NOW },
  }
  assert.match(autoHelpStatusText(cooling, NOW), /下次帮忙还要/)

  const capped = {
    ...ready,
    autoHelp: { ...ready.autoHelp, count: HOMESTEAD_AUTO_HELP_DAILY_LIMIT },
  }
  assert.match(autoHelpStatusText(capped, NOW), /今日已帮忙 6\/6/)
})

test('自动帮忙奖励会提升少量心情与亲密度并计入互动', () => {
  const next = applyAutoHelpReward(
    {
      ...DEFAULT_PET_VITALS,
      mood: 99,
      intimacy: 10,
      totalInteractions: 5,
      updatedAt: NOW - 1_000,
    },
    NOW
  )
  assert.equal(next.mood, 100)
  assert.equal(next.intimacy, 11)
  assert.equal(next.totalInteractions, 6)
  assert.equal(next.updatedAt, NOW)
})
