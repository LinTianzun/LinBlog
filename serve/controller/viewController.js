const viewModel = require('../model/dbModel/view/index')
const articleModel = require('../model/dbModel/article/index')
const diaryModel = require('../model/dbModel/diary/index')

const TARGET_TYPES = ['article', 'image', 'diary']

/**
 * 访客标识：登录用户按用户ID去重，游客按 IP 去重。
 * IP 会进数据库，因此截断到 120 字符上限内的安全长度。
 */
function buildIdentifier(req) {
    const userId = req.user?.userId
    if (userId) return `u:${userId}`
    const ip = typeof req.ip === 'string' ? req.ip.trim() : ''
    return `ip:${ip || 'unknown'}`.slice(0, 120)
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
