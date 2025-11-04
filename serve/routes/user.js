const userController = require('../controller/userController')
const { authMiddleware } = require('../middleware/auth')    //  引入中间件

//  导出路由处理接口
module.exports = (app) => {
    //  无需登录的接口（直接挂载到路由实例）
    //  判断是否注册(GET请求，通过用户名查询)
    app.get('/api/user/isRegistered', userController.isRegistered)

    //  注册接口（POST）
    app.post('/api/user/register', userController.register)

    //  登录接口（POST）
    app.post('/api/user/login', userController.login)

    //  测试接口（POST）
    app.post('/api/user/test', authMiddleware, userController.login)
}