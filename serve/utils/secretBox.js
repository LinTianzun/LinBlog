const crypto = require('node:crypto')
const config = require('../config/default')

const PREFIX = 'v1'

function getKey() {
    // 密钥派生自 JWT 密钥：同一套部署里换密钥即可让旧密文失效
    return crypto.createHash('sha256').update(String(config.jwt.secret)).digest()
}

/**
 * 加密敏感配置（目前用于 AI 接入密钥）。
 * 格式：v1:<iv>:<tag>:<ciphertext>，全部 base64url。
 */
function encryptSecret(plain) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
    const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [
        PREFIX,
        iv.toString('base64url'),
        tag.toString('base64url'),
        encrypted.toString('base64url')
    ].join(':')
}

function decryptSecret(payload) {
    const parts = String(payload || '').split(':')
    if (parts.length !== 4 || parts[0] !== PREFIX) {
        throw Object.assign(new Error('密钥数据格式不正确'), { code: 'AI_SECRET_INVALID' })
    }

    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(parts[1], 'base64url'))
        decipher.setAuthTag(Buffer.from(parts[2], 'base64url'))
        return Buffer.concat([
            decipher.update(Buffer.from(parts[3], 'base64url')),
            decipher.final()
        ]).toString('utf8')
    } catch {
        throw Object.assign(new Error('密钥解密失败，请重新填写'), { code: 'AI_SECRET_INVALID' })
    }
}

/**
 * 展示用的掩码：只保留末尾 4 位，前缀统一替换成星号。
 */
function maskSecret(plain) {
    const text = String(plain || '')
    if (!text) return ''
    if (text.length <= 8) return `${'*'.repeat(text.length - 4)}${text.slice(-4)}`
    return `${'*'.repeat(8)}${text.slice(-4)}`
}

module.exports = {
    encryptSecret,
    decryptSecret,
    maskSecret
}
