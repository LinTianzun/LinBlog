const { verifyToken } = require('../utils/jwtutil')
const userModel = require('../model/dbModel/users/index')

/**
 * Token 校验中间件：检查请求头是否携带有效 Token
 */
async function authMiddleware(req, res, next) {
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
        const token = authHeader.split(' ')[1]

        // 验证 Token
        const decoded = verifyToken(token)
        if (!decoded) {
            return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
        }
        // 根据 Token 中的 userId 查询用户类型（确保仅传递必要字段）
        const userResult = await userModel.findUserById(decoded.userId)
        if (userResult.length === 0) {
            return res.status(401).json({ code: 401, message: '用户不存在' });
        }
        // 挂载用户核心信息到 req.user（供后续接口使用）
        req.user = {
            userId: decoded.userId,
            user_type: userResult[0].user_type // 关键：传递用户类型
        };
        next(); // 验证通过，进入下一步
    } catch (err) {
        //  Token 无效/过期，返回 401 错误
        res.status(401).json({
            code: 401,
            message: err.message || 'Token 校验失败，请重新登录'
        })
    }
}

module.exports = { authMiddleware }