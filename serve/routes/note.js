const noteController = require('../controller/noteController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    // 后台私人笔记：登录后按本人隔离，不开放给访客编辑
    app.get('/api/note', authMiddleware, noteController.getNotes)
    app.get('/api/note/summary', authMiddleware, noteController.getNoteSummary)
    app.post('/api/note', authMiddleware, noteController.createNote)
    app.get('/api/note/:id', authMiddleware, noteController.getNoteById)
    app.put('/api/note/:id', authMiddleware, noteController.updateNote)
    app.delete('/api/note/:id', authMiddleware, noteController.deleteNote)

    // 公开花园：只读已发布笔记
    app.get('/api/public/garden', noteController.getPublicGarden)
    // 图谱是固定路径，必须先于 /:id 挂载
    app.get('/api/public/garden/graph', noteController.getPublicGardenGraph)
    app.get('/api/public/garden/:id', noteController.getPublicNote)
}
