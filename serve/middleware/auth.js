const { verifyToken } = require('../utils/jwtutil')
const userModel = require('../model/dbModel/users/index')

/**
 * 从请求中解析并校验 Token；失败返回 null 原因，供强制/可选认证复用。
 */
async function resolveAuthUser(req) {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { user: null, reason: '请求头未携带 Token，请先登录', status: 401 }
    }

    const token = authHeader.slice('Bearer '.length).trim()
    if (!token) {
        return { user: null, reason: 'Token 不能为空，请先登录', status: 401 }
    }

    let decoded
    try {
        decoded = verifyToken(token)
    } catch (err) {
        return { user: null, reason: err.message || 'Token 无效或已过期', status: 401 }
    }

    if (!decoded || !decoded.userId) {
        return { user: null, reason: 'Token 无效或已过期', status: 401 }
    }

    try {
        const userResult = await userModel.findUserById(decoded.userId)
        if (!userResult || userResult.length === 0) {
            return { user: null, reason: '用户不存在，请重新登录', status: 401 }
        }

        const user = userResult[0]
        if (Number(user.status) !== 1) {
            return { user: null, reason: '该账号已被禁用，请重新登录或联系管理员', status: 401 }
        }

        return {
            user: {
                userId: decoded.userId,
                user_type: user.user_type,
                userType: user.user_type
            },
            reason: null,
            status: 200
        }
    } catch (err) {
        console.error('[Auth] 查询用户失败：', err)
        return { user: null, reason: '认证服务暂时不可用，请稍后重试', status: 503 }
    }
}

/**
 * 校验请求中的 Token、用户存在性与账号状态
 */
async function authMiddleware(req, res, next) {
    try {
        const { user, reason, status } = await resolveAuthUser(req)
        if (!user) {
            return res.status(status).json({ code: status, message: reason })
        }

        req.user = user
        return next()
    } catch (err) {
        console.error('[Auth] 认证中间件异常：', err)
        return res.status(500).json({
            code: 500,
            message: '认证服务内部错误'
        })
    }
}

/**
 * 公开只读接口的可选认证：无 Token 按游客处理；携带 Token 时校验并挂载用户，
 * 数据层据此决定是否放宽到「自己的草稿/已发布」可见范围。
 */
async function optionalAuthMiddleware(req, res, next) {
    try {
        const { user, reason, status } = await resolveAuthUser(req)
        // 无 Token 按游客放行；但携带了无效 Token 或禁用账号时明确拒绝，
        // 避免前端误以为游客态而隐藏登录态功能
        if (!user && !req.headers.authorization) {
            req.user = { userId: null, user_type: 'visitor', userType: 'visitor' }
            return next()
        }
        if (!user) {
            return res.status(status).json({ code: status, message: reason })
        }

        req.user = user
        return next()
    } catch (err) {
        console.error('[Auth] 可选认证中间件异常：', err)
        return res.status(500).json({ code: 500, message: '认证服务内部错误' })
    }
}

/**
 * yk-upload 使用 XMLHttpRequest 上传，无法附加自定义请求头。
 * 仅上传接口允许从 query 读取 Token，再复用统一的认证逻辑。
 */
function authMiddlewareFromQuery(req, res, next) {
    const queryToken = typeof req.query.token === 'string'
        ? req.query.token.trim()
        : ''

    if (!queryToken) {
        return res.status(200).json({
            code: 401,
            error: '上传凭证不能为空，请重新登录',
            message: '上传凭证不能为空，请重新登录'
        })
    }

    req.headers.authorization = `Bearer ${queryToken}`

    // yk-upload 不会处理非 200 响应，认证失败也要用 error 字段返回。
    const uploadResponse = {
        status() {
            return {
                json(payload) {
                    return res.status(200).json({
                        code: payload.code,
                        error: payload.message || '上传认证失败',
                        message: payload.message || '上传认证失败'
                    })
                }
            }
        }
    }

    return authMiddleware(req, uploadResponse, next)
}

module.exports = { authMiddleware, authMiddlewareFromQuery, optionalAuthMiddleware }
