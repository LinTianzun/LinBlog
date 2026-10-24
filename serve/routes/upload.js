const uploadController = require('../controller/uploadController')
const { authMiddlewareFromQuery } = require('../middleware/auth')

module.exports = (app) => {
    app.post('/api/upload/image', authMiddlewareFromQuery, uploadController.uploadImage)
    app.get('/api/uploads/:filename', uploadController.getImage)
}
