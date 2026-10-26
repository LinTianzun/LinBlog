const { issueUploadTicket, TICKET_TTL_MS } = require('../utils/uploadTicket')

/**
 * 签发一张短期上传票据。
 * 前端在打开上传窗口时换取票据，再拼到 yk-upload 的 URL 上；
 * 这样 URL 里流通的是 5 分钟失效的一次性票据，而不是长期有效的登录 JWT。
 */
async function createUploadTicket(req, res) {
    try {
        // 票据在服务端绑定当前用户与来源 IP，URL 里流通的不再是登录 JWT
        const issued = issueUploadTicket(req.user?.userId, { ip: req.ip || '' })
        if (issued.error) {
            return res.status(429).json({ code: 429, message: issued.error })
        }

        const { ticket, expiresAt, uses } = issued

        res.json({
            code: 200,
            message: '上传票据已签发',
            data: {
                ticket,
                expiresAt: new Date(expiresAt).toISOString(),
                expiresInMs: TICKET_TTL_MS,
                // 前端据此限制单次上传的文件数，避免票据次数不够用
                uses
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '上传票据签发失败：' + err.message })
    }
}

module.exports = { createUploadTicket }
