const ticketController = require('../controller/ticketController')
const { authMiddleware } = require('../middleware/auth')
const { uploadTicketLimit } = require('../middleware/rateLimit')

module.exports = (app) => {
    // 上传票据：需登录才能换取，票据本身不含身份信息
    app.post('/api/upload/ticket', authMiddleware, uploadTicketLimit, ticketController.createUploadTicket)
}
