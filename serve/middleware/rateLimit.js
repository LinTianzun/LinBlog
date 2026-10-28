/**
 * 轻量内存限流：单实例部署足够；命中时返回 429 并附带 Retry-After。
 * 多实例部署时应替换为共享存储（如 Redis）实现。
 */
function createRateLimit({ windowMs, max, keyGenerator, message = '请求过于频繁，请稍后再试' }) {
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

        const key = String(keyGenerator(req))
        const bucket = buckets.get(key)
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('RateLimit-Limit', String(max))

        if (!bucket || bucket.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs })
            res.setHeader('RateLimit-Remaining', String(Math.max(0, max - 1)))
            res.setHeader('RateLimit-Reset', String(Math.ceil(windowMs / 1000)))
            return next()
        }

        bucket.count += 1
        if (bucket.count > max) {
            const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
            res.setHeader('Retry-After', String(retryAfter))
            res.setHeader('RateLimit-Remaining', '0')
            res.setHeader('RateLimit-Reset', String(retryAfter))
            return res.status(429).json({
                code: 429,
                message,
                requestId: req.requestId || undefined,
            })
        }
        res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
        res.setHeader('RateLimit-Reset', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
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

function userOrIpKey(req) {
    const userId = Number(req.user?.userId)
    return Number.isSafeInteger(userId) && userId > 0
        ? `user:${userId}`
        : `ip:${ipKey(req)}`
}

const apiWriteLimit = createRateLimit({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: userOrIpKey,
    message: '写请求过于频繁，请稍后再试',
})

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
function writeMethodLimit(req, res, next) {
    if (!WRITE_METHODS.has(req.method)) return next()
    return apiWriteLimit(req, res, next)
}

const passwordResetRequestLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: ipKey,
    message: '密码重置申请过于频繁，请稍后再试',
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
    message: '登录尝试过于频繁，请稍后再试',
})

const loginIpLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    keyGenerator: ipKey,
    message: '当前网络登录尝试过于频繁，请稍后再试',
})

const registerLimit = createRateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: ipKey,
    message: '注册请求过于频繁，请稍后再试',
})

const commentWriteLimit = createRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: userOrIpKey,
    message: '评论过于频繁，请稍后再试',
})

const reportLimit = createRateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: userOrIpKey,
    message: '举报过于频繁，请稍后再试',
})

const interactionLimit = createRateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: userOrIpKey,
    message: '互动操作过于频繁，请稍后再试',
})

const uploadLimit = createRateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: userOrIpKey,
    message: '上传过于频繁，请稍后再试',
})

const uploadTicketLimit = createRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: userOrIpKey,
    message: '上传票据申请过于频繁，请稍后再试',
})

const publicMessageLimit = createRateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyGenerator: userOrIpKey,
    message: '留言过于频繁，请稍后再试',
})

module.exports = {
    createRateLimit,
    ipKey,
    mailAndIpKey,
    userOrIpKey,
    writeMethodLimit,
    apiWriteLimit,
    passwordResetRequestLimit,
    passwordResetSubmitLimit,
    loginLimit,
    loginIpLimit,
    registerLimit,
    commentWriteLimit,
    reportLimit,
    interactionLimit,
    uploadLimit,
    uploadTicketLimit,
    publicMessageLimit,
}
