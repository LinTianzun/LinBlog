const commentController = require('../controller/commentController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    //  查看所有的评论
    app.get('/api/comment/all', authMiddleware, commentController.getAllComments)
}