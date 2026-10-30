const fs = require('node:fs')
const path = require('node:path')
const backupModel = require('../model/dbModel/backup/index')
const { writeSystemLog } = require('../utils/logHelper')
const { hasPermission } = require('../utils/accessControl')
const { formatPaginationParams } = require('../utils/paginationUtil')
const dbBackup = require('../utils/dbBackup')
const config = require('../config/default')

/**
 * 备份总览：磁盘文件、保留策略、容量与最近一次成功/失败/演练。
 * 容量告警阈值按「单份备份的预估上限」判断，库越大越早告警。
 */
async function getOverview(req, res) {
    try {
        if (!hasPermission(req.user, 'backup.view')) {
            return res.status(403).json({ code: 403, message: '当前账号没有查看数据库备份的权限' })
        }

        const [backups, usage, latest] = await Promise.all([
            dbBackup.listDatabaseBackups(),
            dbBackup.getBackupDirectoryUsage(),
            backupModel.getLatestSummary(),
        ])

        const retentionCount = dbBackup.readRetentionCount()
        const maxBytes = Number(process.env.LINBLOG_DB_BACKUP_MAX_BYTES) || 0
        const warnPercent = clampPercent(
            Number.parseInt(process.env.LINBLOG_DB_BACKUP_WARN_PERCENT ?? '', 10),
            80
        )
        const usedPercent = maxBytes > 0
            ? Math.round((usage.bytes / maxBytes) * 1000) / 10
            : 0

        let level = 'ok'
        if (maxBytes > 0) {
            if (usedPercent >= 100) level = 'critical'
            else if (usedPercent >= warnPercent) level = 'warning'
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                backups,
                totalBytes: usage.bytes,
                totalFiles: usage.files,
                retentionCount,
                backupHour: dbBackup.readBackupHour(),
                capacity: {
                    usedBytes: usage.bytes,
                    maxBytes,
                    usedPercent,
                    warnPercent,
                    level,
                },
                latest,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '数据库备份总览查询失败：' + err.message })
    }
}

/**
 * 手动触发一次备份，成功后按保留策略清理。
 */
async function createBackup(req, res) {
    try {
        if (!hasPermission(req.user, 'backup.manage')) {
            return res.status(403).json({ code: 403, message: '当前账号没有执行数据库备份的权限' })
        }

        let result
        try {
            result = await dbBackup.createDatabaseBackup()
        } catch (err) {
            await recordFailure({ req, error: err, triggerType: 'manual' })
            return res.status(500).json({ code: 500, message: '数据库备份失败：' + err.message })
        }

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
        }).catch((err) => console.error('[DBBackup] 写入备份历史失败：', err.message))

        writeSystemLog({
            userId: req.user.userId,
            action: 'create',
            module: 'backup',
            targetType: 'database',
            targetId: null,
            detail: `手动备份数据库 ${result.filename}（${result.tables} 表 / ${result.rows} 行）`,
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: '数据库备份完成',
            data: {
                filename: result.filename,
                sizeBytes: result.sizeBytes,
                tables: result.tables,
                rows: result.rows,
                durationMs: result.durationMs,
                checksum: result.checksum,
                pruned: pruned.removed,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '数据库备份失败：' + err.message })
    }
}

/**
 * 备份历史分页查询。
 */
async function getHistory(req, res) {
    try {
        if (!hasPermission(req.user, 'backup.view')) {
            return res.status(403).json({ code: 403, message: '当前账号没有查看数据库备份的权限' })
        }

        const params = formatPaginationParams(req.query, {
            defaultPageSize: 10,
            maxPageSize: 50,
        })
        if (!params.success) {
            return res.status(400).json({ code: 400, message: params.errorMsg })
        }

        const { page, pageSize, offset } = params.data
        const kind = typeof req.query.kind === 'string' ? req.query.kind : ''
        const status = typeof req.query.status === 'string' ? req.query.status : ''
        const { list, total } = await backupModel.getLogsByPage({ kind, status, pageSize, offset })

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                total,
                page,
                pageSize,
                totalPage: Math.ceil(total / pageSize),
                list: list.map(toHistoryItem),
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '备份历史查询失败：' + err.message })
    }
}

/**
 * 下载备份文件：只允许已存在于备份目录中的文件名。
 */
async function downloadBackup(req, res) {
    try {
        if (!hasPermission(req.user, 'backup.manage')) {
            return res.status(403).json({ code: 403, message: '当前账号没有下载数据库备份的权限' })
        }

        const filename = dbBackup.assertSafeBackupName(req.params.filename)
        const filepath = path.join(dbBackup.readBackupDir(), filename)
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ code: 404, message: '备份文件不存在' })
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'system',
            module: 'backup',
            targetType: 'database',
            targetId: null,
            detail: `下载数据库备份 ${filename}`,
            ip: req.ip || null,
        })

        res.download(filepath, filename, (err) => {
            if (err && !res.headersSent) {
                res.status(500).json({ code: 500, message: '备份下载失败：' + err.message })
            }
        })
    } catch (err) {
        res.status(400).json({ code: 400, message: err.message })
    }
}

/**
 * 删除单个备份文件。
 */
async function deleteBackup(req, res) {
    try {
        if (!hasPermission(req.user, 'backup.manage')) {
            return res.status(403).json({ code: 403, message: '当前账号没有删除数据库备份的权限' })
        }

        const result = await dbBackup.deleteDatabaseBackup(req.params.filename)
        if (!result.deleted) {
            return res.status(404).json({ code: 404, message: '备份文件不存在' })
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'delete',
            module: 'backup',
            targetType: 'database',
            targetId: null,
            detail: `删除数据库备份 ${result.filename}`,
            ip: req.ip || null,
        })

        res.json({ code: 200, message: '备份已删除', data: result })
    } catch (err) {
        res.status(400).json({ code: 400, message: err.message })
    }
}

/**
 * 恢复演练：把备份还原到独立的临时库，验证备份可用后再删库。
 * 生产库完全不受影响；这是「可恢复」而非「已恢复」的证明。
 */
async function runRestoreDrill(req, res) {
    try {
        if (!hasPermission(req.user, 'backup.manage')) {
            return res.status(403).json({ code: 403, message: '当前账号没有执行恢复演练的权限' })
        }

        const filename = dbBackup.assertSafeBackupName(req.body?.filename)
        const drillDatabase = buildDrillDatabaseName(config.database.DB)

        let result
        try {
            result = await dbBackup.restoreDatabaseBackup({
                filename,
                targetDatabase: drillDatabase,
            })
        } catch (err) {
            await recordFailure({
                req,
                error: err,
                triggerType: 'manual',
                kind: 'drill',
                filename,
                targetDatabase: drillDatabase,
            })
            return res.status(500).json({ code: 500, message: '恢复演练失败：' + err.message })
        }

        // 演练库只是验证载体，验证完成后立即清理，避免长期占用磁盘
        let cleaned = true
        try {
            await dropDatabase(drillDatabase)
        } catch (err) {
            cleaned = false
            console.error('[DBBackup] 清理演练库失败：', err.message)
        }

        await backupModel.insertLog({
            kind: 'drill',
            filename,
            targetDatabase: drillDatabase,
            tableCount: result.tables,
            rowCount: result.rows,
            durationMs: result.durationMs,
            triggerType: 'manual',
            status: 'success',
        }).catch((err) => console.error('[DBBackup] 写入演练历史失败：', err.message))

        writeSystemLog({
            userId: req.user.userId,
            action: 'system',
            module: 'backup',
            targetType: 'database',
            targetId: null,
            detail: `恢复演练 ${filename} -> ${drillDatabase}（${result.tables} 表 / ${result.rows} 行）`,
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: cleaned ? '恢复演练通过，临时库已清理' : '恢复演练通过，但临时库清理失败',
            data: { ...result, temporaryDatabaseCleaned: cleaned },
        })
    } catch (err) {
        res.status(400).json({ code: 400, message: err.message })
    }
}

/**
 * 手动清理过期备份。
 */
async function pruneBackups(req, res) {
    try {
        if (!hasPermission(req.user, 'backup.manage')) {
            return res.status(403).json({ code: 403, message: '当前账号没有清理数据库备份的权限' })
        }

        const result = await dbBackup.pruneOldBackups()
        if (result.removed.length > 0) {
            writeSystemLog({
                userId: req.user.userId,
                action: 'delete',
                module: 'backup',
                targetType: 'database',
                targetId: null,
                detail: `清理 ${result.removed.length} 个过期数据库备份`,
                ip: req.ip || null,
            })
        }

        res.json({
            code: 200,
            message: result.removed.length > 0 ? '过期备份已清理' : '没有需要清理的备份',
            data: result,
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '备份清理失败：' + err.message })
    }
}

function buildDrillDatabaseName(databaseName) {
    const suffix = cryptoRandomSuffix()
    const base = String(databaseName || 'linlog').replace(/[^A-Za-z0-9_$-]/g, '_').slice(0, 40)
    return `${base}_drill_${suffix}`
}

function cryptoRandomSuffix() {
    return require('node:crypto').randomBytes(3).toString('hex')
}

/**
 * 删除演练库：单独连接不带 database，避免删掉正在使用的库。
 */
async function dropDatabase(databaseName) {
    if (!/^[A-Za-z0-9_$-]{1,64}$/.test(databaseName)) {
        throw new Error('无效的演练库名')
    }
    const mysql = require('mysql2')
    const connection = mysql.createConnection({
        host: config.database.HOST,
        port: config.database.PORT,
        user: config.database.USER,
        password: config.database.PASSWORD,
    })
    try {
        await new Promise((resolve, reject) => {
            connection.connect((err) => err ? reject(err) : resolve())
        })
        await new Promise((resolve, reject) => {
            connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``, (err) => {
                err ? reject(err) : resolve()
            })
        })
    } finally {
        await new Promise((resolve) => connection.end(() => resolve()))
    }
}

async function recordFailure({ req, error, triggerType, kind = 'backup', filename = null, targetDatabase = null }) {
    await backupModel.insertLog({
        kind,
        filename: filename || '',
        targetDatabase,
        triggerType,
        status: 'failed',
        errorMessage: error.message,
    }).catch((logErr) => console.error('[DBBackup] 写入失败历史失败：', logErr.message))

    writeSystemLog({
        userId: req.user.userId,
        action: 'system',
        module: 'backup',
        targetType: 'database',
        targetId: null,
        detail: `数据库${kind === 'drill' ? '恢复演练' : '备份'}失败：${error.message}`,
        ip: req.ip || null,
    })
}

function clampPercent(value, fallback) {
    if (!Number.isFinite(value)) return fallback
    return Math.min(Math.max(value, 1), 100)
}

function toHistoryItem(row) {
    return {
        id: row.id,
        kind: row.kind,
        filename: row.filename,
        targetDatabase: row.target_database,
        sizeBytes: Number(row.size_bytes || 0),
        checksum: row.checksum,
        tableCount: row.table_count == null ? null : Number(row.table_count),
        rowCount: row.row_count == null ? null : Number(row.row_count),
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
        triggerType: row.trigger_type,
        status: row.status,
        errorMessage: row.error_message,
        createdAt: row.created_at,
    }
}

module.exports = {
    getOverview,
    createBackup,
    getHistory,
    downloadBackup,
    deleteBackup,
    runRestoreDrill,
    pruneBackups,
    buildDrillDatabaseName,
    toHistoryItem,
}
