const express = require('express')
const cors = require('cors')
const path = require('path')
const app = express()
const config = require('./config/default')
const db = require('./model/db/dbnew')

const corsOptions = {
    origin: config.allowedOrigins,
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204
}

// cors() handles OPTIONS preflight requests before the API routes.
app.use(cors(corsOptions))

app.use(express.json())
app.use(express.static(path.join(__dirname, 'data')))

app.use((req, res, next) => {
    res.header('X-Powered-By', '3.2.1')
    next()
})

require('./routes/index')(app)

app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({ message: '服务器内部错误' })
})

// 等待数据库初始化后启动服务
db.initDatabase()
    .then(() => {
        const port = config.port
        app.listen(port, () => {
            console.log(`[Server] 服务已启动，访问地址：http://localhost:${port}`)
            console.log(`[Server] CORS 允许来源：${config.allowedOrigins.join(', ')}`)
        })
    })
    .catch((err) => {
        console.error('[Server] 数据库初始化失败，服务无法启动：', err)
        process.exit(1)
    })
