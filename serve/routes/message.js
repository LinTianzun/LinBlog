const messageController = require('../controller/messageController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    //  发送消息
    app.post('/api/message', authMiddleware, messageController.sendMessage)

    //  收件箱查询
    app.get('/api/message/inbox', authMiddleware, messageController.getInBox)

    //  发件箱查询
    app.get('/api/message/outbox', authMiddleware, messageController.getOutBox)

    //  标记消息已读
    app.patch('/api/message/read', authMiddleware, messageController.markAdRead)

    //  删除消息
    app.delete('/api/message/:id', authMiddleware, messageController.deleteMessage)

    //  查询未读消息数量
    app.get('/api/message/unread/count', authMiddleware, messageController.getUnreadCount)

    // ===== 门户留言墙（公开）=====
    app.get('/api/portal/messages', messageController.getWallMessages)
    app.post('/api/portal/message', optionalAuthMiddleware, messageController.createWallMessage)
}
