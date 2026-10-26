const recordModel = require('../model/dbModel/record/index')
const { parseUserAgent } = require('../utils/ua')
const { resolvePosition } = require('../utils/geoip')

const PUBLIC_PREFIXES = ['/api/user/login', '/api/user/register', '/api/user/isRegistered']

// 登录/注册/登录页用户信息接口；公开上传接口由 yk-upload 单独调用，一并跳过
function isRecordExempt(path) {
    if (PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'))) {
        return true
    }
    return path.startsWith('/api/uploads/') || path.startsWith('/api/file/') && path.includes('/download')
}

// 异步写访问记录：解析 UA，登录用户可从 auth 中间件取 userId，游客记 NULL
module.exports = function recordMiddleware(req, res, next) {
    if (!req.path.startsWith('/api/') || isRecordExempt(req.path)) {
        return next()
    }

    const { device, browser, os } = parseUserAgent(req.headers['user-agent'])
    const ip = req.ip || ''

    // 地理位置解析是旁路逻辑：未启用或解析失败都记 NULL，写入失败同样不影响请求
    void (async () => {
        let position = null
        try {
            position = await resolvePosition(ip)
        } catch (err) {
            position = null
        }

        try {
            await recordModel.createRecord({
                userId: req.user?.userId ?? null,
                ip,
                position,
                device,
                browser,
                os,
                path: req.path,
            })
        } catch (err) {
            console.error('[Record] 写入访问记录失败：', err.message)
        }
    })()

    next()
}
