const { loadEnvFile } = require('node:process')
const path = require('node:path')
const fs = require('node:fs/promises')

loadEnvFile(path.join(__dirname, '..', '.env'))

const dbBackup = require('../utils/dbBackup')
const backupModel = require('../model/dbModel/backup/index')
const db = require('../model/db/dbnew')

function formatBytes(bytes) {
    const value = Number(bytes || 0)
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

async function main() {
    // 历史表由数据库初始化负责建表，脚本先确保结构就绪再写记录
    await db.initDatabase()

    try {
        const result = await dbBackup.createDatabaseBackup()
        const pruned = await dbBackup.pruneOldBackups()

        await backupModel.insertLog({
            kind: 'backup',
            filename: result.filename,
            sizeBytes: result.sizeBytes,
            checksum: result.checksum,
            tableCount: result.tables,
            rowCount: result.rows,
            durationMs: result.durationMs,
            triggerType: 'manual',
            status: 'success',
        })

        console.log(`[Backup] 完成：${result.filename}`)
        console.log(`[Backup] 大小：${formatBytes(result.sizeBytes)}，${result.tables} 张表 / ${result.rows} 行，耗时 ${result.durationMs}ms`)
        console.log(`[Backup] SHA-256：${result.checksum}`)
        if (pruned.removed.length > 0) {
            console.log(`[Backup] 已清理 ${pruned.removed.length} 个过期备份：${pruned.removed.join(', ')}`)
        }
        console.log(`[Backup] 当前保留 ${pruned.kept.length}/${pruned.retentionCount} 份`)
    } catch (err) {
        console.error('[Backup] 备份失败：', err)
        try {
            await backupModel.insertLog({
                kind: 'backup',
                filename: '',
                triggerType: 'manual',
                status: 'failed',
                errorMessage: err.message,
            })
        } catch (logErr) {
            console.error('[Backup] 写入失败记录也失败：', logErr.message)
        }
        process.exitCode = 1
    } finally {
        try {
            await db.closeDatabase()
        } catch (err) {
            console.error('[Backup] 关闭数据库连接失败：', err.message)
        }
    }
}

main()
