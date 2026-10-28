const viewModel = require('../model/dbModel/view/index')
const articleModel = require('../model/dbModel/article/index')
const diaryModel = require('../model/dbModel/diary/index')
const crypto = require('node:crypto')

const TARGET_TYPES = ['article', 'image', 'diary']

/**
 * 访客标识：登录用户按用户ID去重，游客按「IP + UA 哈希」去重。
 * 纯 IP 会把同一 NAT 出口下的多个真实访客合并计数，叠加 UA 可区分
 * 不同浏览器/设备；哈希后固定 40 位，不落明文 IP，也不会超出列宽。
 */
function buildIdentifier(req) {
    const userId = req.user?.userId
    if (userId) return `u:${userId}`
    const ip = typeof req.ip === 'string' ? req.ip.trim() : ''
    const userAgent = typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : ''
    const digest = crypto.createHash('sha256').update(`${ip}\n${userAgent}`).digest('hex').slice(0, 40)
    return `g:${digest}`
}

/**
 * 校验目标是否可由门户浏览：文章必须已发布，随笔必须未删除。
 * 未对草稿/已删除内容计数，避免门户因数错 UPDATE 而泄露“存在性”。
 */
async function findVisibleTarget(targetType, targetId) {
    if (targetType === 'diary') {
        const diary = await diaryModel.findDiaryById(targetId)
        return diary ? { exists: true } : { exists: false }
    }

    const article = await articleModel.findAtricleById(targetId, null, 'visitor')
    return { exists: Boolean(article) }
}

/**
 * 记录一次门户浏览（公开接口，匿名可调用）
 * POST /api/public/view  body: { targetType, targetId }
 */
async function recordView(req, res) {
    try {
        const rawType = typeof req.body?.targetType === 'string' ? req.body.targetType.trim() : ''
        const targetType = viewModel.normalizeTargetType(rawType)
        const targetId = Number(req.body?.targetId)

        if (!TARGET_TYPES.includes(targetType)) {
            return res.status(400).json({
                code: 400,
                message: '浏览目标类型仅支持 article/image/diary'
            })
        }
        if (!Number.isSafeInteger(targetId) || targetId <= 0) {
            return res.status(400).json({ code: 400, message: '请传入有效的浏览目标ID' })
        }

        const target = await findVisibleTarget(targetType, targetId)
        if (!target.exists) {
            return res.status(404).json({ code: 404, message: '浏览目标不存在或未发布' })
        }

        const result = await viewModel.recordView(targetType, targetId, buildIdentifier(req))

        res.json({
            code: 200,
            message: '浏览已记录',
            data: {
                targetType,
                targetId,
                counted: result.counted,
                views: result.views
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '浏览量记录失败：' + err.message })
    }
}

module.exports = { recordView, buildIdentifier }
