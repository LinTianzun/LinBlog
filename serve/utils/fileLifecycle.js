const fileModel = require('../model/dbModel/file/index')
const fileStorage = require('./fileStorage')

const DAY_MS = 24 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000
const DEFAULT_BACKUP_RETENTION_DAYS = 30
const DEFAULT_ORPHAN_GRACE_HOURS = 24
const EXPIRED_BATCH_SIZE = 500

function readPositiveInteger(name, fallback) {
    const parsed = Number.parseInt(process.env[name] ?? '', 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback
}

function readBackupRetentionDays() {
    return readPositiveInteger(
        'LINBLOG_FILE_BACKUP_RETENTION_DAYS',
        DEFAULT_BACKUP_RETENTION_DAYS
    )
}

function readOrphanGraceHours() {
    return readPositiveInteger(
        'LINBLOG_FILE_ORPHAN_GRACE_HOURS',
        DEFAULT_ORPHAN_GRACE_HOURS
    )
}

async function runFileLifecycleCleanup(options = {}) {
    const model = options.fileModel || fileModel
    const storage = options.storage || fileStorage
    const now = Number.isFinite(options.now) ? options.now : Date.now()
    const dryRun = options.dryRun === true
    const retentionDays = options.retentionDays || readBackupRetentionDays()
    const orphanGraceHours = options.orphanGraceHours || readOrphanGraceHours()
    const cutoffMs = now - orphanGraceHours * 60 * 60 * 1000

    const references = await model.findLocalFileReferences()
    const activeNames = new Set()
    const deletedNames = new Set()

    for (const row of references) {
        const name = storage.safeDiskName(row.url)
        if (!name) continue
        if (Number(row.status) === 1) activeNames.add(name)
        else deletedNames.add(name)
    }

    let movedLegacyFiles = 0
    let removedOrphans = 0
    let keptRecentFiles = 0
    const failedFiles = []
    const activeFiles = await storage.listActiveFiles()

    for (const file of activeFiles) {
        if (activeNames.has(file.name)) continue

        if (deletedNames.has(file.name)) {
            if (!dryRun) {
                try {
                    const result = await storage.moveToBackup(file.name)
                    if (result.moved || result.reason === 'already_backed_up') {
                        movedLegacyFiles += 1
                    } else {
                        failedFiles.push({ name: file.name, reason: result.reason })
                    }
                } catch (err) {
                    failedFiles.push({ name: file.name, reason: err.message })
                }
            }
            continue
        }

        if (file.mtimeMs > cutoffMs) {
            keptRecentFiles += 1
            continue
        }

        if (!dryRun) {
            try {
                if (await storage.removeActive(file.name)) removedOrphans += 1
            } catch (err) {
                failedFiles.push({ name: file.name, reason: err.message })
            }
        } else {
            removedOrphans += 1
        }
    }

    const expiredRows = await model.findExpiredDeletedFiles(retentionDays, EXPIRED_BATCH_SIZE)
    let removedExpiredBackups = 0
    const expiredIds = []

    for (const row of expiredRows) {
        if (!dryRun && !storage.isRemoteUrl(row.url)) {
            try {
                if (await storage.removeBackup(row.url)) removedExpiredBackups += 1
            } catch (err) {
                failedFiles.push({ name: row.url, reason: err.message })
                continue
            }
        }
        expiredIds.push(row.id)
    }

    if (!dryRun && expiredIds.length > 0) {
        await model.markBackupDeleted(expiredIds)
    }

    return {
        dryRun,
        retentionDays,
        orphanGraceHours,
        movedLegacyFiles,
        removedOrphans,
        keptRecentFiles,
        removedExpiredBackups,
        expiredRecords: expiredIds.length,
        failedFiles
    }
}

function startFileLifecycle() {
    let interval = null
    const timer = setTimeout(async () => {
        try {
            const result = await runFileLifecycleCleanup()
            if (result.removedOrphans || result.movedLegacyFiles || result.expiredRecords) {
                console.log(
                    `[FileLifecycle] 孤儿 ${result.removedOrphans}，迁移备份 ${result.movedLegacyFiles}，`
                    + `清理过期备份 ${result.removedExpiredBackups}，过期记录 ${result.expiredRecords}`
                )
            }
        } catch (err) {
            console.error('[FileLifecycle] 清理失败：', err.message)
        }

        interval = setInterval(async () => {
            try {
                await runFileLifecycleCleanup()
            } catch (err) {
                console.error('[FileLifecycle] 定时清理失败：', err.message)
            }
        }, DAY_MS)
        if (interval.unref) interval.unref()
    }, FIRST_RUN_DELAY_MS)
    if (timer.unref) timer.unref()

    return {
        stop() {
            clearTimeout(timer)
            if (interval) clearInterval(interval)
            interval = null
        },
        runOnce: () => runFileLifecycleCleanup()
    }
}

module.exports = {
    runFileLifecycleCleanup,
    startFileLifecycle,
    readBackupRetentionDays,
    readOrphanGraceHours
}
