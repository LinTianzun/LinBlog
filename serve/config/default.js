const configErrors = []

const jwtSecret = process.env.LINBLOG_JWT_SECRET
if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    configErrors.push('LINBLOG_JWT_SECRET 必须设置为至少 32 个字符的随机值')
}

// Railway 会自动注入公开域名；单服务部署时可直接作为前端同源地址。
const railwayPublicDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
const railwayPublicOrigin = railwayPublicDomain ? `https://${railwayPublicDomain}` : ''

// CORS 白名单：必须显式配置精确来源（协议+域名+可选端口），不提供通用默认值
const allowedOriginsValue = process.env.LINBLOG_ALLOWED_ORIGINS || railwayPublicOrigin
const allowedOrigins = typeof allowedOriginsValue === 'string'
    ? allowedOriginsValue.split(',').map((origin) => origin.trim()).filter(Boolean)
    : []

if (allowedOrigins.length === 0) {
    configErrors.push('LINBLOG_ALLOWED_ORIGINS 必须设置为逗号分隔的前端来源列表，例如 http://localhost:5173')
} else {
    const invalidOrigins = allowedOrigins.filter((origin) => {
        try {
            const parsed = new URL(origin)
            return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin
        } catch {
            return true
        }
    })

    if (invalidOrigins.length > 0) {
        configErrors.push(`LINBLOG_ALLOWED_ORIGINS 包含无效来源：${invalidOrigins.join(', ')}。请填写完整的 http(s) 来源，不要添加路径或尾部斜杠`)
    }
}

// 反向代理部署时必须开启，否则 req.ip 会拿到代理 IP，浏览量与访问记录全部落到同一来源
const trustProxyValue = process.env.LINBLOG_TRUST_PROXY
let trustProxy = false
if (typeof trustProxyValue === 'string' && trustProxyValue.trim() !== '') {
    const raw = trustProxyValue.trim()
    if (raw === 'true' || raw === 'false') {
        trustProxy = raw === 'true'
    } else if (/^\d+$/.test(raw)) {
        trustProxy = Number.parseInt(raw, 10)
    } else if (['loopback', 'linklocal', 'uniquelocal'].includes(raw)) {
        trustProxy = raw
    } else {
        configErrors.push('LINBLOG_TRUST_PROXY 仅支持 true/false、正整数或 loopback/linklocal/uniquelocal')
    }
}

const publicUrl = (process.env.LINBLOG_PUBLIC_URL || allowedOrigins[0] || '').replace(/\/+$/, '')
if (publicUrl) {
    try {
        const parsed = new URL(publicUrl)
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== publicUrl) {
            configErrors.push('LINBLOG_PUBLIC_URL 必须是完整的 http(s) 来源，不要添加路径或尾部斜杠')
        }
    } catch {
        configErrors.push('LINBLOG_PUBLIC_URL 必须是完整的 http(s) 来源')
    }
}

const smtp = {
    host: process.env.LINBLOG_SMTP_HOST || '',
    port: Number.parseInt(process.env.LINBLOG_SMTP_PORT || '587', 10),
    secure: process.env.LINBLOG_SMTP_SECURE === 'true',
    user: process.env.LINBLOG_SMTP_USER || '',
    password: process.env.LINBLOG_SMTP_PASSWORD || '',
    from: process.env.LINBLOG_SMTP_FROM || process.env.LINBLOG_SMTP_USER || '',
}

if (smtp.host && (!smtp.from || !Number.isInteger(smtp.port) || smtp.port < 1 || smtp.port > 65535)) {
    configErrors.push('配置 SMTP 时 LINBLOG_SMTP_FROM 必填，LINBLOG_SMTP_PORT 必须是 1-65535 的整数')
}

if (configErrors.length > 0) {
    throw new Error(`配置错误：\n- ${configErrors.join('\n- ')}\n请复制 serve/.env.example 为 serve/.env，并按部署环境填写变量。`)
}

const port = Number.parseInt(process.env.PORT || process.env.LINBLOG_PORT || '3030', 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    configErrors.push('PORT 或 LINBLOG_PORT 必须是 1-65535 的整数')
}

const databasePort = Number.parseInt(
    process.env.LINBLOG_DB_PORT || process.env.MYSQLPORT || '3306',
    10
)
if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
    configErrors.push('LINBLOG_DB_PORT 或 MYSQLPORT 必须是 1-65535 的整数')
}

if (configErrors.length > 0) {
    throw new Error(`配置错误：\n- ${configErrors.join('\n- ')}\n请复制 serve/.env.example 为 serve/.env，并按部署环境填写变量。`)
}

const config = {
    port,
    database: {
        HOST: process.env.LINBLOG_DB_HOST || process.env.MYSQLHOST || "localhost",
        PORT: databasePort,
        USER: process.env.LINBLOG_DB_USER || process.env.MYSQLUSER || "root",
        PASSWORD: process.env.LINBLOG_DB_PASSWORD || process.env.MYSQLPASSWORD || "",
        DB: process.env.LINBLOG_DB_NAME || process.env.MYSQLDATABASE || "linlog"
    },
    allowedOrigins,
    trustProxy,
    publicUrl,
    smtp,
    jsonLimit: process.env.LINBLOG_JSON_LIMIT || '1mb',
    jwt: {
        secret: jwtSecret,
        expiresIn: '7D'
    }
}

module.exports = config
