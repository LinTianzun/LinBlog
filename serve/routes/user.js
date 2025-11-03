const userController = require('../controller/userController')

//  导出路由处理接口
module.exports = (app) => {
    //  判断是否注册(GET请求，通过用户名查询)
    app.get('/api/user/isRegistered', userController.isRegistered)

    //  注册接口（POST）
    app.post('/api/user/register', userController.register)

    //  登录接口（POST）
    app.post('/api/user/login', userController.login)
}