const timeController = require('../controller/timeController')

module.exports = (app) => {
    // 公开接口：定时发布表单需要它在登录页之后即可用，且不含敏感信息
    app.get('/api/time/now', timeController.now)
}
