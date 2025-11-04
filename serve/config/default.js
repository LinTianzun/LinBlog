const config = {
    port: 3030,
    database: {  //  连接数据库
        HOST: "localhost",
        USER: "root",
        PASSWORD: "302060dzl",
        DB: "linlog"
    },
    jwt: {
        secret: 'linzhiyu', // 密钥
        expiresIn: '24h' // Token 有效期（如 24小时）
    }
}

module.exports = config