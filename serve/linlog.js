const { loadEnvFile } = require('node:process')
const fs = require('node:fs')
const path = require('path')

loadEnvFile(path.join(__dirname, '.env'))

const express = require('express')
const cors = require('cors')
const app = express()
const config = require('./config/default')
const db = require('./model/db/dbnew')
const { normalizeJsonBody } = require('./middleware/normalizeBody')
const recordMiddleware = require('./middleware/record')
const {
    requestContext,
    securityHeaders,
    permissionsPolicy,
    createRequestLogger,
} = require('./middleware/security')
const { writeMethodLimit } = require('./middleware/rateLimit')
const { notFoundHandler, createErrorHandler } = require('./middleware/errorHandler')
const { startRecordRetention } = require('./utils/recordRetention')
const { startFileLifecycle } = require('./utils/fileLifecycle')
const { startScheduledBackup } = require('./utils/dbBackup')
const { createGracefulShutdown } = require('./utils/gracefulShutdown')
const { refreshPermissionCache } = require('./utils/accessControl')
const { isSpaFallbackRequest } = require('./utils/frontendStatic')

app.disable('x-powered-by')

// 反向代理部署时按配置信任代理头，保证 req.ip 是真实客户端 IP
if (config.trustProxy !== false) {
    app.set('trust proxy', config.trustProxy)
}

// 1. 请求标识、安全响应头与脱敏访问日志
app.use(requestContext)
app.use(securityHeaders())
app.use(permissionsPolicy)
app.use(createRequestLogger())

// 2. 配置跨域（OPTIONS 预检在进入 API 路由前由 cors 中间件处理）
const corsOptions = {
    origin: config.allowedOrigins, // 从配置文件获取允许的域名
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: true, // 仅在需要携带认证信息时保留
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}
app.use(cors(corsOptions))

// 3. 解析请求体
app.use(express.json({ limit: config.jsonLimit }))
app.use(normalizeJsonBody)

// Railway / 容器平台健康检查
app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' })
})

// 4. 所有 API 写请求先经过全局兜底限流，敏感接口再叠加分路由限流
app.use('/api', writeMethodLimit)

// 5. 记录 API 访问（登录后接口与公开接口，异步写入不阻塞请求）
app.use(recordMiddleware)

// 6. 托管静态文件
app.use(express.static(path.join(__dirname, 'data')))

// 7. 引入路由
require('./routes/index')(app)

// 8. 生产环境中由 Express 托管 Vite 构建产物，前后端共享同一个域名
const frontendDist = path.resolve(
    process.env.LINBLOG_FRONTEND_DIST || path.join(__dirname, '..', 'lin_blog', 'dist')
)
const frontendIndex = path.join(frontendDist, 'index.html')

if (fs.existsSync(frontendIndex)) {
    app.use(express.static(frontendDist, {
        index: false,
        // dist/portal is an asset directory, but /portal is also a Vue route.
        // Disable directory redirects so /portal reaches the SPA fallback.
        redirect: false,
        setHeaders(res, filePath) {
            if (filePath.includes(`${path.sep}assets${path.sep}`)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            } else {
                res.setHeader('Cache-Control', 'no-cache')
            }
        },
    }))

    app.use((req, res, next) => {
        if (!isSpaFallbackRequest(req)) return next()
        res.setHeader('Cache-Control', 'no-cache')
        res.sendFile(frontendIndex, (err) => {
            if (err) next(err)
        })
    })
} else if (process.env.NODE_ENV === 'production') {
    console.warn(`[Server] 未找到前端构建产物：${frontendIndex}`)
}

// 9. 统一 404 与异常响应
app.use(notFoundHandler)
app.use(createErrorHandler())

// 等待数据库初始化后启动服务
db.initDatabase()
    .then(async () => {
        await refreshPermissionCache();
        const port = config.port;
        const server = app.listen(port, () => {
            console.log(`[Server] 服务已启动，访问地址：http://localhost:${port}`);
            // 访问记录按保留期滚动清理，避免 record 表无限增长
            const recordRetention = startRecordRetention();
            // 文件备份按保留期清理，并回收数据库已无引用的磁盘孤儿文件
            const fileLifecycle = startFileLifecycle();
            // 数据库定时备份：图片以 BLOB 存在库里，必须单独备份数据库本体
            const databaseBackup = startScheduledBackup();

            const shutdown = createGracefulShutdown({
                server,
                cleanupTasks: [
                    () => recordRetention.stop(),
                    () => fileLifecycle.stop(),
                    () => databaseBackup.stop(),
                ],
                closeDatabase: db.closeDatabase,
            })

            process.once('SIGINT', () => void shutdown('SIGINT'))
            process.once('SIGTERM', () => void shutdown('SIGTERM'))
            process.once('uncaughtException', (err) => {
                console.error('[Server] 未捕获异常：', err)
                void shutdown('uncaughtException', err)
            })
            process.on('unhandledRejection', (reason) => {
                const err = reason instanceof Error ? reason : new Error(String(reason))
                console.error('[Server] 未处理的 Promise 拒绝：', err)
                void shutdown('unhandledRejection', err)
            })
        });
    })
    .catch((err) => {
        console.error('[Server] 数据库初始化失败，服务无法启动：', err);
        process.exit(1);
    });
