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
    INSERT INTO message (sender_id, receiver_id, type, channel, content, is_read, created_at)
    VALUES (?, ?, ?, 'direct', ?, 0, NOW())
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
    // 博主优先取唯一超级管理员，其次回落到最早的管理员；
    // 私信会话也以这个账号作为「我」，保证门户留言墙与后台回复指向同一人。
    const sql = `
        SELECT id
        FROM users
        WHERE status = 1 AND user_type = 'admin'
        ORDER BY is_super_admin DESC, id ASC
        LIMIT 1`
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
    // 门户留言全部公开；另外保留每位用户的首条私信作为最初留言，
    // 后续普通聊天只在后台会话中可见。
    const listSql = `
        SELECT
            m.id,
            s.username AS senderName,
            s.imgurl AS senderAvatar,
            m.content,
            m.created_at AS createdAt
        FROM message m
        LEFT JOIN (
            SELECT sender_id, MIN(id) AS first_id
            FROM message
            WHERE receiver_id = ? AND type = 'private' AND sender_id <> receiver_id
            GROUP BY sender_id
        ) first_message ON first_message.first_id = m.id
        LEFT JOIN users s ON m.sender_id = s.id
        WHERE m.receiver_id = ? AND m.type = 'private'
          AND (m.channel = 'wall' OR first_message.first_id IS NOT NULL)
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
    `
    const totalSql = `
        SELECT COUNT(*) AS total
        FROM message m
        LEFT JOIN (
            SELECT sender_id, MIN(id) AS first_id
            FROM message
            WHERE receiver_id = ? AND type = 'private' AND sender_id <> receiver_id
            GROUP BY sender_id
        ) first_message ON first_message.first_id = m.id
        WHERE m.receiver_id = ? AND m.type = 'private'
          AND (m.channel = 'wall' OR first_message.first_id IS NOT NULL)
    `
    const list = await query(listSql, [ownerId, ownerId, pageSize, offset])
    const [totalResult] = await query(totalSql, [ownerId, ownerId])
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
        INSERT INTO message (sender_id, receiver_id, type, channel, content, is_read, created_at)
        VALUES (?, ?, 'private', 'wall', ?, 0, NOW())
    `
    const result = await query(sql, [effectiveSenderId, ownerId, content])
    return { messageId: result.insertId }
}

/**
 * 查询可对话的私信会话列表。
 * - 博主：列出所有与其有过私信往来的启用用户，带最后一条消息与未读数
 * - 其他用户：只返回与博主的会话（即使还没有消息，也返回一条空会话用于发起）
 * @param {number} currentUserId
 * @param {number} ownerId
 * @param {boolean} isOwner
 */
async function getConversations(currentUserId, ownerId, isOwner) {
    const ownerRows = await query(
        'SELECT id, username, imgurl FROM users WHERE id = ? AND status = 1 LIMIT 1',
        [ownerId]
    )
    const owner = ownerRows[0]
        ? { id: Number(ownerRows[0].id), name: ownerRows[0].username, avatar: ownerRows[0].imgurl || null }
        : null
    if (!owner) return { owner: null, conversations: [] }

    if (!isOwner) {
        // 普通账号只有一条会话：与博主的对话
        const [stats] = await query(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN receiver_id = ? AND is_read = 0 THEN 1 ELSE 0 END) AS unread
             FROM message
             WHERE type = 'private'
               AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))`,
            [currentUserId, currentUserId, ownerId, ownerId, currentUserId]
        )
        const [last] = await query(
            `SELECT content, sender_id, created_at
             FROM message
             WHERE type = 'private'
               AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
            [currentUserId, ownerId, ownerId, currentUserId]
        )
        return {
            owner,
            conversations: [{
                userId: owner.id,
                name: owner.name,
                avatar: owner.avatar,
                lastContent: last ? last.content : '',
                lastAt: last ? last.created_at : null,
                lastSenderId: last ? Number(last.sender_id) : null,
                unreadCount: Number(stats?.unread || 0),
                total: Number(stats?.total || 0),
                isOwner: true,
            }]
        }
    }

    // 博主视角：按最近一条消息聚合所有对话人
    const rows = await query(
        `SELECT
            u.id AS userId,
            u.username AS name,
            u.imgurl AS avatar,
            lm.content AS lastContent,
            lm.created_at AS lastAt,
            lm.sender_id AS lastSenderId,
            COALESCE(uc.unreadCount, 0) AS unreadCount,
            COALESCE(tc.total, 0) AS total
         FROM users u
         JOIN (
            SELECT partner_id, MAX(last_id) AS last_id
            FROM (
                SELECT receiver_id AS partner_id, MAX(id) AS last_id
                FROM message
                WHERE type = 'private' AND sender_id = ?
                GROUP BY receiver_id
                UNION ALL
                SELECT sender_id AS partner_id, MAX(id) AS last_id
                FROM message
                WHERE type = 'private' AND receiver_id = ?
                GROUP BY sender_id
            ) partners
            GROUP BY partner_id
         ) p ON p.partner_id = u.id
         JOIN message lm ON lm.id = p.last_id
         LEFT JOIN (
            SELECT sender_id, COUNT(*) AS unreadCount
            FROM message
            WHERE receiver_id = ? AND type = 'private' AND is_read = 0
            GROUP BY sender_id
         ) uc ON uc.sender_id = u.id
         LEFT JOIN (
            SELECT partner_id, COUNT(*) AS total
            FROM (
                SELECT receiver_id AS partner_id
                FROM message WHERE type = 'private' AND sender_id = ?
                UNION ALL
                SELECT sender_id AS partner_id
                FROM message WHERE type = 'private' AND receiver_id = ?
            ) all_messages
            GROUP BY partner_id
         ) tc ON tc.partner_id = u.id
         WHERE u.id <> ? AND u.status = 1
         ORDER BY lm.created_at DESC, lm.id DESC`,
        [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]
    )

    return {
        owner,
        conversations: rows.map(row => ({
            userId: Number(row.userId),
            name: row.name || '已注销用户',
            avatar: row.avatar || null,
            lastContent: row.lastContent || '',
            lastAt: row.lastAt,
            lastSenderId: row.lastSenderId === null ? null : Number(row.lastSenderId),
            unreadCount: Number(row.unreadCount || 0),
            total: Number(row.total || 0),
            isOwner: false,
        }))
    }
}

/**
 * 查询两人之间的私信消息（按时间正序返回当前页）。
 * 调用方需先校验权限：博主可查任意用户，其他用户只能查与博主的会话。
 */
async function getConversationMessages(currentUserId, targetUserId, page, pageSize, offset) {
    const where = `type = 'private'
        AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))`
    const params = [currentUserId, targetUserId, targetUserId, currentUserId]

    const rows = await query(
        `SELECT
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
         LEFT JOIN users s ON m.sender_id = s.id
         LEFT JOIN users r ON m.receiver_id = r.id
         WHERE ${where}
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )
    const [totalResult] = await query(`SELECT COUNT(*) AS total FROM message WHERE ${where}`, params)

    return {
        // 查询按倒序取最新一页，返回前反转成聊天气泡需要的正序
        list: [...rows].reverse(),
        total: Number(totalResult?.total || 0),
        page,
        pageSize,
        totalPage: Math.ceil(Number(totalResult?.total || 0) / pageSize),
    }
}

/**
 * 查询启用状态用户的基本信息（用于会话权限校验与展示）
 */
async function findActiveUser(userId) {
    const rows = await query(
        'SELECT id, username, imgurl FROM users WHERE id = ? AND status = 1 LIMIT 1',
        [userId]
    )
    const row = rows[0]
    return row
        ? { id: Number(row.id), name: row.username, avatar: row.imgurl || null }
        : null
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
    insertWallMessage,
    getConversations,
    getConversationMessages,
    findActiveUser,
}
