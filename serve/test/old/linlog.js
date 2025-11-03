const express = require('express')
const cors = require('cors') // 引入cors
const app = express()
const config = require('./config/default')
const db = require('./model/db')

// 配置跨域（放在路由之前）
app.use(cors({
    origin: '*', // 允许所有域名跨域（对应 Access-Control-Allow-Origin: *）
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept'], // 允许的请求头
    credentials: true, // 允许携带认证信息（对应 Access-Control-Allow-Credentials: true）
    methods: ['PUT', 'POST', 'GET', 'DELETE', 'OPTIONS'], // 允许的请求方法
    preflightContinue: false, // 自动处理预检请求（无需手动处理OPTIONS）
    optionsSuccessStatus: 200 // 预检请求成功时返回200状态码
}))


// 手动设置Content-Type和X-Powered-By（cors中间件不处理这些非跨域相关头）
app.use((req, res, next) => {
    res.header("X-Powered-By", "3.2.1")
    res.header("Content-Type", "application/json;charset=utf-8")
    next()
})

//  express托管静态文件
app.use(express.static(__dirname + '/data'))

//  解析前端数据
app.use(express.json())

//  引入路由
require('./routes/index')(app)

app.listen(config.port, () => {
    console.log(`已启动端口 ${config.port}`)
})