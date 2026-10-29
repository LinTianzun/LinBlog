const messageController = require('../controller/messageController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')
const { publicMessageLimit } = require('../middleware/rateLimit')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    //  发送消息
    app.post('/api/message', authMiddleware, messageController.sendMessage)

    //  收件箱查询
    app.get('/api/message/inbox', authMiddleware, requirePermission('message.private'), messageController.getInBox)

    //  私信会话列表与单个会话（博主可看全部，其他账号只看与博主的会话）
    app.get('/api/message/conversations', authMiddleware, requirePermission('message.private'), messageController.getConversations)
    app.get('/api/message/conversation/:userId', authMiddleware, requirePermission('message.private'), messageController.getConversation)

    //  发件箱查询
    app.get('/api/message/outbox', authMiddleware, requirePermission('message.private'), messageController.getOutBox)

    //  标记消息已读
    app.patch('/api/message/read', authMiddleware, requirePermission('message.private'), messageController.markAdRead)

    //  删除消息
    app.delete('/api/message/:id', authMiddleware, requirePermission('message.private'), messageController.deleteMessage)

    //  查询未读消息数量
    app.get('/api/message/unread/count', authMiddleware, requirePermission('message.private'), messageController.getUnreadCount)

    // ===== 门户留言墙（公开）=====
    app.get('/api/portal/messages', messageController.getWallMessages)
    app.post('/api/portal/message', optionalAuthMiddleware, publicMessageLimit, messageController.createWallMessage)
}
