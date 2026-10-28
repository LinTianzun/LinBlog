const uploadController = require('../controller/uploadController')
const { authMiddlewareFromQuery } = require('../middleware/auth')
const { uploadLimit } = require('../middleware/rateLimit')

module.exports = (app) => {
    app.post('/api/upload/image', authMiddlewareFromQuery, uploadLimit, uploadController.uploadImage)
    app.get('/api/uploads/:filename', uploadController.getImage)
}
