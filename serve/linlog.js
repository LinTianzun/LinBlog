const { loadEnvFile } = require('node:process')
const path = require('path')

loadEnvFile(path.join(__dirname, '.env'))

const express = require('express')
const cors = require('cors')
const app = express()
const config = require('./config/default')
const db = require('./model/db/dbnew')
const { normalizeJsonBody } = require('./middleware/normalizeBody')
const recordMiddleware = require('./middleware/record')
const { startRecordRetention } = require('./utils/recordRetention')
const { startFileLifecycle } = require('./utils/fileLifecycle')

// 1. 配置跨域（OPTIONS 预检在进入 API 路由前由 cors 中间件处理）
const corsOptions = {
    origin: config.allowedOrigins, // 从配置文件获取允许的域名
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: true, // 仅在需要携带认证信息时保留
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}
app.use(cors(corsOptions))

// 2. 解析请求体
app.use(express.json({ limit: config.jsonLimit }))
app.use(normalizeJsonBody)

// 4. 记录 API 访问（登录后接口与公开接口，异步写入不阻塞请求）
app.use(recordMiddleware)

// 5. 托管静态文件
app.use(express.static(path.join(__dirname, 'data')))

// 6. 自定义响应头（仅保留必要的）
app.use((req, res, next) => {
    res.header("X-Powered-By", "3.2.1") // 可选，可删除
    next()
})

// 7. 引入路由
require('./routes/index')(app)

// 错误处理中间件（放在所有路由之后）
app.use((err, req, res, next) => {
    console.error(err.stack);

    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            code: 413,
            message: '请求体过大'
        });
    }

    res.status(500).json({
        code: 500,
        message: '服务器内部错误'
    });
});

// 等待数据库初始化后启动服务
db.initDatabase()
    .then(() => {
        const port = config.port;
        app.listen(port, () => {
            console.log(`[Server] 服务已启动，访问地址：http://localhost:${port}`);
            // 访问记录按保留期滚动清理，避免 record 表无限增长
            startRecordRetention();
            // 文件备份按保留期清理，并回收数据库已无引用的磁盘孤儿文件
            startFileLifecycle();
        });
    })
    .catch((err) => {
        console.error('[Server] 数据库初始化失败，服务无法启动：', err);
        process.exit(1);
    });
