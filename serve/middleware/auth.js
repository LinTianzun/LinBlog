const { verifyToken } = require('../utils/jwtutil')
const userModel = require('../model/dbModel/users/index')
const { consumeUploadTicket } = require('../utils/uploadTicket')
const { isSuperAdmin, getPermissionsForUser } = require('../utils/accessControl')

/**
 * 用已确认的用户 ID 加载账号并校验状态。
 * 上传票据已经证明了身份，这里复用同一套「用户存在 + 账号启用」口径。
 *
 * @param {number} userId
 * @param {object} req 挂载 req.user
 * @param {object} res 失败响应对象
 * @param {Function} next
 */
async function resolveAuthUserById(userId, req, res, next) {
    try {
        const userResult = await userModel.findUserById(userId)
        if (!userResult || userResult.length === 0) {
            return res.status(401).json({ code: 401, message: '用户不存在，请重新登录' })
        }

        const user = userResult[0]
        if (Number(user.status) !== 1) {
            return res.status(401).json({
                code: 401,
                message: '该账号已被禁用，请重新登录或联系管理员'
            })
        }

        const isSuper = isSuperAdmin(user)
        req.user = {
            userId,
            user_type: user.user_type,
            userType: user.user_type,
            tokenVersion: Number(user.token_version || 0),
            isSuperAdmin: isSuper,
            is_super_admin: isSuper,
            permissions: getPermissionsForUser({ ...user, userId, isSuperAdmin: isSuper })
        }
        return next()
    } catch (err) {
        console.error('[Auth] 查询用户失败：', err)
        return res.status(503).json({ code: 503, message: '认证服务暂时不可用，请稍后重试' })
    }
}

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

        // 改密/重置密码后 token_version 递增，旧 JWT 立即失效
        if (Number(decoded.tokenVersion || 0) !== Number(user.token_version || 0)) {
            return { user: null, reason: '登录状态已失效，请重新登录', status: 401 }
        }

        const isSuper = isSuperAdmin(user)
        const authUser = {
            userId: decoded.userId,
            user_type: user.user_type,
            userType: user.user_type,
            tokenVersion: Number(user.token_version || 0),
            isSuperAdmin: isSuper,
            is_super_admin: isSuper,
            permissions: getPermissionsForUser({ ...user, userId: decoded.userId, isSuperAdmin: isSuper })
        }

        return {
            user: authUser,
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
            req.user = {
                userId: null,
                user_type: 'visitor',
                userType: 'visitor',
                isSuperAdmin: false,
                is_super_admin: false,
                permissions: []
            }
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
 * yk-upload 使用 XMLHttpRequest 上传，无法附加自定义请求头，
 * 因此上传接口只能从 query 携带凭证，服务端收不到 Authorization 头。
 *
 * 用短期票据代替登录 JWT：
 * - 票据绑定用户 ID 与来源 IP，5 分钟过期且按次消费，
 *   即使 URL 被写进访问日志，泄漏窗口和重放价值都远小于长期 JWT；
 * - 票据校验通过后仍查库确认用户存在且账号未被禁用，
 *   权限口径与普通接口保持一致。
 */
function authMiddlewareFromQuery(req, res, next) {
    // yk-upload 不会处理非 200 响应，认证失败也要用 200 + error 字段返回。
    const reject = (code, message) => res.status(200).json({
        code,
        error: message,
        message
    })

    const queryTicket = typeof req.query.ticket === 'string'
        ? req.query.ticket.trim()
        : ''

    if (!queryTicket) {
        return reject(401, '上传票据不能为空，请重新打开上传窗口')
    }

    const ticketResult = consumeUploadTicket(queryTicket, { ip: req.ip || '' })
    if (!ticketResult.valid) {
        return reject(401, ticketResult.reason || '上传票据无效')
    }

    const uploadResponse = {
        status() {
            return {
                json(payload) {
                    return reject(payload.code, payload.message || '上传认证失败')
                }
            }
        }
    }

    // 票据已经证明「哪个用户在上传」，这里只补足账号状态与用户类型的查询，
    // 让后续控制器拿到的 req.user 与普通接口完全一致。
    return resolveAuthUserById(ticketResult.userId, req, uploadResponse, next)
}

module.exports = { authMiddleware, authMiddlewareFromQuery, optionalAuthMiddleware }
