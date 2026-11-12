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
    if (sql.includes('FROM pet_state WHERE user_id = ?')) {
        return storedRows
    }
    if (sql.includes('INSERT INTO pet_state')) {
        const values = params
        storedRows = [{
            pet_name: values[1],
            mood: values[2],
            satiety: values[3],
            intimacy: values[4],
            streak_days: values[5],
            last_visit_date: values[6],
            total_interactions: values[7],
            last_fed_at: values[8],
            last_greeting_date: values[9],
            first_visit_at: values[10],
            unlocked_achievements: values[11],
            celebrated_achievements: values[12],
            daily_task_date: values[13],
            daily_task_state: values[14],
            client_updated_at: values[15]
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

const makeRow = (overrides = {}) => ({
    pet_name: '团子',
    mood: 60,
    satiety: 55,
    intimacy: 20,
    streak_days: 8,
    last_visit_date: '2026-11-12',
    total_interactions: 15,
    last_fed_at: 0,
    last_greeting_date: '2026-11-12',
    first_visit_at: 1_700_000_000_000,
    unlocked_achievements: '["streak:3","streak:7"]',
    celebrated_achievements: '["streak:3"]',
    daily_task_date: '2026-11-12',
    daily_task_state: JSON.stringify({
        progress: { feed: 1, publish: 0, comment: 0 },
        rewarded: ['feed']
    }),
    client_updated_at: 1_700_000_000_000,
    ...overrides
})

test.beforeEach(() => {
    calls = []
    storedRows = []
})

test('保存宠物状态时写入成就与每日任务字段', async () => {
    const saved = await petModel.savePetState(7, {
        name: '团子',
        mood: 66,
        satiety: 60,
        intimacy: 22,
        streakDays: 8,
        lastVisitDate: '2026-11-12',
        totalInteractions: 15,
        lastFedAt: 0,
        lastGreetingDate: '2026-11-12',
        firstVisitAt: 1_700_000_000_000,
        unlockedAchievements: ['streak:3', 'streak:7'],
        celebratedAchievements: [],
        dailyTasks: {
            date: '2026-11-12',
            progress: { feed: 1, publish: 0, comment: 0 },
            rewarded: ['feed']
        },
        updatedAt: 1_700_000_000_000
    })

    const insert = calls.find(call => call.sql.includes('INSERT INTO pet_state'))
    assert.ok(insert)
    assert.match(insert.sql, /unlocked_achievements/)
    assert.match(insert.sql, /celebrated_achievements/)
    assert.match(insert.sql, /daily_task_date/)
    assert.match(insert.sql, /daily_task_state/)
    assert.deepEqual(JSON.parse(insert.params[11]), ['streak:3', 'streak:7'])
    assert.equal(insert.params[12], null)
    assert.equal(insert.params[13], '2026-11-12')
    assert.deepEqual(JSON.parse(insert.params[14]), {
        progress: { feed: 1, publish: 0, comment: 0 },
        rewarded: ['feed']
    })

    assert.deepEqual(saved.unlockedAchievements, ['streak:3', 'streak:7'])
    assert.equal(saved.dailyTasks.date, '2026-11-12')
    assert.equal(saved.dailyTasks.progress.feed, 1)
})

test('旧客户端保存时不会清空已解锁成就和当天任务', async () => {
    storedRows = [makeRow()]

    await petModel.savePetState(7, {
        name: '团子',
        mood: 80,
        satiety: 55,
        intimacy: 20,
        streakDays: 8,
        lastVisitDate: '2026-11-12',
        totalInteractions: 15,
        lastFedAt: 0,
        lastGreetingDate: '2026-11-12',
        firstVisitAt: 1_700_000_000_000,
        updatedAt: 1_700_000_100_000
    })

    const insert = calls.find(call => call.sql.includes('INSERT INTO pet_state'))
    assert.deepEqual(JSON.parse(insert.params[11]), ['streak:3', 'streak:7'])
    assert.deepEqual(JSON.parse(insert.params[12]), ['streak:3'])
    assert.equal(insert.params[13], '2026-11-12')
    assert.deepEqual(JSON.parse(insert.params[14]), {
        progress: { feed: 1, publish: 0, comment: 0 },
        rewarded: ['feed']
    })
})

test('同一天的每日任务取较高进度并合并已领取记录', async () => {
    storedRows = [makeRow()]

    const saved = await petModel.savePetState(7, {
        name: '团子',
        mood: 70,
        satiety: 55,
        intimacy: 20,
        streakDays: 8,
        lastVisitDate: '2026-11-12',
        totalInteractions: 16,
        lastFedAt: 0,
        lastGreetingDate: '2026-11-12',
        firstVisitAt: 1_700_000_000_000,
        unlockedAchievements: ['streak:7'],
        dailyTasks: {
            date: '2026-11-12',
            progress: { feed: 0, publish: 1, comment: 0 },
            rewarded: ['publish']
        },
        updatedAt: 1_700_000_100_000
    })

    assert.deepEqual(saved.unlockedAchievements.sort(), ['streak:3', 'streak:7'])
    assert.deepEqual(saved.dailyTasks.progress, {
        feed: 1,
        publish: 1,
        comment: 0
    })
    assert.deepEqual(saved.dailyTasks.rewarded.sort(), ['feed', 'publish'])
})
