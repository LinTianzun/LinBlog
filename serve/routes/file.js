const fileController = require('../controller/fileController')
const { authMiddleware, authMiddlewareFromQuery } = require('../middleware/auth')
const { uploadLimit } = require('../middleware/rateLimit')

module.exports = (app) => {
    // 文件分页查询
    app.get('/api/file', authMiddleware, fileController.getFiles)

    // 文件统计（分组栏计数）
    app.get('/api/file/summary', authMiddleware, fileController.getFileSummary)

    // 回收站与恢复
    app.get('/api/file/trash', authMiddleware, fileController.getTrashFiles)
    app.patch('/api/file/restore', authMiddleware, fileController.restoreFiles)
    app.delete('/api/file/trash', authMiddleware, fileController.purgeTrashFiles)
    app.get('/api/file/storage/status', authMiddleware, fileController.getStorageStatus)
    app.post('/api/file/maintenance/cleanup', authMiddleware, fileController.cleanupFiles)

    // 文件上传（yk-upload 走 query token）
    app.post('/api/file/upload', authMiddlewareFromQuery, uploadLimit, fileController.uploadFile)

    // 批量移动分组
    app.patch('/api/file/move', authMiddleware, fileController.moveFiles)

    // 批量删除
    app.delete('/api/file', authMiddleware, fileController.deleteFiles)

    // 下载/预览：浏览器与 yk-image 直接发起 GET，无法附加请求头，
    // 与 /api/uploads/:filename 保持一致不做鉴权
    app.get('/api/file/:id/download', fileController.downloadFile)
}
