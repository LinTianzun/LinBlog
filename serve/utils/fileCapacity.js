const fs = require('node:fs/promises')
const path = require('node:path')
const fileStorage = require('./fileStorage')

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_WARN_PERCENT = 80

function readPositiveInteger(name, fallback) {
    const parsed = Number.parseInt(process.env[name] ?? '', 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback
}

function readMaxBackupBytes() {
    return readPositiveInteger('LINBLOG_FILE_BACKUP_MAX_BYTES', DEFAULT_MAX_BYTES)
}

function readWarnPercent() {
    const parsed = Number.parseInt(process.env.LINBLOG_FILE_BACKUP_WARN_PERCENT ?? '', 10)
    if (!Number.isFinite(parsed)) return DEFAULT_WARN_PERCENT
    return Math.min(Math.max(parsed, 1), 100)
}

async function directoryUsage(directory) {
    let bytes = 0
    let files = 0
    if (!directory) return { bytes, files }

    try {
        const entries = await fs.readdir(directory, { withFileTypes: true })
        for (const entry of entries) {
            if (!entry.isFile() || entry.name === '.gitkeep') continue
            const stat = await fs.stat(path.join(directory, entry.name))
            bytes += stat.size
            files += 1
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err
    }

    return { bytes, files }
}

/**
 * 备份区容量统计：本地备份 + 已配置的跨盘镜像目录。
 * 对象存储容量无法通过 S3 通用接口直接读取，这里只展示是否启用。
 */
async function getBackupCapacity(options = {}) {
    const storage = options.storage || fileStorage
    const offsite = options.offsite
    const maxBytes = options.maxBytes ?? readMaxBackupBytes()
    const warnPercent = options.warnPercent ?? readWarnPercent()

    const local = await directoryUsage(storage.backupDir)
    let mirror = { bytes: 0, files: 0 }
    const offsiteDescription = readOffsiteDescription(offsite)
    if (offsiteDescription?.mirrorDir) {
        mirror = await directoryUsage(offsiteDescription.mirrorDir)
    }

    const usedBytes = local.bytes + mirror.bytes
    const usedPercent = maxBytes > 0
        ? Math.round((usedBytes / maxBytes) * 1000) / 10
        : 0

    let level = 'ok'
    if (usedPercent >= 100) level = 'critical'
    else if (usedPercent >= warnPercent) level = 'warning'

    return {
        usedBytes,
        maxBytes,
        usedPercent,
        warnPercent,
        level,
        local,
        mirror,
        offsite: offsiteDescription
    }
}

function readOffsiteDescription(offsite) {
    if (!offsite || typeof offsite.describe !== 'function') return null
    try {
        return offsite.describe()
    } catch {
        return null
    }
}

module.exports = {
    getBackupCapacity,
    directoryUsage,
    readMaxBackupBytes,
    readWarnPercent
}
