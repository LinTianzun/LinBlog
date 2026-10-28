/**
 * 轻量内存限流：单实例部署足够；命中时返回 429 并附带 Retry-After。
 * 多实例部署时应替换为共享存储（如 Redis）实现。
 */
function createRateLimit({ windowMs, max, keyGenerator }) {
    const buckets = new Map()
    let lastCleanup = Date.now()

    return function rateLimit(req, res, next) {
        const now = Date.now()
        if (now - lastCleanup > windowMs) {
            for (const [key, bucket] of buckets) {
                if (bucket.resetAt <= now) buckets.delete(key)
            }
            lastCleanup = now
        }

        const key = keyGenerator(req)
        const bucket = buckets.get(key)

        if (!bucket || bucket.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs })
            return next()
        }

        bucket.count += 1
        if (bucket.count > max) {
            res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
            return res.status(429).json({
                code: 429,
                message: '请求过于频繁，请稍后再试',
            })
        }
        return next()
    }
}

function ipKey(req) {
    return req.ip || req.socket?.remoteAddress || 'unknown'
}

function mailAndIpKey(req) {
    const mail = typeof req.body?.mail === 'string' ? req.body.mail.trim().toLowerCase() : ''
    return `${ipKey(req)}|${mail}`
}

const passwordResetRequestLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: ipKey,
})

const passwordResetSubmitLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: ipKey,
})

const loginLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyGenerator: mailAndIpKey,
})

module.exports = {
    createRateLimit,
    passwordResetRequestLimit,
    passwordResetSubmitLimit,
    loginLimit,
}
