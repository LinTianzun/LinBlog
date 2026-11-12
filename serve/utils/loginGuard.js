// 内存态登录失败锁。默认不持久化：进程重启即解锁，不会扩大生产事故影响面。
const DEFAULT_MAX_FAILURES = 5
const DEFAULT_LOCK_MINUTES = 10

const attempts = new Map()

function normalizeAccount(account) {
    return String(account || '').trim().toLowerCase()
}

function getLimit() {
    const maxFailures = Number.parseInt(process.env.LINBLOG_LOGIN_MAX_FAILURES, 10)
    const lockMinutes = Number.parseInt(process.env.LINBLOG_LOGIN_LOCK_MINUTES, 10)
    return {
        maxFailures: Number.isFinite(maxFailures) && maxFailures > 0 ? maxFailures : DEFAULT_MAX_FAILURES,
        lockMinutes: Number.isFinite(lockMinutes) && lockMinutes > 0 ? lockMinutes : DEFAULT_LOCK_MINUTES,
    }
}

function isLocked(account, now = Date.now()) {
    const key = normalizeAccount(account)
    if (!key) return { locked: false }

    const record = attempts.get(key)
    if (!record) return { locked: false }

    const { maxFailures, lockMinutes } = getLimit()
    if (now >= record.lockedUntil) {
        if (record.lockedUntil) attempts.delete(key)
        return { locked: false }
    }

    const remainingSeconds = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000))
    return {
        locked: true,
        remainingSeconds,
        failures: Number(record.failures || 0),
        maxFailures,
        lockMinutes,
    }
}

function recordFailure(account, now = Date.now()) {
    const key = normalizeAccount(account)
    if (!key) return { failures: 0, locked: false }

    const { maxFailures, lockMinutes } = getLimit()
    const previous = attempts.get(key)
    const failures = (previous && !previous.lockedUntil ? previous.failures : 0) + 1
    const thresholdReached = failures >= maxFailures

    attempts.set(key, {
        failures,
        lockedUntil: thresholdReached ? now + lockMinutes * 60 * 1000 : 0,
    })

    return {
        failures,
        maxFailures,
        locked: thresholdReached,
        lockMinutes,
    }
}

function recordSuccess(account) {
    attempts.delete(normalizeAccount(account))
}

function reset() {
    attempts.clear()
}

module.exports = {
    isLocked,
    recordFailure,
    recordSuccess,
    reset,
    DEFAULT_MAX_FAILURES,
    DEFAULT_LOCK_MINUTES,
}
