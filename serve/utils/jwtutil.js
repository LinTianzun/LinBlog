const jwt = require('jsonwebtoken') // 引入JWT库
const config = require('../config/default') // 引入配置

/**
 * 生成 Token（加密）
 * @param {Object} payload - Token 载荷（存储的用户信息，避免敏感数据）
 * @returns {string} 生成的 Token 字符串
 */
function generateToken(payload) {
    try {
        if (typeof payload !== 'object' || payload === null) {
            throw new Error('Token 载荷必须是对象')
        }

        //  生成Token   参数(载荷，密钥，配置项)
        return jwt.sign(
            payload, // 存储用户标识（如 userId、userType）
            config.jwt.secret,  //  密钥
            { expiresIn: config.jwt.expiresIn } //  过期时间
        )
    } catch (err) {
        console.error('Token 生成失败：', err.message);
        throw err; // 抛出错误，让调用方处理
    }
}

/**
 * 验证 Token（解密）
 * @param {string} token - 待验证的 Token 字符串
 * @returns {Object} 解密后的载荷（如 { userId: 1, exp: 1735689600 }）
 */
function verifyToken(token) {
    try {
        //  校验 Token 是否存在
        if (!token || typeof token !== 'string') {
            throw new Error('Token 不能为空且必须是字符串')
        }

        //  验证 Token 有效性：返回解密后的载荷
        return jwt.verify(token, config.jwt.secret)
    } catch (err) {
        //  分类处理错误
        let errorMsg = 'Token 验证失败'
        if (err.name === 'JsonWebTokenError') {
            errorMsg = 'Token 格式无效'
        } else if (err.name === 'TokenExpiredError') {
            errorMsg = 'Token 已过期'
        } else if (err.name === 'NotBeforeError') {
            errorMsg = 'Token 尚未生效'
        }
        console.error(errorMsg + '：', err.message);
        throw new Error(errorMsg); // 抛出格式化后的错误
    }
}

module.exports = {
    generateToken,
    verifyToken
}