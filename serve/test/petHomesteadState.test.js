const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const modelPath = path.resolve(__dirname, '../model/dbModel/pet/index.js')
const originalLoad = Module._load
let calls = []
let storedRows = []

const query = async (sql, params = []) => {
    calls.push({ sql, params })
    if (sql.includes('SELECT homestead_state, homestead_version')) {
        return storedRows
    }
    if (sql.includes('INSERT INTO pet_state')) {
        const [, state, version] = params
        storedRows = [{
            homestead_state: state,
            homestead_version: version
        }]
        return { affectedRows: 1 }
    }
    return []
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === modelPath && request === '../../db/dbnew') {
        return { query }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const petModel = require(modelPath)
Module._load = originalLoad

const makeState = (overrides = {}) => ({
    plots: [
        { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
        { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
        { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 },
        { cropId: null, plantedAt: 0, wateredAt: 0, fertilizedAt: 0 }
    ],
    animals: {
        chicken: { lastProduceAt: 0, lastManureAt: 0 },
        cow: { lastProduceAt: 0, lastManureAt: 0 }
    },
    lastFishedAt: 0,
    inventory: {
        radish: 0,
        tomato: 0,
        corn: 0,
        strawberry: 0,
        egg: 0,
        milk: 0,
        fish: 0,
        fertilizer: 0
    },
    coins: 80,
    seedStock: { radish: 4, tomato: 3, corn: 2, strawberry: 1 },
    ordersDay: '2026-11-13',
    orders: [
        {
            id: '2026-11-13-1',
            requirements: [{ itemId: 'radish', count: 2 }],
            reward: 20,
            completedAt: 0
        },
        {
            id: '2026-11-13-2',
            requirements: [{ itemId: 'egg', count: 1 }],
            reward: 15,
            completedAt: 0
        },
        {
            id: '2026-11-13-3',
            requirements: [{ itemId: 'fish', count: 1 }],
            reward: 18,
            completedAt: 0
        }
    ],
    claimedAchievements: [],
    totals: { harvests: 0, eggs: 0, milk: 0, fish: 0, manure: 0 },
    autoHelp: {
        enabled: true,
        lastAt: 0,
        day: '2026-11-13',
        count: 0,
        total: 0
    },
    stateVersion: 0,
    updatedAt: 1_700_000_000_000,
    ...overrides
})

test.beforeEach(() => {
    calls = []
    storedRows = []
})

test('保存小院快照时写入 JSON 与独立版本号', async () => {
    const state = makeState({
        coins: 123,
        stateVersion: 7,
        inventory: {
            radish: 3,
            tomato: 0,
            corn: 0,
            strawberry: 0,
            egg: 0,
            milk: 0,
            fish: 0,
            fertilizer: 0
        }
    })
    const saved = await petModel.saveHomesteadState(7, state)
    const insert = calls.find((call) => call.sql.includes('INSERT INTO pet_state'))
    assert.ok(insert)
    assert.match(insert.sql, /homestead_state/)
    assert.match(insert.sql, /homestead_version/)
    assert.equal(insert.params[2], 7)
    assert.equal(JSON.parse(insert.params[1]).coins, 123)
    assert.equal(saved.coins, 123)
    assert.equal(saved.stateVersion, 7)
})

test('同版本同步会保留两端更高的资源与订单完成记录', async () => {
    storedRows = [{
        homestead_state: JSON.stringify(makeState({
            coins: 90,
            inventory: {
                radish: 2,
                tomato: 0,
                corn: 0,
                strawberry: 0,
                egg: 1,
                milk: 0,
                fish: 0,
                fertilizer: 1
            },
            orders: makeState().orders.map((order, index) =>
                index === 0 ? { ...order, completedAt: 1_700_000_100_000 } : order
            ),
            claimedAchievements: ['egg-basket'],
            updatedAt: 1_700_000_100_000
        })),
        homestead_version: 0
    }]

    const saved = await petModel.saveHomesteadState(7, makeState({
        coins: 110,
        inventory: {
            radish: 1,
            tomato: 3,
            corn: 0,
            strawberry: 0,
            egg: 0,
            milk: 2,
            fish: 1,
            fertilizer: 0
        },
        plots: [{
            cropId: 'tomato',
            plantedAt: 1_700_000_200_000,
            wateredAt: 1_700_000_210_000,
            fertilizedAt: 0
        }],
        orders: makeState().orders.map((order, index) =>
            index === 1 ? { ...order, completedAt: 1_700_000_300_000 } : order
        ),
        claimedAchievements: ['first-harvest'],
        updatedAt: 1_700_000_300_000
    }))

    assert.equal(saved.coins, 110)
    assert.equal(saved.inventory.radish, 2)
    assert.equal(saved.inventory.tomato, 3)
    assert.equal(saved.inventory.milk, 2)
    assert.equal(saved.plots[0].cropId, 'tomato')
    assert.equal(saved.orders[0].completedAt, 1_700_000_100_000)
    assert.equal(saved.orders[1].completedAt, 1_700_000_300_000)
    assert.deepEqual(saved.claimedAchievements.sort(), [
        'egg-basket',
        'first-harvest'
    ])
})

test('更高版本的重置会覆盖旧小院，旧版本不能回灌', async () => {
    storedRows = [{
        homestead_state: JSON.stringify(makeState({
            coins: 500,
            inventory: {
                radish: 9,
                tomato: 9,
                corn: 9,
                strawberry: 9,
                egg: 9,
                milk: 9,
                fish: 9,
                fertilizer: 9
            },
            stateVersion: 5,
            updatedAt: 1_700_000_400_000
        })),
        homestead_version: 5
    }]

    const reset = await petModel.saveHomesteadState(7, makeState({
        coins: 80,
        stateVersion: 10,
        updatedAt: 1_700_000_500_000
    }))
    assert.equal(reset.stateVersion, 10)
    assert.equal(reset.coins, 80)
    assert.equal(reset.inventory.radish, 0)

    storedRows = [{
        homestead_state: JSON.stringify(reset),
        homestead_version: 10
    }]
    const stale = await petModel.saveHomesteadState(7, makeState({
        coins: 999,
        inventory: {
            radish: 99,
            tomato: 99,
            corn: 99,
            strawberry: 99,
            egg: 99,
            milk: 99,
            fish: 99,
            fertilizer: 99
        },
        stateVersion: 5,
        updatedAt: 1_700_000_600_000
    }))
    assert.equal(stale.stateVersion, 10)
    assert.equal(stale.coins, 80)
    assert.equal(stale.inventory.radish, 0)
})

test('新设备的空白默认小院不会覆盖云端作物与库存', () => {
    const merged = petModel.mergeHomesteadStates(
        makeState(),
        makeState({
            plots: [{
                cropId: 'radish',
                plantedAt: 1_700_000_100_000,
                wateredAt: 1_700_000_110_000,
                fertilizedAt: 0
            }],
            coins: 120,
            seedStock: { radish: 1, tomato: 0, corn: 0, strawberry: 0 },
            updatedAt: 1_700_000_120_000
        })
    )

    assert.equal(merged.plots[0].cropId, 'radish')
    assert.equal(merged.coins, 120)
    assert.equal(merged.seedStock.radish, 1)
})

test('非法小院存档会被拒绝或修正', async () => {
    assert.equal(petModel.normalizeHomesteadState('{bad json'), null)
    const normalized = petModel.normalizeHomesteadState({
        plots: [{ cropId: 'unknown', plantedAt: 'bad' }],
        inventory: { radish: -10, egg: 3.7 },
        coins: -1,
        orders: [{
            id: 'bad order id',
            requirements: [{ itemId: 'radish', count: 2 }],
            reward: 10
        }],
        stateVersion: 2
    })
    assert.equal(normalized.plots.length, 4)
    assert.equal(normalized.plots[0].cropId, null)
    assert.equal(normalized.inventory.radish, 0)
    assert.equal(normalized.inventory.egg, 4)
    assert.equal(normalized.coins, 0)
    assert.deepEqual(normalized.orders, [])
    assert.deepEqual(normalized.claimedAchievements, [])
})
