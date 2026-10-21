const jwtSecret = process.env.LINBLOG_JWT_SECRET

if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    throw new Error(
        '配置错误：请在 serve/.env 中设置至少 32 个字符的随机 LINBLOG_JWT_SECRET。'
    )
}

const config = {
    port: 3030,
    database: {
        HOST: "localhost",
        USER: "root",
        PASSWORD: process.env.LINBLOG_DB_PASSWORD || "",
        DB: "linlog"
    },
    jwt: {
        secret: jwtSecret,
        expiresIn: '7D'
    }
}

module.exports = config