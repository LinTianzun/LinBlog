const crypto = require('node:crypto')
const helmet = require('helmet')

const SENSITIVE_QUERY_KEYS = new Set([
    'access_token',
    'accesstoken',
    'api_key',
    'apikey',
    'auth',
    'authorization',
    'client_secret',
    'code',
    'email',
    'id_token',
    'jwt',
    'mail',
    'newpassword',
    'oldpassword',
    'password',
    'phone',
    'refresh_token',
    'refreshtoken',
    'secret',
    'session',
    'sessionid',
    'sig',
    'signature',
    'ticket',
    'token',
])

function redactUrl(rawUrl, base = 'http://localhost') {
    let parsed
    try {
        parsed = new URL(String(rawUrl || '/'), base)
    } catch {
        return '/[invalid-url]'
    }

    const safeParams = [...parsed.searchParams.entries()].map(([key, value]) => {
        const safeValue = SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) ? 'REDACTED' : value
        return `${encodeURIComponent(key)}=${encodeURIComponent(safeValue)}`
    })
    const search = safeParams.length ? `?${safeParams.join('&')}` : ''
    return `${parsed.pathname}${search}`.replace(/[\r\n\t]/g, '')
}

function maskIp(value) {
    const ip = String(value || '').trim()
    if (!ip) return '-'
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
        return ip.replace(/\.\d+$/, '.*')
    }
    if (ip.includes(':')) {
        const groups = ip.split(':').filter(Boolean)
        return `${groups.slice(0, 3).join(':') || '::'}:*`
    }
    return '*'
}

function requestContext(req, res, next) {
    const incoming = req.headers['x-request-id']
    const requestId = typeof incoming === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(incoming)
        ? incoming
        : crypto.randomUUID()

    req.requestId = requestId
    res.setHeader('X-Request-Id', requestId)
    next()
}

function securityHeaders() {
    const applyHelmet = helmet({
        // 后端不渲染页面；给可能被浏览器直接打开的响应也设置最小权限 CSP。
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'none'"],
                baseUri: ["'none'"],
                frameAncestors: ["'none'"],
                formAction: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        strictTransportSecurity: process.env.NODE_ENV === 'production'
            ? { maxAge: 15552000, includeSubDomains: true }
            : false,
    })

    return function applySecurityHeaders(req, res, next) {
        res.removeHeader('X-Powered-By')
        applyHelmet(req, res, next)
    }
}

function permissionsPolicy(req, res, next) {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
}

function createRequestLogger(options = {}) {
    const logger = options.logger || console
    const now = options.now || Date.now

    return function requestLogger(req, res, next) {
        const startedAt = now()

        res.once('finish', () => {
            const status = res.statusCode
            const message = [
                `[HTTP] ${req.requestId || '-'}`,
                req.method,
                redactUrl(req.originalUrl || req.url),
                status,
                `${Math.max(0, now() - startedAt)}ms`,
                `ip=${maskIp(req.ip || req.socket?.remoteAddress)}`,
                `user=${req.user?.userId ?? '-'}`,
            ].join(' ')

            if (status >= 500) logger.error(message)
            else if (status >= 400) logger.warn(message)
            else logger.info(message)
        })

        next()
    }
}

module.exports = {
    SENSITIVE_QUERY_KEYS,
    redactUrl,
    maskIp,
    requestContext,
    securityHeaders,
    permissionsPolicy,
    createRequestLogger,
}
