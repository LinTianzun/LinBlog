const { verifyToken } = require('../utils/jwtutil')

/**
 * Token 校验中间件：检查请求头是否携带有效 Token
 */
function authMiddleware(req, res, next) {
    try {
        //  从请求头获取 Authorization 字段
        const authHeader = req.headers.authorization

        //  校验请求头是否携带 Token（格式：Authorization: Bearer <token>）
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                code: 401,
                message: '请求头未携带 Token 请先登录'
            })
        }

        //  提取 Token（去掉 "Bearer " 前缀，trim() 去除空格）
        const token = authHeader.split(' ')[1].trim()

        //  验证 Token 有效性
        const decodedPayload = verifyToken(token)

        //  将解密后的用户信息挂载到 req 对象 供接口使用
        req.user = {
            userId: decodedPayload.id
        }

        //  Token 有效 放行
        next()
    } catch (err) {
        //  Token 无效/过期，返回 401 错误
        res.status(401).json({
            code: 401,
            message: err.message || 'Token 校验失败，请重新登录'
        })
    }
}

module.exports = { authMiddleware }