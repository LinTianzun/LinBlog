/**
 * 统一的结构化日志出口：所有日志都是单行 JSON，
 * 便于 Railway / Docker 直接按行采集并按 level 过滤。
 */
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const SENSITIVE_KEYS = new Set([
    'authorization',
    'cookie',
    'password',
    'newpassword',
    'oldpassword',
    'token',
    'secret',
    'api_key',
    'apikey'
])

function currentLevel() {
    const configured = String(process.env.LINBLOG_LOG_LEVEL || '').trim().toLowerCase()
    return configured in LOG_LEVELS ? configured : 'info'
}

function redact(value) {
    if (Array.isArray(value)) return value.map(item => redact(item))
    if (!value || typeof value !== 'object') return value
    const result = {}
    for (const [key, item] of Object.entries(value)) {
        result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? 'REDACTED' : redact(item)
    }
    return result
}

function emit(level, message, meta = null, error = null) {
    // 只接受普通对象作为 meta；字符串/数组/错误都被归入 context，
    // 避免调用方把上下文值误当成错误对象传进来时丢字段。
    let context = meta
    if (meta && typeof meta === 'object' && !Array.isArray(meta) && !(meta instanceof Error)) {
        context = meta
    } else if (meta != null) {
        context = { value: meta }
    }
    if (error && !(error instanceof Error) && typeof error !== 'object' && error != null) {
        error = new Error(String(error))
    }

    const payload = {
        time: new Date().toISOString(),
        level,
        message: String(message || ''),
    }
    if (context) payload.meta = redact(context)
    if (error) {
        payload.error = {
            name: error?.name || 'Error',
            code: error?.code || error?.type || null,
            message: error?.message || String(error),
        }
        if (level === 'error') payload.error.stack = error?.stack || null
    }

    const line = JSON.stringify(payload)
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
}

function enabled(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel()]
}

const logger = {
    debug(message, meta = null) {
        if (enabled('debug')) emit('debug', message, meta)
    },
    info(message, meta = null) {
        if (enabled('info')) emit('info', message, meta)
    },
    warn(message, meta = null, error = null) {
        if (enabled('warn')) emit('warn', message, meta, error)
    },
    error(message, meta = null, error = null) {
        if (enabled('error')) emit('error', message, meta, error)
    },
}

module.exports = { logger, redact }
