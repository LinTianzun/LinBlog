const userController = require('../controller/userController')
const { authMiddleware } = require('../middleware/auth')    //  引入中间件

//  导出路由处理接口
module.exports = (app) => {
    //  无需登录的接口（直接访问）
    //  判断是否注册(GET请求，通过用户名查询)
    app.get('/api/user/isRegistered', userController.isRegistered)

    //  注册接口（POST）
    app.post('/api/user/register', userController.register)

    //  登录接口（POST）
    app.post('/api/user/login', userController.login)

    //  需要登录的接口（添加 Token 校验中间件）
    //  获取用户信息根据id（POST）
    app.post('/api/user/userInfo', authMiddleware, userController.getUserInfo)

    //  获取所有的用户信息 用作用户管理（POST）
    app.post('/api/user/allUser', authMiddleware, userController.getAllUsers)
}