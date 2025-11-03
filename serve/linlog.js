const express = require('express')
const cors = require('cors')
const path = require('path') // 新增path模块
const app = express()
const config = require('./config/default')
const db = require('./model/db/dbnew')

// 1. 配置跨域
app.use(cors({
    origin: config.allowedOrigins, // 从配置文件获取允许的域名
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept'],
    credentials: true, // 仅在需要携带认证信息时保留
    methods: ['PUT', 'POST', 'GET', 'DELETE', 'OPTIONS'],
    preflightContinue: false,
    optionsSuccessStatus: 200
}))

// 2. 解析请求体
app.use(express.json())

// 3. 托管静态文件
app.use(express.static(path.join(__dirname, 'data')))

// 4. 自定义响应头（仅保留必要的）
app.use((req, res, next) => {
    res.header("X-Powered-By", "3.2.1") // 可选，可删除
    next()
})

// 5. 引入路由
require('./routes/index')(app)

// 错误处理中间件（放在所有路由之后）
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: '服务器内部错误' });
});

// 等待数据库初始化后启动服务
db.initDatabase()
    .then(() => {
        const port = config.port;
        app.listen(port, () => {
            console.log(`[Server] 服务已启动，访问地址：http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.error('[Server] 数据库初始化失败，服务无法启动：', err);
        process.exit(1);
    });