const { query } = require('../../db/dbnew')

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAILY_TASK_KEYS = ['feed', 'publish', 'comment']
const ACHIEVEMENT_PATTERN = /^[a-z][a-z0-9_-]{0,31}:\d{1,6}$/

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
        updatedAt: safeTimestamp(payload.updatedAt)
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
    daily_task_state, client_updated_at
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
    return {
        ...next,
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
          daily_task_state, client_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            state.updatedAt
        ]
    )
    return getPetState(userId)
}

module.exports = {
    getPetState,
    savePetState,
    normalizePetState,
    mergePetStates,
    mergeDailyTaskStates
}
