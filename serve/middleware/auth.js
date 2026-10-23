const { verifyToken } = require('../utils/jwtutil')
const userModel = require('../model/dbModel/users/index')

/**
 * 校验请求中的 Token、用户存在性与账号状态
 */
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                code: 401,
                message: '请求头未携带 Token，请先登录'
            })
        }

        const token = authHeader.slice('Bearer '.length).trim()

        if (!token) {
            return res.status(401).json({
                code: 401,
                message: 'Token 不能为空，请先登录'
            })
        }

        let decoded

        try {
            decoded = verifyToken(token)
        } catch (err) {
            return res.status(401).json({
                code: 401,
                message: err.message || 'Token 无效或已过期'
            })
        }

        if (!decoded || !decoded.userId) {
            return res.status(401).json({
                code: 401,
                message: 'Token 无效或已过期'
            })
        }

        let userResult

        try {
            userResult = await userModel.findUserById(decoded.userId)
        } catch (err) {
            console.error('[Auth] 查询用户失败：', err)
            return res.status(503).json({
                code: 503,
                message: '认证服务暂时不可用，请稍后重试'
            })
        }

        if (!userResult || userResult.length === 0) {
            return res.status(401).json({
                code: 401,
                message: '用户不存在，请重新登录'
            })
        }

        const user = userResult[0]

        if (Number(user.status) !== 1) {
            return res.status(401).json({
                code: 401,
                message: '该账号已被禁用，请重新登录或联系管理员'
            })
        }

        req.user = {
            userId: decoded.userId,
            user_type: user.user_type,
            userType: user.user_type
        }

        return next()
    } catch (err) {
        console.error('[Auth] 认证中间件异常：', err)
        return res.status(500).json({
            code: 500,
            message: '认证服务内部错误'
        })
    }
}

module.exports = { authMiddleware }
