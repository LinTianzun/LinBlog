const configErrors = []

const jwtSecret = process.env.LINBLOG_JWT_SECRET
if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    configErrors.push('LINBLOG_JWT_SECRET 必须设置为至少 32 个字符的随机值')
}

// CORS 白名单：必须显式配置精确来源（协议+域名+可选端口），不提供默认值
const allowedOriginsValue = process.env.LINBLOG_ALLOWED_ORIGINS
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

if (configErrors.length > 0) {
    throw new Error(`配置错误：\n- ${configErrors.join('\n- ')}\n请复制 serve/.env.example 为 serve/.env，并按部署环境填写变量。`)
}

const config = {
    port: Number.parseInt(process.env.LINBLOG_PORT || '3030', 10),
    database: {
        HOST: process.env.LINBLOG_DB_HOST || "localhost",
        USER: process.env.LINBLOG_DB_USER || "root",
        PASSWORD: process.env.LINBLOG_DB_PASSWORD || "",
        DB: process.env.LINBLOG_DB_NAME || "linlog"
    },
    allowedOrigins,
    jsonLimit: process.env.LINBLOG_JSON_LIMIT || '1mb',
    jwt: {
        secret: jwtSecret,
        expiresIn: '7D'
    }
}

module.exports = config
