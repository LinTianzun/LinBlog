const { query } = require('../../db/dbnew')

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAILY_TASK_KEYS = ['feed', 'publish', 'comment']
const ACHIEVEMENT_PATTERN = /^[a-z][a-z0-9_-]{0,31}:\d{1,6}$/
const HOMESTEAD_CROP_IDS = ['radish', 'tomato', 'corn', 'strawberry']
const HOMESTEAD_PRODUCE_IDS = ['egg', 'milk']
const HOMESTEAD_ITEM_IDS = [
    ...HOMESTEAD_CROP_IDS,
    ...HOMESTEAD_PRODUCE_IDS,
    'fish',
    'fertilizer'
]
const HOMESTEAD_ORDER_ITEM_IDS = HOMESTEAD_ITEM_IDS
    .filter((id) => id !== 'fertilizer')
const HOMESTEAD_ANIMAL_IDS = ['chicken', 'cow']
const HOMESTEAD_PLOT_COUNT = 4
const HOMESTEAD_ORDER_COUNT = 3
const HOMESTEAD_ORDER_ID_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const HOMESTEAD_ACHIEVEMENT_IDS = [
    'first-harvest',
    'diligent-farmer',
    'egg-basket',
    'milk-free',
    'fishing-expert',
    'clean-yard',
    'all-round-farmer'
]

const clampInt = (value, min, max, fallback) => {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(Math.max(Math.round(number), min), max)
}

const safeTimestamp = (value) => {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) return 0
    return Math.min(Math.round(number), Number.MAX_SAFE_INTEGER)
}

const normalizeDate = (value) => {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null
    return value
}

const normalizeName = (value) => {
    if (typeof value !== 'string') return ''
    return value.trim().replace(/\s+/g, ' ').slice(0, 16)
}

const parseJson = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback
    if (typeof value === 'object') return value
    if (typeof value !== 'string') return fallback
    try {
        return JSON.parse(value)
    } catch {
        return fallback
    }
}

const uniqueStrings = (value, pattern, max = 80) => {
    const source = Array.isArray(value) ? value : parseJson(value, [])
    if (!Array.isArray(source)) return []
    const result = []
    const seen = new Set()
    for (const item of source) {
        if (typeof item !== 'string') continue
        const key = item.trim()
        if (!pattern.test(key) || seen.has(key)) continue
        seen.add(key)
        result.push(key)
        if (result.length >= max) break
    }
    return result
}

const normalizeAchievements = (value) =>
    uniqueStrings(value, ACHIEVEMENT_PATTERN)

function normalizeDailyTasks(value) {
    const raw = value && typeof value === 'object'
        ? value
        : parseJson(value, {})
    const date = normalizeDate(raw.date)
    const progressRaw = raw.progress && typeof raw.progress === 'object'
        ? raw.progress
        : {}
    const progress = {}
    for (const key of DAILY_TASK_KEYS) {
        progress[key] = date ? clampInt(progressRaw[key], 0, 1, 0) : 0
    }
    const rewarded = date
        ? uniqueStrings(raw.rewarded, /^(feed|publish|comment)$/, 8)
            .filter((key) => progress[key] >= 1)
        : []
    return { date, progress, rewarded }
}

function normalizePetState(payload = {}) {
    return {
        name: normalizeName(payload.name),
        mood: clampInt(payload.mood, 0, 100, 70),
        satiety: clampInt(payload.satiety, 0, 100, 60),
        intimacy: clampInt(payload.intimacy, 0, 100, 10),
        streakDays: clampInt(payload.streakDays, 0, 36500, 0),
        lastVisitDate: normalizeDate(payload.lastVisitDate),
        totalInteractions: clampInt(payload.totalInteractions, 0, 1_000_000_000, 0),
        lastFedAt: safeTimestamp(payload.lastFedAt),
        lastGreetingDate: normalizeDate(payload.lastGreetingDate),
        firstVisitAt: safeTimestamp(payload.firstVisitAt),
        unlockedAchievements: normalizeAchievements(payload.unlockedAchievements),
        celebratedAchievements: normalizeAchievements(payload.celebratedAchievements),
        dailyTasks: normalizeDailyTasks(payload.dailyTasks),
        stateVersion: safeTimestamp(payload.stateVersion),
        updatedAt: safeTimestamp(payload.updatedAt)
    }
}

const emptyHomesteadPlot = () => ({
    cropId: null,
    plantedAt: 0,
    wateredAt: 0,
    fertilizedAt: 0
})

function normalizeHomesteadOrders(value) {
    if (!Array.isArray(value)) return []
    const orders = []
    const ids = new Set()
    for (const item of value) {
        if (!item || typeof item !== 'object') continue
        const id = typeof item.id === 'string' ? item.id.trim() : ''
        if (!HOMESTEAD_ORDER_ID_PATTERN.test(id) || ids.has(id)) continue
        const requirements = []
        for (const requirement of Array.isArray(item.requirements)
            ? item.requirements
            : []) {
            if (!requirement || typeof requirement !== 'object') continue
            const itemId = HOMESTEAD_ORDER_ITEM_IDS.includes(
                requirement.itemId
            )
                ? requirement.itemId
                : null
            const count = clampInt(requirement.count, 1, 99, 0)
            if (!itemId || !count) continue
            requirements.push({ itemId, count })
            if (requirements.length >= 3) break
        }
        const reward = clampInt(item.reward, 1, 999_999, 0)
        if (!requirements.length || !reward) continue
        ids.add(id)
        orders.push({
            id,
            requirements,
            reward,
            completedAt: safeTimestamp(item.completedAt)
        })
        if (orders.length >= HOMESTEAD_ORDER_COUNT) break
    }
    return orders
}

const normalizeClaimedAchievements = (value) => {
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter(
        (item) => typeof item === 'string' &&
            HOMESTEAD_ACHIEVEMENT_IDS.includes(item)
    ))]
}

function normalizeHomesteadState(payload) {
    const raw = typeof payload === 'string'
        ? parseJson(payload, null)
        : payload
    if (!raw || typeof raw !== 'object') return null

    const rawPlots = Array.isArray(raw.plots) ? raw.plots : []
    const plots = Array.from({ length: HOMESTEAD_PLOT_COUNT }, (_, index) => {
        const item = rawPlots[index]
        if (!item || typeof item !== 'object') return emptyHomesteadPlot()
        const cropId = HOMESTEAD_CROP_IDS.includes(item.cropId)
            ? item.cropId
            : null
        if (!cropId) return emptyHomesteadPlot()
        const plantedAt = safeTimestamp(item.plantedAt)
        return {
            cropId,
            plantedAt,
            wateredAt: Math.max(0, safeTimestamp(item.wateredAt)),
            fertilizedAt: Math.max(0, safeTimestamp(item.fertilizedAt))
        }
    })

    const rawAnimals = raw.animals && typeof raw.animals === 'object'
        ? raw.animals
        : {}
    const animals = {}
    for (const id of HOMESTEAD_ANIMAL_IDS) {
        const item = rawAnimals[id]
        animals[id] = {
            lastProduceAt: safeTimestamp(item?.lastProduceAt),
            lastManureAt: safeTimestamp(item?.lastManureAt)
        }
    }

    const rawInventory = raw.inventory && typeof raw.inventory === 'object'
        ? raw.inventory
        : {}
    const inventory = {}
    for (const id of HOMESTEAD_ITEM_IDS) {
        inventory[id] = clampInt(rawInventory[id], 0, 999_999, 0)
    }

    const rawSeedStock = raw.seedStock && typeof raw.seedStock === 'object'
        ? raw.seedStock
        : {}
    const seedStock = {}
    for (const id of HOMESTEAD_CROP_IDS) {
        seedStock[id] = clampInt(rawSeedStock[id], 0, 999, 0)
    }

    const rawTotals = raw.totals && typeof raw.totals === 'object'
        ? raw.totals
        : {}
    const rawAutoHelp = raw.autoHelp && typeof raw.autoHelp === 'object'
        ? raw.autoHelp
        : {}
    return {
        plots,
        animals,
        lastFishedAt: safeTimestamp(raw.lastFishedAt),
        inventory,
        coins: clampInt(raw.coins, 0, 9_999_999, 0),
        seedStock,
        ordersDay: normalizeDate(raw.ordersDay) || '',
        orders: normalizeHomesteadOrders(raw.orders),
        claimedAchievements: normalizeClaimedAchievements(
            raw.claimedAchievements
        ),
        totals: {
            harvests: clampInt(rawTotals.harvests, 0, 1_000_000_000, 0),
            eggs: clampInt(rawTotals.eggs, 0, 1_000_000_000, 0),
            milk: clampInt(rawTotals.milk, 0, 1_000_000_000, 0),
            fish: clampInt(rawTotals.fish, 0, 1_000_000_000, 0),
            manure: clampInt(rawTotals.manure, 0, 1_000_000_000, 0)
        },
        autoHelp: {
            enabled:
                typeof rawAutoHelp.enabled === 'boolean'
                    ? rawAutoHelp.enabled
                    : true,
            lastAt: safeTimestamp(rawAutoHelp.lastAt),
            day: normalizeDate(rawAutoHelp.day) || '',
            count: clampInt(rawAutoHelp.count, 0, 99, 0),
            total: clampInt(rawAutoHelp.total, 0, 1_000_000_000, 0)
        },
        stateVersion: safeTimestamp(raw.stateVersion),
        updatedAt: safeTimestamp(raw.updatedAt)
    }
}

const toCamelState = (row) => {
    const dailyTaskState = parseJson(row.daily_task_state, {})
    return {
        name: row.pet_name || '',
        mood: Number(row.mood || 0),
        satiety: Number(row.satiety || 0),
        intimacy: Number(row.intimacy || 0),
        streakDays: Number(row.streak_days || 0),
        lastVisitDate: row.last_visit_date || '',
        totalInteractions: Number(row.total_interactions || 0),
        lastFedAt: Number(row.last_fed_at || 0),
        lastGreetingDate: row.last_greeting_date || '',
        firstVisitAt: Number(row.first_visit_at || 0),
        unlockedAchievements: normalizeAchievements(row.unlocked_achievements),
        celebratedAchievements: normalizeAchievements(row.celebrated_achievements),
        dailyTasks: normalizeDailyTasks({
            date: row.daily_task_date || '',
            progress: dailyTaskState?.progress,
            rewarded: dailyTaskState?.rewarded
        }),
        stateVersion: Number(row.state_version || 0),
        updatedAt: Number(row.client_updated_at || 0)
    }
}

const SELECT_FIELDS = `
    pet_name, mood, satiety, intimacy, streak_days,
    DATE_FORMAT(last_visit_date, '%Y-%m-%d') AS last_visit_date,
    total_interactions, last_fed_at,
    DATE_FORMAT(last_greeting_date, '%Y-%m-%d') AS last_greeting_date,
    first_visit_at, unlocked_achievements, celebrated_achievements,
    DATE_FORMAT(daily_task_date, '%Y-%m-%d') AS daily_task_date,
    daily_task_state, state_version, client_updated_at
`

async function getPetState(userId) {
    const rows = await query(
        `SELECT ${SELECT_FIELDS} FROM pet_state WHERE user_id = ? LIMIT 1`,
        [userId]
    )
    return rows?.[0] ? toCamelState(rows[0]) : null
}

function mergeDailyTaskStates(local, remote) {
    const a = normalizeDailyTasks(local)
    const b = normalizeDailyTasks(remote)
    if (!a.date) return b
    if (!b.date) return a
    if (a.date > b.date) return a
    if (b.date > a.date) return b

    const progress = {}
    for (const key of DAILY_TASK_KEYS) {
        progress[key] = Math.max(a.progress[key], b.progress[key])
    }
    const rewarded = [...new Set([...a.rewarded, ...b.rewarded])]
        .filter((key) => progress[key] >= 1)
    return { date: a.date, progress, rewarded }
}

/** 旧客户端可能只提交成长字段：成就与任务必须与库内状态合并，不能直接覆盖 */
function mergePetStates(existing, incoming) {
    const next = normalizePetState(incoming)
    if (!existing) return next
    const current = normalizePetState(existing)
    if (next.stateVersion < current.stateVersion) return current
    if (next.stateVersion > current.stateVersion) return next
    return {
        ...next,
        stateVersion: current.stateVersion,
        unlockedAchievements: [
            ...new Set([
                ...current.unlockedAchievements,
                ...next.unlockedAchievements
            ])
        ],
        celebratedAchievements: [
            ...new Set([
                ...current.celebratedAchievements,
                ...next.celebratedAchievements
            ])
        ],
        dailyTasks: mergeDailyTaskStates(
            current.dailyTasks,
            next.dailyTasks
        )
    }
}

const homesteadPlotEventAt = (plot) =>
    Math.max(plot.plantedAt, plot.wateredAt, plot.fertilizedAt)

function mergeHomesteadPlots(local, remote) {
    return Array.from({ length: HOMESTEAD_PLOT_COUNT }, (_, index) => {
        const a = local.plots[index] || emptyHomesteadPlot()
        const b = remote.plots[index] || emptyHomesteadPlot()
        if (!a.cropId && !b.cropId) return emptyHomesteadPlot()
        if (!a.cropId || !b.cropId) {
            const planted = a.cropId ? a : b
            const plantedState = a.cropId ? local : remote
            const emptyState = a.cropId ? remote : local
            return emptyState.totals.harvests >
                plantedState.totals.harvests &&
                emptyState.updatedAt >= homesteadPlotEventAt(planted)
                ? emptyHomesteadPlot()
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
    })
}

function mergeHomesteadOrders(local, remote) {
    if (local.ordersDay !== remote.ordersDay) {
        return local.ordersDay > remote.ordersDay
            ? { ordersDay: local.ordersDay, orders: local.orders }
            : { ordersDay: remote.ordersDay, orders: remote.orders }
    }
    if (!local.orders.length) {
        return { ordersDay: remote.ordersDay, orders: remote.orders }
    }
    if (!remote.orders.length) {
        return { ordersDay: local.ordersDay, orders: local.orders }
    }
    const localOrders = new Map(local.orders.map((order) => [order.id, order]))
    return {
        ordersDay: local.ordersDay,
        orders: remote.orders.map((order) => ({
            ...order,
            completedAt: Math.max(
                order.completedAt,
                localOrders.get(order.id)?.completedAt || 0
            )
        }))
    }
}

const isFreshHomesteadState = (state) =>
    state.plots.every((plot) => !plot.cropId) &&
    HOMESTEAD_ITEM_IDS.every((id) => state.inventory[id] === 0) &&
    state.seedStock.radish === 4 &&
    state.seedStock.tomato === 3 &&
    state.seedStock.corn === 2 &&
    state.seedStock.strawberry === 1 &&
    state.coins === 80 &&
    Object.values(state.totals).every((value) => value === 0) &&
    state.autoHelp.total === 0

/** 小院快照合并：版本优先，同版本保留两端更高的资源进度 */
function mergeHomesteadStates(existing, incoming) {
    const a = normalizeHomesteadState(existing)
    const b = normalizeHomesteadState(incoming)
    if (!a) return b
    if (!b) return a
    if (a.stateVersion !== b.stateVersion) {
        return a.stateVersion > b.stateVersion ? a : b
    }
    const newer = b.updatedAt >= a.updatedAt ? b : a
    const localFresh = isFreshHomesteadState(a)
    const remoteFresh = isFreshHomesteadState(b)
    const economicSource = localFresh && !remoteFresh ? b : a
    const otherEconomicSource = economicSource === a ? b : a
    const inventory = {}
    for (const id of HOMESTEAD_ITEM_IDS) {
        inventory[id] = localFresh !== remoteFresh
            ? economicSource.inventory[id]
            : Math.max(
                otherEconomicSource.inventory[id],
                economicSource.inventory[id]
            )
    }
    const seedStock = {}
    for (const id of HOMESTEAD_CROP_IDS) {
        seedStock[id] = localFresh !== remoteFresh
            ? economicSource.seedStock[id]
            : Math.max(
                otherEconomicSource.seedStock[id],
                economicSource.seedStock[id]
            )
    }
    const orderState = mergeHomesteadOrders(a, b)
    const autoHelpDay = a.autoHelp.day >= b.autoHelp.day
        ? a.autoHelp.day
        : b.autoHelp.day
    const autoHelpSource = a.autoHelp.day === autoHelpDay
        ? a.autoHelp
        : b.autoHelp
    const animals = {}
    for (const id of HOMESTEAD_ANIMAL_IDS) {
        animals[id] = {
            lastProduceAt: Math.max(
                a.animals[id].lastProduceAt,
                b.animals[id].lastProduceAt
            ),
            lastManureAt: Math.max(
                a.animals[id].lastManureAt,
                b.animals[id].lastManureAt
            )
        }
    }
    return {
        plots: mergeHomesteadPlots(a, b),
        animals,
        lastFishedAt: Math.max(a.lastFishedAt, b.lastFishedAt),
        inventory,
        coins: localFresh !== remoteFresh
            ? economicSource.coins
            : Math.max(a.coins, b.coins),
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
        stateVersion: a.stateVersion,
        updatedAt: Math.max(a.updatedAt, b.updatedAt)
    }
}

async function savePetState(userId, payload) {
    const existing = await getPetState(userId)
    const state = mergePetStates(existing, payload)
    const dailyTaskState = state.dailyTasks.date
        ? JSON.stringify({
            progress: state.dailyTasks.progress,
            rewarded: state.dailyTasks.rewarded
        })
        : null
    await query(
        `INSERT INTO pet_state
         (user_id, pet_name, mood, satiety, intimacy, streak_days, last_visit_date,
          total_interactions, last_fed_at, last_greeting_date, first_visit_at,
          unlocked_achievements, celebrated_achievements, daily_task_date,
          daily_task_state, state_version, client_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            pet_name = VALUES(pet_name),
            mood = VALUES(mood),
            satiety = VALUES(satiety),
            intimacy = VALUES(intimacy),
            streak_days = VALUES(streak_days),
            last_visit_date = VALUES(last_visit_date),
            total_interactions = VALUES(total_interactions),
            last_fed_at = VALUES(last_fed_at),
            last_greeting_date = VALUES(last_greeting_date),
            first_visit_at = VALUES(first_visit_at),
            unlocked_achievements = VALUES(unlocked_achievements),
            celebrated_achievements = VALUES(celebrated_achievements),
            daily_task_date = VALUES(daily_task_date),
            daily_task_state = VALUES(daily_task_state),
            state_version = VALUES(state_version),
            client_updated_at = VALUES(client_updated_at)`,
        [
            userId,
            state.name,
            state.mood,
            state.satiety,
            state.intimacy,
            state.streakDays,
            state.lastVisitDate,
            state.totalInteractions,
            state.lastFedAt,
            state.lastGreetingDate,
            state.firstVisitAt,
            state.unlockedAchievements.length
                ? JSON.stringify(state.unlockedAchievements)
                : null,
            state.celebratedAchievements.length
                ? JSON.stringify(state.celebratedAchievements)
                : null,
            state.dailyTasks.date,
            dailyTaskState,
            state.stateVersion,
            state.updatedAt
        ]
    )
    return getPetState(userId)
}

async function getHomesteadState(userId) {
    const rows = await query(
        `SELECT homestead_state, homestead_version
         FROM pet_state WHERE user_id = ? LIMIT 1`,
        [userId]
    )
    const row = rows?.[0]
    if (!row || !row.homestead_state) return null
    const state = normalizeHomesteadState(row.homestead_state)
    if (!state) return null
    state.stateVersion = Math.max(
        state.stateVersion,
        safeTimestamp(row.homestead_version)
    )
    return state
}

async function saveHomesteadState(userId, payload) {
    const incoming = normalizeHomesteadState(payload)
    if (!incoming) return getHomesteadState(userId)
    const existing = await getHomesteadState(userId)
    const state = mergeHomesteadStates(existing, incoming)
    await query(
        `INSERT INTO pet_state
         (user_id, homestead_state, homestead_version)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
            homestead_state = VALUES(homestead_state),
            homestead_version = VALUES(homestead_version)`,
        [userId, JSON.stringify(state), state.stateVersion]
    )
    return state
}

module.exports = {
    getPetState,
    savePetState,
    normalizePetState,
    mergePetStates,
    mergeDailyTaskStates,
    getHomesteadState,
    saveHomesteadState,
    normalizeHomesteadState,
    mergeHomesteadStates
}
