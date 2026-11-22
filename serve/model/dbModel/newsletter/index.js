const crypto = require('node:crypto')
const { query } = require('../../db/dbnew')

const TOKEN_TTL_HOURS = 48
const RESEND_INTERVAL_SECONDS = 60
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function normalizeEmail(value) {
    if (typeof value !== 'string') return ''
    const email = value.trim().toLowerCase()
    if (email.length < 5 || email.length > 190) return ''
    return EMAIL_PATTERN.test(email) ? email : ''
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function createToken() {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * 写入或刷新订阅意向。
 * - 已确认的邮箱保持 confirmed，不因为重复订阅降级
 * - 新订阅与待确认订阅都会刷新 token，旧确认链接随之失效
 */
async function upsertSubscriberRequest(email, source = 'portal', sourceIp = null) {
    const token = createToken()
    const tokenHash = hashToken(token)
    await query(
        `INSERT INTO newsletter_subscriber
            (email, status, token_hash, token_expires_at, source, source_ip)
         VALUES (?, 'pending', ?, DATE_ADD(NOW(), INTERVAL ? HOUR), ?, ?)
         ON DUPLICATE KEY UPDATE
            token_hash = IF(status = 'confirmed', token_hash, VALUES(token_hash)),
            token_expires_at = IF(status = 'confirmed', token_expires_at, VALUES(token_expires_at)),
            source = IF(status = 'confirmed', source, VALUES(source)),
            source_ip = IF(status = 'confirmed', source_ip, VALUES(source_ip)),
            updated_at = NOW()`,
        [
            email,
            tokenHash,
            TOKEN_TTL_HOURS,
            String(source || 'portal').slice(0, 32),
            sourceIp ? String(sourceIp).slice(0, 64) : null,
        ]
    )
    const rows = await query(
        'SELECT id, status FROM newsletter_subscriber WHERE email = ? LIMIT 1',
        [email]
    )
    return {
        token,
        tokenHash,
        id: rows[0]?.id || null,
        status: rows[0]?.status || 'pending',
    }
}

async function findSubscriberByToken(token, expectedStatus = 'pending') {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null
    const rows = await query(
        `SELECT id, email, status, token_expires_at AS tokenExpiresAt
         FROM newsletter_subscriber
         WHERE token_hash = ? AND status = ?
         LIMIT 1`,
        [hashToken(token), expectedStatus]
    )
    const row = rows[0]
    if (!row) return null
    if (expectedStatus === 'pending' && row.tokenExpiresAt) {
        const expiresAt = new Date(row.tokenExpiresAt).getTime()
        if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null
    }
    return row
}

async function confirmSubscriber(token) {
    const row = await findSubscriberByToken(token, 'pending')
    if (!row) return null
    const result = await query(
        `UPDATE newsletter_subscriber
         SET status = 'confirmed', confirmed_at = NOW(),
             token_hash = NULL, token_expires_at = NULL, updated_at = NOW()
         WHERE id = ? AND status = 'pending'
           AND (token_expires_at IS NULL OR token_expires_at > NOW())`,
        [row.id]
    )
    return result.affectedRows === 1 ? { id: row.id, email: row.email } : null
}

async function unsubscribeSubscriber(token) {
    const row = await findSubscriberByToken(token, 'confirmed')
    if (!row) return null
    const result = await query(
        `UPDATE newsletter_subscriber
         SET status = 'unsubscribed', unsubscribed_at = NOW(),
             token_hash = NULL, token_expires_at = NULL, updated_at = NOW()
         WHERE id = ? AND status = 'confirmed'`,
        [row.id]
    )
    return result.affectedRows === 1 ? { id: row.id, email: row.email } : null
}

async function countConfirmedSubscribers() {
    const rows = await query(
        "SELECT COUNT(*) AS total FROM newsletter_subscriber WHERE status = 'confirmed'"
    )
    return Number(rows[0]?.total || 0)
}

/**
 * 取出准备接收本期摘要的订阅者。
 * since 之后已经收到过摘要的地址跳过，避免任务重启或手动补跑时重复发信。
 */
async function listDigestRecipients({ since, limit = 500 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000)
    const hasSince = since instanceof Date && Number.isFinite(since.getTime()) && since.getTime() > 0
    return query(
        `SELECT id, email
         FROM newsletter_subscriber
         WHERE status = 'confirmed'
           ${hasSince ? 'AND (last_digest_at IS NULL OR last_digest_at < ?)' : ''}
         ORDER BY confirmed_at ASC, id ASC
         LIMIT ?`,
        hasSince ? [since, safeLimit] : [safeLimit]
    )
}

async function markDigestSent(ids, sentAt = new Date()) {
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number))]
        .filter(id => Number.isSafeInteger(id) && id > 0)
    if (list.length === 0) return 0
    const result = await query(
        `UPDATE newsletter_subscriber SET last_digest_at = ?
         WHERE id IN (${list.map(() => '?').join(', ')})`,
        [sentAt, ...list]
    )
    return result.affectedRows
}

// 退订链接需要长期有效：单独签发一个只存哈希的退订令牌
async function createUnsubscribeToken(id) {
    const token = createToken()
    const result = await query(
        `UPDATE newsletter_subscriber
         SET token_hash = ?, token_expires_at = NULL
         WHERE id = ? AND status = 'confirmed'`,
        [hashToken(token), id]
    )
    return result.affectedRows === 1 ? token : null
}

async function countRecentRequestsByIp(ip) {
    if (!ip) return 0
    const rows = await query(
        `SELECT COUNT(*) AS total FROM newsletter_subscriber
         WHERE source_ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
        [ip, RESEND_INTERVAL_SECONDS]
    )
    return Number(rows[0]?.total || 0)
}

module.exports = {
    TOKEN_TTL_HOURS,
    RESEND_INTERVAL_SECONDS,
    normalizeEmail,
    hashToken,
    createToken,
    upsertSubscriberRequest,
    findSubscriberByToken,
    confirmSubscriber,
    unsubscribeSubscriber,
    createUnsubscribeToken,
    countConfirmedSubscribers,
    countRecentRequestsByIp,
    listDigestRecipients,
    markDigestSent,
}
