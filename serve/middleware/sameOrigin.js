const config = require('../config/default')

// CORS 已对浏览器请求做了来源白名单校验，但 curl/非浏览器客户端可以绕过 CORS。
// 对公开写操作（评论、举报、点赞、留言、浏览计数）叠加同源校验：
// 要求 Origin 或 Referer 命中已配置的允许来源，否则拒绝。
// 非浏览器请求（无 Origin 且无 Referer）允许放行，不影响 API 测试与内部调用。
// 延迟读取 allowedOrigins：测试可通过修改 config.allowedOrigins 动态控制允许集
function getAllowedSet() {
    return new Set(Array.isArray(config.allowedOrigins) ? config.allowedOrigins : [])
}

function originFromHeaders(req) {
    const origin = req.headers.origin
    if (origin) return origin
    const referer = req.headers.referer
    if (referer) {
        try {
            const parsed = new URL(referer)
            return parsed.origin
        } catch {
            return null
        }
    }
    return null
}

function sameOrigin(req, res, next) {
    const origin = originFromHeaders(req)
    // 无 Origin 且无 Referer：非浏览器请求，放行
    if (!origin) return next()
    if (getAllowedSet().has(origin)) return next()
    return res.status(403).json({
        code: 403,
        message: '请求来源不被允许',
        requestId: req.requestId || undefined,
    })
}

module.exports = { sameOrigin, originFromHeaders, getAllowedSet }
