const jwtSecret = process.env.LINBLOG_JWT_SECRET

if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    throw new Error(
        '配置错误：请在 serve/.env 中设置至少 32 个字符的随机 LINBLOG_JWT_SECRET。'
    )
}

const allowedOrigins = (
    process.env.LINBLOG_ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173'
)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

const config = {
    port: 3030,
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
