const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const defaultActiveDir = path.resolve(
    process.env.LINBLOG_FILE_STORAGE_DIR || path.join(__dirname, '..', 'data', 'files')
)
const defaultBackupDir = path.resolve(
    process.env.LINBLOG_FILE_BACKUP_DIR || path.join(__dirname, '..', 'storage', 'file-backups')
)

function safeDiskName(value) {
    const raw = String(value || '')
    if (!raw || raw.includes('\0')) return null

    const name = path.basename(raw)
    if (name !== raw || name === '.' || name === '..' || name === '.gitkeep') {
        return null
    }
    return name
}

function isRemoteUrl(value) {
    return /^https?:\/\//i.test(String(value || ''))
}

async function pathExists(filePath) {
    try {
        await fsp.access(filePath, fs.constants.F_OK)
        return true
    } catch {
        return false
    }
}

async function movePath(source, target) {
    try {
        await fsp.rename(source, target)
    } catch (err) {
        if (err.code !== 'EXDEV') throw err
        await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL)
        await fsp.unlink(source)
    }
}

function createFileStorage({
    activeDir = defaultActiveDir,
    backupDir = defaultBackupDir
} = {}) {
    const resolvedActiveDir = path.resolve(activeDir)
    const resolvedBackupDir = path.resolve(backupDir)

    function ensureStorageDirsSync() {
        fs.mkdirSync(resolvedActiveDir, { recursive: true })
        fs.mkdirSync(resolvedBackupDir, { recursive: true })
    }

    async function ensureStorageDirs() {
        await Promise.all([
            fsp.mkdir(resolvedActiveDir, { recursive: true }),
            fsp.mkdir(resolvedBackupDir, { recursive: true })
        ])
    }

    async function moveToBackup(value) {
        await ensureStorageDirs()
        const name = safeDiskName(value)
        if (!name) return { moved: false, reason: 'invalid_name' }

        const source = path.join(resolvedActiveDir, name)
        const target = path.join(resolvedBackupDir, name)
        if (!await pathExists(source)) {
            if (await pathExists(target)) {
                return { moved: false, reason: 'already_backed_up' }
            }
            return { moved: false, reason: 'missing' }
        }
        if (await pathExists(target)) {
            return { moved: false, reason: 'backup_exists' }
        }

        await movePath(source, target)
        return { moved: true, reason: null }
    }

    async function restoreFromBackup(value) {
        await ensureStorageDirs()
        const name = safeDiskName(value)
        if (!name) return { restored: false, reason: 'invalid_name' }

        const source = path.join(resolvedBackupDir, name)
        const target = path.join(resolvedActiveDir, name)
        if (!await pathExists(source)) {
            if (await pathExists(target)) {
                return { restored: false, reason: 'already_active' }
            }
            return { restored: false, reason: 'missing_backup' }
        }
        if (await pathExists(target)) {
            return { restored: false, reason: 'active_exists' }
        }

        await movePath(source, target)
        return { restored: true, reason: null }
    }

    async function removeActive(value) {
        const name = safeDiskName(value)
        if (!name) return false
        const target = path.join(resolvedActiveDir, name)
        if (!await pathExists(target)) return false
        await fsp.unlink(target)
        return true
    }

    async function removeBackup(value) {
        const name = safeDiskName(value)
        if (!name) return false
        const target = path.join(resolvedBackupDir, name)
        if (!await pathExists(target)) return false
        await fsp.unlink(target)
        return true
    }

    async function listFiles(directory) {
        await ensureStorageDirs()
        const entries = await fsp.readdir(directory, { withFileTypes: true })
        const files = []

        for (const entry of entries) {
            if (!entry.isFile() || entry.name === '.gitkeep') continue
            const filePath = path.join(directory, entry.name)
            const stat = await fsp.stat(filePath)
            files.push({ name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs })
        }
        return files
    }

    async function listActiveFiles() {
        return listFiles(resolvedActiveDir)
    }

    async function listBackupFiles() {
        return listFiles(resolvedBackupDir)
    }

    async function backupExists(value) {
        const name = safeDiskName(value)
        return Boolean(name) && pathExists(path.join(resolvedBackupDir, name))
    }

    async function activeExists(value) {
        const name = safeDiskName(value)
        return Boolean(name) && pathExists(path.join(resolvedActiveDir, name))
    }

    ensureStorageDirsSync()

    return {
        activeDir: resolvedActiveDir,
        backupDir: resolvedBackupDir,
        safeDiskName,
        isRemoteUrl,
        ensureStorageDirs,
        moveToBackup,
        restoreFromBackup,
        removeActive,
        removeBackup,
        listActiveFiles,
        listBackupFiles,
        backupExists,
        activeExists
    }
}

const defaultStorage = createFileStorage()

module.exports = {
    activeDir: defaultStorage.activeDir,
    backupDir: defaultStorage.backupDir,
    safeDiskName,
    isRemoteUrl,
    createFileStorage,
    ensureStorageDirs: defaultStorage.ensureStorageDirs,
    moveToBackup: defaultStorage.moveToBackup,
    restoreFromBackup: defaultStorage.restoreFromBackup,
    removeActive: defaultStorage.removeActive,
    removeBackup: defaultStorage.removeBackup,
    listActiveFiles: defaultStorage.listActiveFiles,
    listBackupFiles: defaultStorage.listBackupFiles,
    backupExists: defaultStorage.backupExists,
    activeExists: defaultStorage.activeExists
}
