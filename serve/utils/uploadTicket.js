const crypto = require('node:crypto')

// 上传专用短期票据：替代直接把登录 JWT 放进 query。
// yk-upload 只能把凭证拼在 URL 上（自带 XHR 且不支持自定义请求头），
// 所以票据自身必须能证明身份，否则服务端根本收不到 JWT。
//
// 票据只存在内存里，进程重启即失效；用 SHA-256 存哈希，
// 避免明文票据出现在内存快照里。
const TICKET_TTL_MS = 5 * 60 * 1000
// 一张票据可上传的文件数。yk-upload 多选时整批文件共用同一个 uploadUrl
// （uploadUrl 在同步循环里逐次读取，组件来不及换成新票据），
// 所以票据不能是严格一次性的，改为「按次数消费」，用完或过期即失效。
// 取 50 以覆盖图库/文件模块的一次性批量选择，5 分钟 TTL 仍然限制了泄漏窗口。
const DEFAULT_USES = 50
// 票据池上限，避免被无限签发撑爆内存
const MAX_TICKETS = 5000
const tickets = new Map()

function hashTicket(ticket) {
    return crypto.createHash('sha256').update(ticket).digest('hex')
}

function sweepExpired(now = Date.now()) {
    for (const [hash, entry] of tickets) {
        if (entry.expiresAt <= now) tickets.delete(hash)
    }
}

/**
 * 签发一张上传票据，返回明文（仅此一次，服务端只存哈希）。
 * 票据在服务端绑定用户与来源 IP：URL 泄漏后，攻击者既不是同一来源、
 * 也只有 5 分钟窗口，重放价值远低于长期 JWT。
 *
 * @param {number} userId 换取票据的用户
 * @param {{uses?: number, ip?: string}} options
 * @returns {{ticket: string, expiresAt: number, uses: number}|{error: string}}
 */
function issueUploadTicket(userId, options = {}) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return { error: '上传票据必须绑定到已登录用户' }
    }

    sweepExpired()
    // 票据池满时先清理过期票据，仍满则拒绝签发（防止无节流签发打爆内存）
    if (tickets.size >= MAX_TICKETS) {
        sweepExpired()
        if (tickets.size >= MAX_TICKETS) {
            return { error: '上传票据签发过于频繁，请稍后再试' }
        }
    }

    const requested = Number.isSafeInteger(options.uses) ? options.uses : DEFAULT_USES
    const allowed = requested > 0 ? Math.min(requested, DEFAULT_USES) : DEFAULT_USES
    const ticket = crypto.randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + TICKET_TTL_MS
    tickets.set(hashTicket(ticket), {
        expiresAt,
        remaining: allowed,
        userId,
        ip: typeof options.ip === 'string' ? options.ip : ''
    })
    return { ticket, expiresAt, uses: allowed }
}

/**
 * 消费一次上传票据。票据按次数递减，用尽或过期即失效。
 * @param {string} ticket
 * @param {{ip?: string}} options 校验来源 IP，票据被复制到别处时失效
 * @returns {{valid: boolean, userId?: number, reason?: string}}
 */
function consumeUploadTicket(ticket, options = {}) {
    if (typeof ticket !== 'string' || !ticket) {
        return { valid: false, reason: '上传票据不能为空' }
    }

    sweepExpired()
    const hash = hashTicket(ticket)
    const entry = tickets.get(hash)
    if (!entry) {
        return { valid: false, reason: '上传票据无效或已被使用，请重新打开上传窗口' }
    }

    if (entry.expiresAt <= Date.now()) {
        tickets.delete(hash)
        return { valid: false, reason: '上传票据已过期' }
    }

    // 来源 IP 绑定：票据签发时记录了 IP，换一个来源使用即判定为泄漏重放
    const requestIp = typeof options.ip === 'string' ? options.ip : ''
    if (entry.ip && requestIp && entry.ip !== requestIp) {
        tickets.delete(hash)
        return { valid: false, reason: '上传票据来源异常，请重新打开上传窗口' }
    }

    entry.remaining -= 1
    if (entry.remaining <= 0) {
        tickets.delete(hash)
    }

    return { valid: true, userId: entry.userId }
}

// 仅测试使用
function _reset() {
    tickets.clear()
}
function _size() {
    sweepExpired()
    return tickets.size
}

module.exports = {
    issueUploadTicket,
    consumeUploadTicket,
    TICKET_TTL_MS,
    DEFAULT_USES,
    MAX_TICKETS,
    _reset,
    _size
}
