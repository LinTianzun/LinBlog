const backupController = require('../controller/backupController')
const { authMiddleware } = require('../middleware/auth')
const { requirePermission } = require('../utils/accessControl')

module.exports = (app) => {
    // 备份总览：磁盘文件、保留策略、容量告警与最近执行结果
    app.get(
        '/api/backup',
        authMiddleware,
        requirePermission('backup.view'),
        backupController.getOverview
    )

    // 备份与演练历史
    app.get(
        '/api/backup/history',
        authMiddleware,
        requirePermission('backup.view'),
        backupController.getHistory
    )

    // 手动备份
    app.post(
        '/api/backup',
        authMiddleware,
        requirePermission('backup.manage'),
        backupController.createBackup
    )

    // 下载备份文件
    app.get(
        '/api/backup/:filename/download',
        authMiddleware,
        requirePermission('backup.manage'),
        backupController.downloadBackup
    )

    // 恢复演练（隔离库验证后自动清理）
    app.post(
        '/api/backup/restore-drill',
        authMiddleware,
        requirePermission('backup.manage'),
        backupController.runRestoreDrill
    )

    // 清理超出保留策略的备份
    app.post(
        '/api/backup/prune',
        authMiddleware,
        requirePermission('backup.manage'),
        backupController.pruneBackups
    )

    // 删除单个备份
    app.delete(
        '/api/backup/:filename',
        authMiddleware,
        requirePermission('backup.manage'),
        backupController.deleteBackup
    )
}
