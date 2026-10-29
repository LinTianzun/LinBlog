const diaryController = require('../controller/diaryController')
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

/**
 * 公开读取标记：门户随笔列表不按登录用户收窄，任何登录态都能看到完整内容。
 * 后台列表仍然保留「普通用户只看自己名下」的归属过滤。
 */
function publicRead(req, res, next) {
    req.publicRead = true
    return next()
}

module.exports = (app) => {
    // 公开的随笔列表（访客门户展示；随笔无草稿状态，status=1 即对外可见）
    app.get('/api/public/diary', publicRead, optionalAuthMiddleware, diaryController.getDiaries)
    app.get('/api/public/diary/:id', publicRead, optionalAuthMiddleware, diaryController.getPublicDiaryById)

    // 日记分页查询（支持关键词搜索）
    app.get('/api/diary', authMiddleware, diaryController.getDiaries)

    // 新建日记
    app.post('/api/diary', authMiddleware, requirePermission('diary.create'), diaryController.createDiary)

    // 编辑日记（标题/内容/图片/天气）
    app.put('/api/diary/:id', authMiddleware, diaryController.updateDiary)

    // 删除日记（逻辑删除）
    app.delete('/api/diary/:id', authMiddleware, diaryController.deleteDiary)
}
