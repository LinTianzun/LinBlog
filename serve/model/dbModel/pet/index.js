const { query } = require('../../db/dbnew')

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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

function normalizePetState(payload = {}) {
    return {
        mood: clampInt(payload.mood, 0, 100, 70),
        satiety: clampInt(payload.satiety, 0, 100, 60),
        intimacy: clampInt(payload.intimacy, 0, 100, 10),
        streakDays: clampInt(payload.streakDays, 0, 36500, 0),
        lastVisitDate: normalizeDate(payload.lastVisitDate),
        totalInteractions: clampInt(payload.totalInteractions, 0, 1_000_000_000, 0),
        lastFedAt: safeTimestamp(payload.lastFedAt),
        lastGreetingDate: normalizeDate(payload.lastGreetingDate),
        firstVisitAt: safeTimestamp(payload.firstVisitAt),
        updatedAt: safeTimestamp(payload.updatedAt)
    }
}

const toCamelState = (row) => ({
    mood: Number(row.mood || 0),
    satiety: Number(row.satiety || 0),
    intimacy: Number(row.intimacy || 0),
    streakDays: Number(row.streak_days || 0),
    lastVisitDate: row.last_visit_date || '',
    totalInteractions: Number(row.total_interactions || 0),
    lastFedAt: Number(row.last_fed_at || 0),
    lastGreetingDate: row.last_greeting_date || '',
    firstVisitAt: Number(row.first_visit_at || 0),
    updatedAt: Number(row.client_updated_at || 0)
})

const SELECT_FIELDS = `
    mood, satiety, intimacy, streak_days,
    DATE_FORMAT(last_visit_date, '%Y-%m-%d') AS last_visit_date,
    total_interactions, last_fed_at,
    DATE_FORMAT(last_greeting_date, '%Y-%m-%d') AS last_greeting_date,
    first_visit_at, client_updated_at
`

async function getPetState(userId) {
    const rows = await query(
        `SELECT ${SELECT_FIELDS} FROM pet_state WHERE user_id = ? LIMIT 1`,
        [userId]
    )
    return rows?.[0] ? toCamelState(rows[0]) : null
}

async function savePetState(userId, payload) {
    const state = normalizePetState(payload)
    await query(
        `INSERT INTO pet_state
         (user_id, mood, satiety, intimacy, streak_days, last_visit_date,
          total_interactions, last_fed_at, last_greeting_date, first_visit_at,
          client_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            mood = VALUES(mood),
            satiety = VALUES(satiety),
            intimacy = VALUES(intimacy),
            streak_days = VALUES(streak_days),
            last_visit_date = VALUES(last_visit_date),
            total_interactions = VALUES(total_interactions),
            last_fed_at = VALUES(last_fed_at),
            last_greeting_date = VALUES(last_greeting_date),
            first_visit_at = VALUES(first_visit_at),
            client_updated_at = VALUES(client_updated_at)`,
        [
            userId,
            state.mood,
            state.satiety,
            state.intimacy,
            state.streakDays,
            state.lastVisitDate,
            state.totalInteractions,
            state.lastFedAt,
            state.lastGreetingDate,
            state.firstVisitAt,
            state.updatedAt
        ]
    )
    return getPetState(userId)
}

module.exports = {
    getPetState,
    savePetState,
    normalizePetState
}
