const subsetController = require('../controller/subsetController')
const { authMiddleware } = require('../middleware/auth')

module.exports = (app) => {
    app.get('/api/subset', authMiddleware, subsetController.getSubsets)
    app.post('/api/subset', authMiddleware, subsetController.createSubset)
    app.put('/api/subset/:id', authMiddleware, subsetController.updateSubset)
    app.delete('/api/subset/:id', authMiddleware, subsetController.deleteSubset)
}
