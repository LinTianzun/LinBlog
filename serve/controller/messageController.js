const messageModel = require('../model/dbModel/message/index')
const { formatPaginationParams } = require('../utils/paginationUtil')

/**
 * 发送消息
 */
async function sendMessage(req, res) {
    try {
        const { receiverId, type, content } = req.body
        const { userId, userType } = req.user

        //  参数校验
        if (!receiverId || !type || !content) {
            return res.status(400).json({ code: 400, message: '接收者ID、消息类型、消息内容不能为空' })
        }
        if (isNaN(receiverId)) {
            return res.status(400).json({ code: 400, message: '接收者ID必须是有效数字' });
        }
        if (!['system', 'private', 'notice'].includes(type)) {
            return res.status(400).json({ code: 400, message: '消息类型仅支持 system/private/notice' });
        }
        if (content.length > 512) {
            return res.status(400).json({ code: 400, message: '消息内容不能超过512字' });
        }

        // 权限控制：普通用户仅能发送private消息
        if (userType === 'normal' && type !== 'private') {
            return res.status(403).json({ code: 403, message: '普通用户仅能发送私信（private类型）' });
        }

        //  调用模型发送消息
        const result = await messageModel.insertMessage({ receiverId, type, content }, userId)

        res.status(201).json({
            code: 200,
            message: '消息发送成功',
            data: {
                messageId: result.messageId,
                createAt: new Date().toISOString()
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '消息发送失败：' + err.message })
    }
}

/**
 *  收件箱查询（分页+筛选）
 */
async function getInBox(req, res) {
    try {
        const { userId } = req.user
        const { type, isRead } = req.query

        //分页参数校验
        const paginationResult = formatPaginationParams(req.query, {
            defaultPageSize: 8,
            maxPageSize: 50
        })
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }
        const { page, pageSize, offset } = paginationResult.data

        //  调用模型查询
        const result = await messageModel.getInBoxMessages({
            page,
            pageSize,
            offset,
            type: type || '',
            isRead: isRead !== undefined ? Number(isRead) : undefined,
            userId
        })

        res.json({
            code: 200,
            message: result.total > 0 ? '收件箱查询成功' : '收件箱暂无消息',
            data: {
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
                totalPage: result.totalPage,
                list: result.list
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '收件箱查询失败：' + err.message })
    }
}

/**
 *  发件箱查询（分页+筛选）
 */
async function getOutBox(req, res) {
    try {
        const { userId } = req.user
        const { type } = req.query

        //分页参数校验
        const paginationResult = formatPaginationParams(req.query, {
            defaultPageSize: 8,
            maxPageSize: 50
        })
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }
        const { page, pageSize, offset } = paginationResult.data

        //  模型查询
        const result = await messageModel.getOutBoxMessages({
            page,
            pageSize,
            offset,
            type: type || '',
            userId
        })

        res.json({
            code: 200,
            message: result.total > 0 ? '发件箱查询成功' : '发件箱暂无消息',
            data: {
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
                totalPage: result.totalPage,
                list: result.list
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '发件箱查询失败：' + err.message })
    }
}

/**
 *  标记消息已读（单个/批量）
 */
async function markAdRead(req, res) {
    try {
        const { messageIds } = req.body
        const { userId } = req.user

        //  参数校验
        if (!messageIds || Array.isArray(messageIds) && messageIds.length === 0) {
            return res.status(400).json({ code: 400, message: '请传入有效的消息ID(单个或数组)' })
        }
        //  检验有效ID是否为有效数字
        const validIds = Array.isArray(messageIds)
            ? messageIds.filter(id => !isNaN(id))
            : [!isNaN(messageIds) ? messageIds : null].filter(Boolean)
        if (validIds.length === 0) {
            return res.status(400).json({ code: 400, message: '消息ID必须是有效数字' })
        }

        //  调用模型标记已读
        const affectedRows = await messageModel.markMessageAdRead(validIds, userId)

        res.json({
            code: 200,
            message: `成功标记 ${affectedRows} 条消息为已读`,
            data: {
                markedCount: affectedRows,
                updatedAt: new Date().toISOString()
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '标记消息已读失败：' + err.message })
    }
}

/**
 *  删除消息
 */
async function deleteMessage(req, res) {
    try {
        const { id: messageId } = req.params
        const { userId } = req.user

        //  参数校验
        if (!messageId || isNaN(messageId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的消息ID' })
        }

        //  调用模型删除
        const affectedRows = await messageModel.deleteMessage(Number(messageId), userId)
        if (affectedRows === 0) {
            return res.status(403).json({ code: 403, message: '无权限删除该消息或消息不存在' })
        }

        res.json({ code: 200, message: '消息删除成功' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '消息删除失败：' + err.message })
    }
}

/**
 *  查询未读消息数量
 */
async function getUnreadCount(req, res) {
    try {
        const { userId } = req.user
        const { type } = req.query

        const count = await messageModel.getUnreadCount(userId, type)

        res.json({
            code: 200,
            message: '未读消息数量查询成功',
            data: {
                unreadCount: count,
                type: type || 'all' // 返回查询的类型（all表示所有类型）
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '未读消息数量查询失败：' + err.message })
    }
}

module.exports = {
    sendMessage,
    getInBox,
    getOutBox,
    markAdRead,
    deleteMessage,
    getUnreadCount
}