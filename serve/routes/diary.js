const diaryController = require('../controller/diaryController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 日记分页查询（支持关键词搜索）
    app.get('/api/diary', authMiddleware, diaryController.getDiaries)

    // 新建日记
    app.post('/api/diary', authMiddleware, diaryController.createDiary)

    // 删除日记（逻辑删除）
    app.delete('/api/diary/:id', authMiddleware, diaryController.deleteDiary)
}
