const { query } = require('../model/db/dbnew')
const messageModel = require('../model/dbModel/message/index')

async function getSuperAdminId() {
    const rows = await query(`
        SELECT id
        FROM users
        WHERE is_super_admin = 1 AND status = 1
        ORDER BY id ASC
        LIMIT 1
    `)
    return rows?.[0]?.id ? Number(rows[0].id) : null
}

/**
 * 给超级管理员发一条系统通知；通知失败只记录，不影响巡检结果。
 */
async function notifySuperAdmin({ content }) {
    const adminId = await getSuperAdminId()
    if (!adminId) return { delivered: false, reason: 'no_super_admin' }

    await messageModel.insertMessage({
        receiverId: adminId,
        type: 'system',
        content: String(content).slice(0, 500),
    }, adminId)
    return { delivered: true, receiverId: adminId }
}

module.exports = { getSuperAdminId, notifySuperAdmin }
