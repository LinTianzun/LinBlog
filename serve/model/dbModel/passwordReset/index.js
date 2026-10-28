const crypto = require('node:crypto')
const { query, withTransaction } = require('../../db/dbnew')
const userModel = require('../users/index')

const TOKEN_TTL_MINUTES = 30
const RESEND_INTERVAL_SECONDS = 60

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex')
}

function createToken() {
    return crypto.randomBytes(32).toString('hex')
}

async function findUserForReset(mail) {
    return query(
        'SELECT id, username, mail, status FROM users WHERE mail = ? LIMIT 1',
        [mail]
    )
}

async function findRecentToken(userId) {
    const rows = await query(
        `SELECT id, created_at
         FROM password_reset_token
         WHERE user_id = ? AND used_at IS NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, RESEND_INTERVAL_SECONDS]
    )
    return rows[0] || null
}

async function createResetToken(userId, requestedIp) {
    const token = createToken()
    const tokenHash = hashToken(token)

    await query(
        'UPDATE password_reset_token SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
        [userId]
    )
    await query(
        `INSERT INTO password_reset_token
            (user_id, token_hash, requested_ip, expires_at, token_version)
         SELECT ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), token_version
         FROM users WHERE id = ?`,
        [userId, tokenHash, requestedIp || null, TOKEN_TTL_MINUTES, userId]
    )

    return token
}

async function findValidToken(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
        return null
    }

    const rows = await query(
        `SELECT t.id, t.user_id, u.username, u.mail
         FROM password_reset_token t
         INNER JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.used_at IS NULL
           AND t.expires_at > NOW() AND u.status = 1
           AND t.token_version = u.token_version
         LIMIT 1`,
        [hashToken(token)]
    )
    return rows[0] || null
}

async function revokeToken(token) {
    await query(
        'UPDATE password_reset_token SET used_at = NOW() WHERE token_hash = ? AND used_at IS NULL',
        [hashToken(token)]
    )
}

async function consumeResetToken(tokenId, userId, passwordHash) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })

        const result = await exec(
            `UPDATE password_reset_token
             SET used_at = NOW()
             WHERE id = ? AND user_id = ? AND used_at IS NULL AND expires_at > NOW()`,
            [tokenId, userId]
        )
        if (result.affectedRows !== 1) {
            return false
        }

        await userModel.resetUserPassword(userId, passwordHash, exec)
        return true
    })
}

module.exports = {
    TOKEN_TTL_MINUTES,
    RESEND_INTERVAL_SECONDS,
    hashToken,
    findUserForReset,
    findRecentToken,
    createResetToken,
    findValidToken,
    consumeResetToken,
    revokeToken,
}
