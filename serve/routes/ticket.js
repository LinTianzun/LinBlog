const ticketController = require('../controller/ticketController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 上传票据：需登录才能换取，票据本身不含身份信息
    app.post('/api/upload/ticket', authMiddleware, ticketController.createUploadTicket)
}
