import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOMESTEAD_ANIMALS,
  HOMESTEAD_FISH_COOLDOWN_MS,
  animalStatusText,
  collectAnimal,
  createDefaultHomestead,
  fishPond,
  fertilizePlot,
  formatHomesteadDuration,
  getHomesteadState,
  harvestPlot,
  isAnimalManureReady,
  isAnimalProduceReady,
  isPlotRipe,
  isPondReady,
  normalizeHomestead,
  plantCrop,
  plotRemainingMs,
  plotStatusText,
  pondStatusText,
  resetHomesteadState,
  setHomesteadState,
  tendHomestead,
  waterPlot,
  type HomesteadState,
} from '../src/utils/desktopPetHomestead.ts'

const NOW = new Date('2026-11-13T12:00:00').getTime()

class MemoryStorage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

const storage = new MemoryStorage()
;(globalThis as { localStorage?: Storage }).localStorage =
  storage as unknown as Storage

const login = (id: number): void => {
  storage.setItem('token', `token-${id}`)
  storage.setItem('userInfo', JSON.stringify({ id }))
}

test('首次进入小院时动物和鱼塘都有可收产物，菜地是空地', () => {
  const state = createDefaultHomestead(NOW)
  assert.equal(state.plots.length, 4)
  assert.ok(state.plots.every((plot) => plot.cropId === null))
  assert.equal(
    isAnimalProduceReady(
      state.animals.chicken,
      HOMESTEAD_ANIMALS.chicken,
      NOW
    ),
    true
  )
  assert.equal(
    isAnimalManureReady(state.animals.cow, HOMESTEAD_ANIMALS.cow, NOW),
    true
  )
  assert.equal(isPondReady(state, NOW), true)
  assert.deepEqual(state.inventory, {
    radish: 0,
    tomato: 0,
    corn: 0,
    strawberry: 0,
    egg: 0,
    milk: 0,
    fish: 0,
    fertilizer: 0
  })
})

test('非法存档会修正菜地、时间戳和仓库数量', () => {
  const normalized = normalizeHomestead(
    {
      plots: [
        {
          cropId: 'bad' as never,
          plantedAt: NOW + 999_999,
          wateredAt: NOW - 1,
          fertilizedAt: 0
        },
        {
          cropId: 'radish',
          plantedAt: NOW - 60_000,
          wateredAt: NOW - 30_000,
          fertilizedAt: 0
        }
      ],
      inventory: {
        radish: -3,
        egg: 3.6
      } as never,
      animals: {
        chicken: { lastProduceAt: 'bad' as never, lastManureAt: -1 }
      } as never
    },
    NOW
  )

  assert.equal(normalized.plots.length, 4)
  assert.equal(normalized.plots[0].cropId, null)
  assert.equal(normalized.plots[1].cropId, 'radish')
  assert.equal(normalized.plots[1].wateredAt, NOW - 30_000)
  assert.equal(normalized.inventory.radish, 0)
  assert.equal(normalized.inventory.egg, 4)
  assert.ok(
    Object.values(normalized.animals.chicken).every((value) =>
      Number.isFinite(value)
    )
  )
})

test('播种、浇水和收获构成完整生长链', () => {
  let state = createDefaultHomestead(NOW)
  state = plantCrop(state, 0, 'radish', NOW)
  assert.equal(state.plots[0].cropId, 'radish')
  assert.equal(plantCrop(state, 0, 'tomato', NOW), state)

  const unripe = harvestPlot(state, 0, NOW + 60_000)
  assert.equal(unripe.changed, false)

  const watered = waterPlot(state, 0, NOW + 60_000)
  assert.notEqual(watered, state)
  assert.equal(waterPlot(watered, 0, NOW + 70_000), watered)
  assert.equal(isPlotRipe(watered.plots[0], NOW + 4 * 60_000 - 1), false)
  assert.equal(isPlotRipe(watered.plots[0], NOW + 4 * 60_000), true)

  const harvest = harvestPlot(watered, 0, NOW + 4 * 60_000)
  assert.equal(harvest.changed, true)
  assert.equal(harvest.amount, 2)
  assert.equal(harvest.state.inventory.radish, 2)
  assert.equal(harvest.state.plots[0].cropId, null)
  assert.equal(harvest.state.totals.harvests, 1)
})

test('鸡舍一次可以同时收鸡蛋和肥料，奶牛产奶', () => {
  let state = createDefaultHomestead(NOW)
  const chicken = collectAnimal(state, 'chicken', NOW)
  assert.equal(chicken.changed, true)
  assert.deepEqual(
    chicken.items.map((item) => item.item.id).sort(),
    ['egg', 'fertilizer']
  )
  assert.equal(chicken.state.inventory.egg, 1)
  assert.equal(chicken.state.inventory.fertilizer, 1)
  assert.equal(chicken.state.totals.eggs, 1)
  assert.equal(collectAnimal(chicken.state, 'chicken', NOW).changed, false)

  state = chicken.state
  const cow = collectAnimal(state, 'cow', NOW)
  assert.equal(cow.changed, true)
  assert.ok(cow.items.some((item) => item.item.id === 'milk'))
  assert.equal(cow.state.inventory.milk, 1)
  assert.equal(cow.state.totals.milk, 1)

  const nextEggAt =
    chicken.state.animals.chicken.lastProduceAt +
    HOMESTEAD_ANIMALS.chicken.produceMs
  assert.equal(
    isAnimalProduceReady(
      chicken.state.animals.chicken,
      HOMESTEAD_ANIMALS.chicken,
      nextEggAt
    ),
    true
  )
})

test('施肥会消耗肥料并缩短成熟时间', () => {
  let state = createDefaultHomestead(NOW)
  state.inventory.fertilizer = 2
  state = plantCrop(state, 0, 'radish', NOW)
  state = waterPlot(state, 0, NOW)
  const before = plotRemainingMs(state.plots[0], NOW)

  const fertilized = fertilizePlot(state, 0, NOW)
  assert.notEqual(fertilized, state)
  assert.equal(fertilized.inventory.fertilizer, 1)
  assert.equal(fertilized.plots[0].fertilizedAt, NOW)
  assert.ok(plotRemainingMs(fertilized.plots[0], NOW) < before)
  assert.equal(fertilizePlot(fertilized, 0, NOW), fertilized)
})

test('鱼塘按冷却时间出鱼', () => {
  const state = createDefaultHomestead(NOW)
  const fished = fishPond(state, NOW)
  assert.equal(fished.changed, true)
  assert.equal(fished.state.inventory.fish, 1)
  assert.equal(fished.state.totals.fish, 1)
  assert.equal(fishPond(fished.state, NOW + 1_000).changed, false)
  assert.equal(
    isPondReady(fished.state, NOW + HOMESTEAD_FISH_COOLDOWN_MS),
    true
  )
})

test('一键照料会浇水、收获、收取动物产物并钓鱼', () => {
  let state = createDefaultHomestead(NOW)
  state.inventory.fertilizer = 1
  state = plantCrop(state, 0, 'radish', NOW)
  state = waterPlot(state, 0, NOW + 10_000)
  state = plantCrop(state, 1, 'tomato', NOW)

  const result = tendHomestead(state, NOW + 4 * 60_000)
  assert.equal(result.changed, true)
  assert.equal(result.harvested, 1)
  assert.equal(result.watered, 1)
  assert.equal(result.fertilized, 1)
  assert.equal(result.fished, true)
  assert.ok(result.collected.some((item) => item.item.id === 'egg'))
  assert.ok(result.collected.some((item) => item.item.id === 'milk'))
  assert.equal(result.state.inventory.radish, 2)
  assert.equal(result.state.inventory.fish, 1)
  assert.equal(result.state.inventory.fertilizer, 2)
  assert.equal(result.state.plots[0].cropId, null)
  assert.equal(result.state.plots[1].wateredAt, NOW + 4 * 60_000)
  assert.equal(result.state.plots[1].fertilizedAt, NOW + 4 * 60_000)
})

test('状态文案会区分空地、生长中、成熟和冷却', () => {
  const empty = createDefaultHomestead(NOW)
  assert.equal(plotStatusText(empty.plots[0], NOW), '空地，点击播种')
  assert.equal(formatHomesteadDuration(0), '马上')
  assert.equal(formatHomesteadDuration(30_000), '不到 1 分钟')
  assert.equal(formatHomesteadDuration(5 * 60_000), '5 分钟')
  assert.equal(formatHomesteadDuration(65 * 60_000), '1 小时 5 分钟')
  assert.equal(formatHomesteadDuration(60 * 60_000), '1 小时')

  const planted = plantCrop(empty, 0, 'tomato', NOW)
  assert.match(plotStatusText(planted.plots[0], NOW + 60_000), /还没浇水/)
  const watered = waterPlot(planted, 0, NOW + 60_000)
  assert.match(plotStatusText(watered.plots[0], NOW + 60_000), /已浇水/)
  assert.match(
    animalStatusText(empty, 'chicken', NOW),
    /鸡蛋可以收了/
  )
  assert.match(pondStatusText(empty, NOW), /可以钓鱼/)
})

test('小院状态按账号隔离并支持匿名存档', () => {
  storage.clear()
  login(1)
  const state = createDefaultHomestead(NOW)
  state.inventory.radish = 5
  setHomesteadState(state, NOW)
  assert.match(
    storage.getItem('LINBLOG_DESKTOP_PET_HOMESTEAD:u1') || '',
    /"radish":5/
  )

  login(2)
  assert.equal(getHomesteadState(NOW).inventory.radish, 0)

  login(1)
  assert.equal(getHomesteadState(NOW).inventory.radish, 5)

  storage.removeItem('token')
  storage.removeItem('userInfo')
  setHomesteadState({ ...state, inventory: { ...state.inventory, fish: 3 } }, NOW)
  assert.match(
    storage.getItem('LINBLOG_DESKTOP_PET_HOMESTEAD') || '',
    /"fish":3/
  )
  assert.equal(getHomesteadState(NOW).inventory.fish, 3)
})

test('重置小院返回新的默认状态', () => {
  const state = createDefaultHomestead(NOW)
  const changed: HomesteadState = {
    ...state,
    lastFishedAt: NOW,
    inventory: { ...state.inventory, fish: 9 }
  }
  setHomesteadState(changed, NOW)
  assert.equal(getHomesteadState(NOW).inventory.fish, 9)
  const reset = resetHomesteadState(NOW)
  assert.equal(reset.inventory.fish, 0)
  assert.equal(getHomesteadState(NOW).inventory.fish, 0)
})
