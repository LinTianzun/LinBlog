const { query } = require('../../db/dbnew')

/**
 * 发送消息（核心：自动填充sender_id，校验接收者存在）
 * @param {Object} msgData - 消息数据（不含sender_id）
 * @param {number} senderId - 发送者ID（从登录态获取）
 * @returns {Promise<Object>} 新增消息ID
 */
async function insertMessage(msgData, senderId) {
    const { receiverId, type, content } = msgData
    //  校验接收者是否存在
    const [receiver] = await query('SELECT id FROM users WHERE id = ? AND status = 1', [receiverId])
    if (!receiver) {
        throw new Error('接收用户不存在或已禁用')
    }
    //  插入消息
    const sql = `
    INSERT INTO message (sender_id, receiver_id, type, content, is_read, created_at)
    VALUES (?, ?, ?, ?, 0, NOW())  
`   //  -- 默认未读（is_read=0）
    const result = await query(sql, [senderId, receiverId, type, content])
    return { messageId: result.insertId }
}

/**
 * 收件箱查询（receiver_id=当前用户）
 * @param {Object} params - 查询参数（含分页、筛选）
 * @returns {Promise<Object>} 分页消息列表+总数
 */
async function getInBoxMessages(params) {
    const { page, pageSize, offset, type, isRead, userId } = params
    let whereClause = 'receiver_id = ?'
    const whereParams = [userId]

    // 筛选：消息类型（system/private/notice）
    if (type && ['system', 'private', 'notice'].includes(type)) {
        whereClause += ' AND type = ?'
        whereParams.push(type)
    }
    // 筛选：是否已读（0=未读，1=已读）
    if (isRead !== undefined && [0, 1].includes(Number(isRead))) {
        whereClause += ' AND is_read = ?'
        whereParams.push(Number(isRead))
    }
    // 关联发送者信息（用户名、头像），按创建时间倒序（最新在前）
    const listSql = `
    SELECT 
        m.id,
        m.sender_id AS senderId,
        s.username AS senderName,
        s.imgurl AS senderAvatar,
        m.receiver_id AS receiverId,
        r.username AS receiverName,
        m.type,
        m.content,
        m.is_read AS isRead,
        m.created_at AS createdAt
    FROM message m
    LEFT JOIN users s ON m.sender_id = s.id  ## 发送者信息
    LEFT JOIN users r ON m.receiver_id = r.id  ## 接收者信息（自己）
    WHERE ${whereClause}
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
    `
    const list = await query(listSql, [...whereParams, pageSize, offset])

    //  查询总数
    const totalSql = `SELECT COUNT(*) AS total FROM message WHERE ${whereClause}`
    const [totalResult] = await query(totalSql, whereParams)

    return {
        list,
        total: totalResult.total,
        page,
        pageSize,
        totalPage: Math.ceil(totalResult.total / pageSize)
    }
}

/**
 * 发件箱查询（sender_id=当前用户）
 * @param {Object} params - 查询参数（含分页、筛选）
 * @returns {Promise<Object>} 分页消息列表+总数
 */
async function getOutBoxMessages(params) {
    const { page, pageSize, offset, type, userId } = params
    let whereClause = 'sender_id  = ?'
    const whereParams = [userId]

    // 筛选：消息类型（system/private/notice）
    if (type && ['system', 'private', 'notice'].includes(type)) {
        whereClause += ' AND type = ?'
        whereParams.push(type)
    }

    //  关联接收者信息
    const listSql = `
    SELECT 
        m.id,
        m.sender_id AS senderId,
        s.username AS senderName,
        s.imgurl AS senderAvatar,
        m.receiver_id AS receiverId,
        r.username AS receiverName,
        r.imgurl AS receiverAvatar,
        m.type,
        m.content,
        m.is_read AS isRead,  ## 显示接收者是否已读
        m.created_at AS createdAt
    FROM message m
    LEFT JOIN users s ON m.sender_id = s.id
    LEFT JOIN users r ON m.receiver_id = r.id
    WHERE ${whereClause}
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
    `
    const list = await query(listSql, [...whereParams, pageSize, offset])

    //  查询总数
    const totalSql = `SELECT COUNT(*) AS total FROM message WHERE ${whereClause}`
    const [totalResult] = await query(totalSql, whereParams)

    return {
        list,
        total: totalResult.total,
        page,
        pageSize,
        totalPage: Math.ceil(totalResult.total / pageSize)
    }
}

/**
 * 标记消息已读（单个/批量）
 * @param {number|number[]} messageIds - 消息ID（单个或数组）
 * @param {number} userId - 当前用户（仅能标记自己的收件箱消息）
 * @returns {Promise<number>} 影响行数
 */
async function markMessageAdRead(messageIds, userId) {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds]
    if (ids.length === 0) return 0

    //  仅能标记自己收到的、未读的消息
    const sql = `
    UPDATE message 
    SET is_read = 1
    WHERE receiver_id = ? AND id IN (?) AND is_read = 0
    `
    const result = await query(sql, [userId, ids])
    return result.affectedRows
}

/**
 * 删除消息（物理删除，适配表结构；仅能删除自己发送/接收的）
 * @param {number} messageId - 消息ID
 * @param {number} userId - 当前用户ID
 * @returns {Promise<number>} 影响行数
 */
async function deleteMessage(messageId, userId) {
    const sql = `
    DELETE FROM message 
    WHERE id = ? AND (sender_id = ? OR receiver_id = ?)
    `
    const result = await query(sql, [messageId, userId, userId])
    return result.affectedRows
}

/**
 * 查询未读消息数量（全局/按类型）
 * @param {number} userId - 当前用户
 * @param {string} type - 消息类型（可选，不传则查所有）
 * @returns {Promise<number>} 未读数量
 */
async function getUnreadCount(userId, type) {
    let whereClause = 'receiver_id = ? AND is_read = 0'
    const whereParams = [userId]

    if (type && ['system', 'private', 'notice'].includes(type)) {
        whereClause += ' AND type = ?'
        whereParams.push(type)
    }

    const sql = `SELECT COUNT(*) AS count FROM message WHERE ${whereClause}`
    const [result] = await query(sql, whereParams)
    return result.count
}

/**
 * 获取博主（admin）用户ID，用于门户留言墙
 * @returns {Promise<number|null>}
 */
async function getOwnerId() {
    const sql = "SELECT id FROM users WHERE user_type = 'admin' ORDER BY id ASC LIMIT 1"
    const [row] = await query(sql, [])
    return row ? row.id : null
}

/**
 * 门户留言墙：查询博主收到的私信（脱敏，不暴露 id/邮箱等）
 * @param {Object} params - { page, pageSize, offset }
 * @returns {Promise<Object>} { list, total, page, pageSize, totalPage }
 */
async function getWallMessages(params) {
    const { page, pageSize, offset } = params
    const ownerId = await getOwnerId()
    if (!ownerId) {
        return { list: [], total: 0, page, pageSize, totalPage: 0 }
    }
    // 只展示 type=private 的留言，按时间倒序
    const listSql = `
        SELECT
            m.id,
            s.username AS senderName,
            s.imgurl AS senderAvatar,
            m.content,
            m.created_at AS createdAt
        FROM message m
        LEFT JOIN users s ON m.sender_id = s.id
        WHERE m.receiver_id = ? AND m.type = 'private'
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
    `
    const list = await query(listSql, [ownerId, pageSize, offset])
    const totalSql = "SELECT COUNT(*) AS total FROM message WHERE receiver_id = ? AND type = 'private'"
    const [totalResult] = await query(totalSql, [ownerId])
    return {
        list,
        total: totalResult.total,
        page,
        pageSize,
        totalPage: Math.ceil(totalResult.total / pageSize)
    }
}

/**
 * 门户留言墙：访客提交留言（写入 message，type=private，receiver=博主）
 * @param {string} content - 留言内容
 * @param {number|null} senderId - 登录用户ID，未登录为 null
 * @returns {Promise<{messageId: number}>}
 */
async function insertWallMessage(content, senderId) {
    const ownerId = await getOwnerId()
    if (!ownerId) {
        throw new Error('博主账号不存在')
    }
    // sender_id 非空且有外键：未登录访客统一挂到游客账号下
    let effectiveSenderId = senderId
    if (!effectiveSenderId) {
        const sql = "SELECT id FROM users WHERE user_type = 'visitor' ORDER BY id ASC LIMIT 1"
        const [visitor] = await query(sql, [])
        if (!visitor) {
            throw new Error('暂不支持游客留言，请先登录')
        }
        effectiveSenderId = visitor.id
    }
    const sql = `
        INSERT INTO message (sender_id, receiver_id, type, content, is_read, created_at)
        VALUES (?, ?, 'private', ?, 0, NOW())
    `
    const result = await query(sql, [effectiveSenderId, ownerId, content])
    return { messageId: result.insertId }
}

module.exports = {
    insertMessage,
    getInBoxMessages,
    getOutBoxMessages,
    markMessageAdRead,
    deleteMessage,
    getUnreadCount,
    getOwnerId,
    getWallMessages,
    insertWallMessage
}
