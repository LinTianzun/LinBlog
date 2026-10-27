const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET ||= 'file-lifecycle-test-secret-0123456789abcdef'
process.env.LINBLOG_ALLOWED_ORIGINS ||= 'http://localhost:5173'

const { createFileStorage } = require(path.resolve(__dirname, '../utils/fileStorage.js'))
const {
    runFileLifecycleCleanup,
    readBackupRetentionDays,
    readOrphanGraceHours
} = require(path.resolve(__dirname, '../utils/fileLifecycle.js'))

async function createTempStorage(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'linblog-file-lifecycle-'))
    t.after(() => fs.rm(root, { recursive: true, force: true }))
    return {
        root,
        storage: createFileStorage({
            activeDir: path.join(root, 'active'),
            backupDir: path.join(root, 'backup')
        })
    }
}

test('file storage moves deleted files to backup and restores them', async (t) => {
    const { storage } = await createTempStorage(t)
    await storage.ensureStorageDirs()
    await fs.writeFile(path.join(storage.activeDir, 'sample.txt'), 'hello')

    const moved = await storage.moveToBackup('sample.txt')
    assert.equal(moved.moved, true)
    assert.equal(await storage.activeExists('sample.txt'), false)
    assert.equal(await storage.backupExists('sample.txt'), true)

    const restored = await storage.restoreFromBackup('sample.txt')
    assert.equal(restored.restored, true)
    assert.equal(await storage.activeExists('sample.txt'), true)
    assert.equal(await storage.backupExists('sample.txt'), false)
})

test('file storage rejects traversal names and never touches .gitkeep', async (t) => {
    const { storage } = await createTempStorage(t)
    await storage.ensureStorageDirs()

    assert.equal(storage.safeDiskName('../secret.txt'), null)
    assert.equal(storage.safeDiskName('nested/file.txt'), null)
    assert.equal(storage.safeDiskName('.gitkeep'), null)

    const moved = await storage.moveToBackup('../secret.txt')
    assert.deepEqual(moved, { moved: false, reason: 'invalid_name' })
})

test('cleanup keeps referenced files, moves legacy deletions, and removes old orphans', async (t) => {
    const { storage } = await createTempStorage(t)
    await storage.ensureStorageDirs()

    const activePath = path.join(storage.activeDir, 'active.txt')
    const oldOrphanPath = path.join(storage.activeDir, 'old-orphan.bin')
    const recentOrphanPath = path.join(storage.activeDir, 'recent-orphan.bin')
    const legacyDeletedPath = path.join(storage.activeDir, 'legacy-deleted.txt')

    await Promise.all([
        fs.writeFile(activePath, 'active'),
        fs.writeFile(oldOrphanPath, 'old'),
        fs.writeFile(recentOrphanPath, 'recent'),
        fs.writeFile(legacyDeletedPath, 'legacy')
    ])

    const oldTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    await Promise.all([
        fs.utimes(oldOrphanPath, oldTime, oldTime),
        fs.utimes(legacyDeletedPath, oldTime, oldTime)
    ])

    const marked = []
    const model = {
        async findLocalFileReferences() {
            return [
                { id: 1, url: 'active.txt', status: 1 },
                { id: 2, url: 'legacy-deleted.txt', status: 0 }
            ]
        },
        async findExpiredDeletedFiles() { return [] },
        async markBackupDeleted(ids) { marked.push(...ids); return ids.length }
    }

    const result = await runFileLifecycleCleanup({
        fileModel: model,
        storage,
        now: Date.now(),
        orphanGraceHours: 24
    })

    assert.equal(await storage.activeExists('active.txt'), true)
    assert.equal(await storage.activeExists('old-orphan.bin'), false)
    assert.equal(await storage.activeExists('recent-orphan.bin'), true)
    assert.equal(await storage.activeExists('legacy-deleted.txt'), false)
    assert.equal(await storage.backupExists('legacy-deleted.txt'), true)
    assert.equal(result.movedLegacyFiles, 1)
    assert.equal(result.removedOrphans, 1)
    assert.equal(result.keptRecentFiles, 1)
    assert.deepEqual(marked, [])
})

test('cleanup removes expired backups and marks their records', async (t) => {
    const { storage } = await createTempStorage(t)
    await storage.ensureStorageDirs()
    await fs.writeFile(path.join(storage.backupDir, 'expired.bin'), 'expired')

    const marked = []
    const model = {
        async findLocalFileReferences() { return [] },
        async findExpiredDeletedFiles(days, limit) {
            assert.equal(days, 30)
            assert.ok(limit > 0)
            return [
                { id: 8, url: 'expired.bin' },
                { id: 9, url: 'missing.bin' }
            ]
        },
        async markBackupDeleted(ids) { marked.push(...ids); return ids.length }
    }

    const result = await runFileLifecycleCleanup({
        fileModel: model,
        storage,
        retentionDays: 30
    })

    assert.equal(await storage.backupExists('expired.bin'), false)
    assert.equal(result.removedExpiredBackups, 1)
    assert.equal(result.expiredRecords, 2)
    assert.deepEqual(marked, [8, 9])
})

test('file lifecycle env values reject zero, negatives, and malformed input', () => {
    const previousBackupDays = process.env.LINBLOG_FILE_BACKUP_RETENTION_DAYS
    const previousGraceHours = process.env.LINBLOG_FILE_ORPHAN_GRACE_HOURS

    try {
        for (const value of ['0', '-1', 'abc', '']) {
            process.env.LINBLOG_FILE_BACKUP_RETENTION_DAYS = value
            process.env.LINBLOG_FILE_ORPHAN_GRACE_HOURS = value
            assert.equal(readBackupRetentionDays(), 30)
            assert.equal(readOrphanGraceHours(), 24)
        }

        process.env.LINBLOG_FILE_BACKUP_RETENTION_DAYS = '7'
        process.env.LINBLOG_FILE_ORPHAN_GRACE_HOURS = '6'
        assert.equal(readBackupRetentionDays(), 7)
        assert.equal(readOrphanGraceHours(), 6)
    } finally {
        if (previousBackupDays === undefined) delete process.env.LINBLOG_FILE_BACKUP_RETENTION_DAYS
        else process.env.LINBLOG_FILE_BACKUP_RETENTION_DAYS = previousBackupDays
        if (previousGraceHours === undefined) delete process.env.LINBLOG_FILE_ORPHAN_GRACE_HOURS
        else process.env.LINBLOG_FILE_ORPHAN_GRACE_HOURS = previousGraceHours
    }
})
