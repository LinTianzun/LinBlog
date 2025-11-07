const messageController = require('../controller/messageController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 所有消息接口均需登录
    app.use(authMiddleware)

    //  发送消息
    app.post('/api/message', messageController.sendMessage)

    //  收件箱查询
    app.get('/api/message/inbox', messageController.getInBox)

    //  发件箱查询
    app.get('/api/message/outbox', messageController.getOutBox)

    //  标记消息已读
    app.patch('/api/message/read', messageController.markAdRead)

    //  删除消息
    app.delete('/api/message/:id', messageController.deleteMessage)

    //  查询未读消息数量
    app.get('/api/message/unread/count', messageController.getUnreadCount)
}
