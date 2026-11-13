import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOMESTEAD_ANIMALS,
  HOMESTEAD_BARN_UPGRADES,
  HOMESTEAD_DECORATIONS,
  HOMESTEAD_FISH_COOLDOWN_MS,
  HOMESTEAD_FERTILIZER_PACK,
  HOMESTEAD_MAX_PLOT_COUNT,
  HOMESTEAD_PLOT_EXPANSIONS,
  HOMESTEAD_SEED_PACKS,
  HOMESTEAD_ORDER_COUNT,
  HOMESTEAD_STARTING_COINS,
  animalStatusText,
  buyFertilizerPack,
  buyHomesteadDecoration,
  buyHomesteadPlot,
  buySeedPack,
  canCompleteOrder,
  claimHomesteadAchievement,
  collectAnimal,
  completeOrder,
  createDefaultHomestead,
  createDailyOrders,
  fishPond,
  fertilizePlot,
  formatHomesteadDuration,
  getHomesteadState,
  harvestPlot,
  homesteadAchievementCurrent,
  homesteadAchievements,
  homesteadBarnSpeedMultiplier,
  homesteadPondCooldownMs,
  isAnimalManureReady,
  isAnimalProduceReady,
  isPlotRipe,
  isPondReady,
  mergeHomesteads,
  normalizeHomestead,
  plantCrop,
  plantCropWithSeed,
  plotRemainingMs,
  plotStatusText,
  pondStatusText,
  resetHomesteadState,
  setHomesteadState,
  tendHomestead,
  upgradeHomesteadBarn,
  upgradeHomesteadPond,
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

test('首次进入小院有金币、种子库存和每日订单', () => {
  const state = createDefaultHomestead(NOW)
  assert.equal(state.coins, HOMESTEAD_STARTING_COINS)
  assert.deepEqual(state.seedStock, {
    radish: 4,
    tomato: 3,
    corn: 2,
    strawberry: 1
  })
  assert.equal(state.ordersDay, '2026-11-13')
  assert.equal(state.orders.length, HOMESTEAD_ORDER_COUNT)
  assert.equal(
    new Set(state.orders.map((order) => order.id)).size,
    HOMESTEAD_ORDER_COUNT
  )
  assert.ok(
    state.orders.every(
      (order) =>
        order.reward > 0 &&
        order.requirements.length > 0 &&
        order.completedAt === 0
    )
  )
})

test('每日订单按日期稳定生成，跨天会刷新', () => {
  assert.deepEqual(
    createDailyOrders('2026-11-13'),
    createDailyOrders('2026-11-13')
  )
  assert.notDeepEqual(
    createDailyOrders('2026-11-13').map((order) => order.id),
    createDailyOrders('2026-11-14').map((order) => order.id)
  )

  const state = createDefaultHomestead(NOW)
  const first = state.orders[0]
  const withCompleted: HomesteadState = {
    ...state,
    orders: state.orders.map((order, index) =>
      index === 0 ? { ...order, completedAt: NOW } : order
    )
  }
  assert.equal(
    normalizeHomestead(withCompleted, NOW).orders[0].completedAt,
    NOW
  )
  const nextDay = normalizeHomestead(withCompleted, NOW + 24 * 60 * 60_000)
  assert.equal(nextDay.ordersDay, '2026-11-14')
  assert.ok(nextDay.orders.every((order) => order.completedAt === 0))
  assert.notEqual(nextDay.orders[0].id, first.id)
})

test('播种会消耗种子，种子不足时不再播种', () => {
  let state = createDefaultHomestead(NOW)
  state = {
    ...state,
    seedStock: { ...state.seedStock, radish: 1 }
  }
  const planted = plantCropWithSeed(state, 0, 'radish', NOW)
  assert.equal(planted.plots[0].cropId, 'radish')
  assert.equal(planted.seedStock.radish, 0)
  assert.equal(plantCropWithSeed(planted, 1, 'radish', NOW), planted)
})

test('商店购买会扣金币并增加种子或肥料库存', () => {
  const state = createDefaultHomestead(NOW)
  const radishPack = HOMESTEAD_SEED_PACKS.radish
  const bought = buySeedPack(state, 'radish', NOW)
  assert.equal(bought.coins, HOMESTEAD_STARTING_COINS - radishPack.price)
  assert.equal(bought.seedStock.radish, state.seedStock.radish + radishPack.count)

  const poor: HomesteadState = { ...bought, coins: 0 }
  assert.equal(buySeedPack(poor, 'tomato', NOW), poor)

  const fertilized = buyFertilizerPack(state, NOW)
  assert.equal(
    fertilized.coins,
    HOMESTEAD_STARTING_COINS - HOMESTEAD_FERTILIZER_PACK.price
  )
  assert.equal(
    fertilized.inventory.fertilizer,
    state.inventory.fertilizer + HOMESTEAD_FERTILIZER_PACK.count
  )
})

test('菜地扩建会扣金币并增加空地，最高 8 块', () => {
  let state = createDefaultHomestead(NOW)
  state = { ...state, coins: 5_000 }
  const coinsBefore = state.coins

  const first = buyHomesteadPlot(state, NOW)
  assert.equal(first.changed, true)
  assert.equal(first.state.plotCount, 5)
  assert.equal(first.state.plots.length, 5)
  assert.equal(first.state.plots[4].cropId, null)
  assert.equal(first.state.coins, coinsBefore - HOMESTEAD_PLOT_EXPANSIONS[0].price)

  let expanded = first.state
  for (const expansion of HOMESTEAD_PLOT_EXPANSIONS.slice(1)) {
    const result = buyHomesteadPlot(expanded, NOW)
    assert.equal(result.changed, true)
    assert.equal(result.state.plotCount, expansion.plotCount)
    expanded = result.state
  }
  assert.equal(expanded.plotCount, HOMESTEAD_MAX_PLOT_COUNT)
  assert.equal(expanded.plots.length, HOMESTEAD_MAX_PLOT_COUNT)
  assert.equal(buyHomesteadPlot(expanded, NOW).reason, 'max')

  const poor = { ...state, coins: 0 }
  assert.equal(buyHomesteadPlot(poor, NOW).reason, 'coins')
})

test('畜棚升级会加快动物产出，鱼塘升级会缩短钓鱼冷却', () => {
  const base = createDefaultHomestead(NOW)
  const withCoins: HomesteadState = { ...base, coins: 2_000 }
  const chicken = {
    lastProduceAt: NOW,
    lastManureAt: NOW
  }
  const waiting: HomesteadState = {
    ...withCoins,
    animals: {
      ...withCoins.animals,
      chicken
    }
  }
  const almostReady = NOW + HOMESTEAD_ANIMALS.chicken.produceMs * 0.9
  assert.equal(
    isAnimalProduceReady(
      chicken,
      HOMESTEAD_ANIMALS.chicken,
      almostReady
    ),
    false
  )

  const barn = upgradeHomesteadBarn(waiting, NOW)
  assert.equal(barn.changed, true)
  assert.equal(barn.state.barnLevel, 2)
  assert.equal(
    barn.state.coins,
    withCoins.coins - HOMESTEAD_BARN_UPGRADES[0].price
  )
  assert.ok(homesteadBarnSpeedMultiplier(barn.state.barnLevel) < 1)
  assert.equal(
    isAnimalProduceReady(
      chicken,
      HOMESTEAD_ANIMALS.chicken,
      almostReady,
      homesteadBarnSpeedMultiplier(barn.state.barnLevel)
    ),
    true
  )

  const pond = upgradeHomesteadPond(withCoins, NOW)
  assert.equal(pond.changed, true)
  assert.equal(pond.state.pondLevel, 2)
  assert.ok(homesteadPondCooldownMs(pond.state) < HOMESTEAD_FISH_COOLDOWN_MS)
  const fished = fishPond(pond.state, NOW)
  assert.equal(
    isPondReady(fished.state, NOW + homesteadPondCooldownMs(pond.state) - 1),
    false
  )
  assert.equal(
    isPondReady(fished.state, NOW + homesteadPondCooldownMs(pond.state)),
    true
  )
})

test('装饰购买会去重、校验金币和未知装饰', () => {
  const state = createDefaultHomestead(NOW)
  const rich: HomesteadState = { ...state, coins: 1_000 }
  const lantern = HOMESTEAD_DECORATIONS[0]
  const bought = buyHomesteadDecoration(rich, lantern.id, NOW)
  assert.equal(bought.changed, true)
  assert.deepEqual(bought.state.decorations, [lantern.id])
  assert.equal(bought.state.coins, rich.coins - lantern.price)
  assert.equal(
    buyHomesteadDecoration(bought.state, lantern.id, NOW).reason,
    'owned'
  )
  assert.equal(
    buyHomesteadDecoration(rich, 'unknown', NOW).reason,
    'unknown'
  )
  assert.equal(
    buyHomesteadDecoration({ ...rich, coins: 0 }, lantern.id, NOW).reason,
    'coins'
  )
})

test('交付订单会消耗仓库材料并发放金币', () => {
  const state = createDefaultHomestead(NOW)
  const order = {
    id: 'test-order',
    requirements: [{ itemId: 'radish' as const, count: 2 }],
    reward: 25,
    completedAt: 0
  }
  const ready: HomesteadState = {
    ...state,
    coins: 10,
    inventory: { ...state.inventory, radish: 3 },
    orders: [order, ...state.orders.slice(1)]
  }
  assert.equal(canCompleteOrder(ready, order), true)

  const result = completeOrder(ready, order.id, NOW)
  assert.equal(result.changed, true)
  assert.equal(result.reason, 'ok')
  assert.equal(result.state.coins, 35)
  assert.equal(result.state.inventory.radish, 1)
  assert.equal(result.state.orders[0].completedAt, NOW)
  assert.equal(completeOrder(result.state, order.id, NOW).reason, 'completed')

  const missing: HomesteadState = {
    ...ready,
    inventory: { ...ready.inventory, radish: 0 }
  }
  assert.equal(completeOrder(missing, order.id, NOW).reason, 'missing')
  assert.equal(completeOrder(ready, 'unknown', NOW).reason, 'unknown')
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

test('旧存档默认四块地，新存档保留扩建等级与装饰', () => {
  const defaults = createDefaultHomestead(NOW)
  const legacy = normalizeHomestead(
    {
      ...defaults,
      plotCount: undefined,
      plots: defaults.plots
    },
    NOW
  )
  assert.equal(legacy.plotCount, 4)
  assert.equal(legacy.plots.length, 4)
  assert.equal(legacy.barnLevel, 1)
  assert.equal(legacy.pondLevel, 1)

  const expanded = normalizeHomestead(
    {
      ...legacy,
      plotCount: 6,
      plots: [...legacy.plots, ...Array.from({ length: 2 }, () => ({
        cropId: null,
        plantedAt: 0,
        wateredAt: 0,
        fertilizedAt: 0
      }))],
      barnLevel: 9,
      pondLevel: 2,
      decorations: ['lantern', 'bad', 'lantern', 'bench']
    },
    NOW
  )
  assert.equal(expanded.plotCount, 6)
  assert.equal(expanded.plots.length, 6)
  assert.equal(expanded.barnLevel, 3)
  assert.equal(expanded.pondLevel, 2)
  assert.deepEqual(expanded.decorations, ['lantern', 'bench'])
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
    inventory: { ...state.inventory, fish: 9 },
    plotCount: 6,
    plots: [
      ...state.plots,
      { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
      { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 }
    ],
    barnLevel: 2,
    pondLevel: 2,
    decorations: ['lantern']
  }
  setHomesteadState(changed, NOW)
  assert.equal(getHomesteadState(NOW).inventory.fish, 9)
  const reset = resetHomesteadState(NOW)
  assert.equal(reset.inventory.fish, 0)
  assert.equal(reset.plotCount, 4)
  assert.equal(reset.plots.length, 4)
  assert.equal(reset.barnLevel, 1)
  assert.equal(reset.pondLevel, 1)
  assert.deepEqual(reset.decorations, [])
  assert.equal(getHomesteadState(NOW).inventory.fish, 0)
})

test('同版本小院合并会保留两端资源、产物与订单进度', () => {
  const local = createDefaultHomestead(NOW)
  const remote = normalizeHomestead(
    {
      ...local,
      coins: local.coins + 40,
      inventory: {
        ...local.inventory,
        radish: 3,
        egg: 2
      },
      seedStock: {
        ...local.seedStock,
        tomato: local.seedStock.tomato + 2
      },
      orders: local.orders.map((order, index) =>
        index === 0 ? { ...order, completedAt: NOW } : order
      ),
      updatedAt: NOW + 10_000
    },
    NOW + 10_000
  )
  const merged = mergeHomesteads(local, remote, NOW + 20_000)

  assert.equal(merged.coins, remote.coins)
  assert.equal(merged.inventory.radish, 3)
  assert.equal(merged.inventory.egg, 2)
  assert.equal(merged.seedStock.tomato, remote.seedStock.tomato)
  assert.equal(merged.orders[0].completedAt, NOW)
})

test('同版本合并会取较高扩建等级并合并装饰', () => {
  const local = normalizeHomestead(
    {
      ...createDefaultHomestead(NOW),
      plotCount: 5,
      plots: [
        ...createDefaultHomestead(NOW).plots,
        { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 }
      ],
      barnLevel: 2,
      decorations: ['lantern']
    },
    NOW
  )
  const remote = normalizeHomestead(
    {
      ...createDefaultHomestead(NOW),
      plotCount: 6,
      plots: Array.from({ length: 6 }, () => ({
        cropId: null,
        plantedAt: 0,
        wateredAt: 0,
        fertilizedAt: 0
      })),
      barnLevel: 1,
      pondLevel: 2,
      decorations: ['bench', 'lantern'],
      updatedAt: NOW + 10_000
    },
    NOW + 10_000
  )
  const merged = mergeHomesteads(local, remote, NOW + 20_000)

  assert.equal(merged.plotCount, 6)
  assert.equal(merged.plots.length, 6)
  assert.equal(merged.barnLevel, 2)
  assert.equal(merged.pondLevel, 2)
  assert.deepEqual(merged.decorations.sort(), ['bench', 'lantern'])
})

test('小院重置版本会优先于旧设备的高进度', () => {
  const old = normalizeHomestead(
    {
      ...createDefaultHomestead(NOW),
      coins: 999,
      stateVersion: 5,
      updatedAt: NOW + 100_000
    },
    NOW + 100_000
  )
  const reset = normalizeHomestead(
    {
      ...createDefaultHomestead(NOW),
      stateVersion: 10,
      updatedAt: NOW
    },
    NOW
  )

  assert.equal(mergeHomesteads(old, reset, NOW).coins, HOMESTEAD_STARTING_COINS)
  assert.equal(mergeHomesteads(reset, old, NOW).stateVersion, 10)
})

test('新设备首次同步不会用空白默认存档覆盖云端作物', () => {
  const remote = normalizeHomestead(
    {
      ...createDefaultHomestead(NOW),
      plots: [
        {
          cropId: 'radish',
          plantedAt: NOW - 60_000,
          wateredAt: NOW - 30_000,
          fertilizedAt: 0
        }
      ],
      seedStock: { radish: 1, tomato: 0, corn: 0, strawberry: 0 },
      coins: 120,
      updatedAt: NOW - 60_000
    },
    NOW
  )
  const freshLocal = createDefaultHomestead(NOW + 60_000)
  const merged = mergeHomesteads(freshLocal, remote, NOW + 60_000)

  assert.equal(merged.plots[0].cropId, 'radish')
  assert.equal(merged.coins, 120)
  assert.equal(merged.seedStock.radish, 1)
})

test('小院成就会按累计产出计算进度并自动解锁', () => {
  const state = normalizeHomestead(
    {
      ...createDefaultHomestead(NOW),
      totals: {
        harvests: 25,
        eggs: 20,
        milk: 19,
        fish: 3,
        manure: 15
      }
    },
    NOW
  )
  const achievements = homesteadAchievements(state)
  const byId = new Map(achievements.map((item) => [item.id, item]))

  assert.equal(homesteadAchievementCurrent(state, 'products'), 82)
  assert.equal(byId.get('first-harvest')?.unlocked, true)
  assert.equal(byId.get('first-harvest')?.claimed, false)
  assert.equal(byId.get('diligent-farmer')?.unlocked, true)
  assert.equal(byId.get('egg-basket')?.unlocked, true)
  assert.equal(byId.get('milk-free')?.unlocked, false)
  assert.equal(byId.get('milk-free')?.percent, 95)
  assert.equal(byId.get('fishing-expert')?.current, 3)
  assert.equal(byId.get('all-round-farmer')?.unlocked, false)
  assert.equal(byId.get('all-round-farmer')?.percent, 82)
})

test('成就奖励只能领取一次并增加小院金币', () => {
  const state = normalizeHomestead(
    {
      ...createDefaultHomestead(NOW),
      totals: {
        harvests: 1,
        eggs: 0,
        milk: 0,
        fish: 0,
        manure: 0
      }
    },
    NOW
  )

  const claimed = claimHomesteadAchievement(state, 'first-harvest', NOW)
  assert.equal(claimed.changed, true)
  assert.equal(claimed.reason, 'ok')
  assert.equal(claimed.state.coins, HOMESTEAD_STARTING_COINS + 20)
  assert.deepEqual(claimed.state.claimedAchievements, ['first-harvest'])

  const again = claimHomesteadAchievement(
    claimed.state,
    'first-harvest',
    NOW + 1
  )
  assert.equal(again.changed, false)
  assert.equal(again.reason, 'claimed')
  assert.equal(
    claimHomesteadAchievement(claimed.state, 'fishing-expert', NOW).reason,
    'locked'
  )
  assert.equal(
    claimHomesteadAchievement(claimed.state, 'unknown', NOW).reason,
    'unknown'
  )
})
