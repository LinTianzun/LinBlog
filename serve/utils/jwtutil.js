const jwt = require('jsonwebtoken')
const config = require('../config/default')

function getJwtSecret() {
    const secret = config.jwt.secret

    if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('JWT 密钥缺失或强度不足，请检查 LINBLOG_JWT_SECRET。')
    }

    return secret
}

/**
 * 生成 Token
 * @param {Object} payload Token 载荷
 * @returns {string} Token 字符串
 */
function generateToken(payload) {
    try {
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
            throw new Error('Token 载荷必须是对象')
        }

        return jwt.sign(
            payload,
            getJwtSecret(),
            { expiresIn: config.jwt.expiresIn }
        )
    } catch (err) {
        console.error('Token 生成失败：', err.message)
        throw err
    }
}

/**
 * 验证 Token
 * @param {string} token 待验证的 Token
 * @returns {Object} 解码后的载荷
 */
function verifyToken(token) {
    try {
        if (!token || typeof token !== 'string') {
            throw new Error('Token 不能为空且必须是字符串')
        }

        return jwt.verify(token, getJwtSecret())
    } catch (err) {
        if (err.message === 'JWT 密钥缺失或强度不足，请检查 LINBLOG_JWT_SECRET。') {
            throw err
        }

        let errorMsg = 'Token 验证失败'

        if (err.name === 'JsonWebTokenError') {
            errorMsg = 'Token 格式无效'
        } else if (err.name === 'TokenExpiredError') {
            errorMsg = 'Token 已过期'
        } else if (err.name === 'NotBeforeError') {
            errorMsg = 'Token 尚未生效'
        }

        console.error(errorMsg + '：', err.message)
        throw new Error(errorMsg)
    }
}

module.exports = {
    generateToken,
    verifyToken
}