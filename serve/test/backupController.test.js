const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const dbBackup = require(path.resolve(__dirname, '../utils/dbBackup.js'))
const backupModel = require(path.resolve(__dirname, '../model/dbModel/backup/index.js'))
const backupController = require(path.resolve(__dirname, '../controller/backupController.js'))

function makeResponse() {
    const res = {
        statusCode: 200,
        body: null,
        headers: {},
        downloadCalls: [],
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        },
        setHeader(name, value) {
            this.headers[name] = value
        },
        download(filepath, filename, callback) {
            this.downloadCalls.push({ filepath, filename })
            if (callback) callback(null)
        },
    }
    return res
}

const ADMIN = { userId: 1, userType: 'admin', permissions: ['backup.view', 'backup.manage'] }
const VIEWER = { userId: 2, userType: 'admin', permissions: ['backup.view'] }
const NORMAL = { userId: 3, userType: 'normal', permissions: [] }

function withTempBackupDir(fn) {
    return async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'linblog-ctrl-'))
        const original = process.env.LINBLOG_DB_BACKUP_DIR
        process.env.LINBLOG_DB_BACKUP_DIR = dir
        try {
            await fn(dir)
        } finally {
            if (original === undefined) delete process.env.LINBLOG_DB_BACKUP_DIR
            else process.env.LINBLOG_DB_BACKUP_DIR = original
            await fs.rm(dir, { recursive: true, force: true })
        }
    }
}

test('getOverview rejects accounts without backup.view', withTempBackupDir(async () => {
    const res = makeResponse()
    await backupController.getOverview({ user: NORMAL }, res)
    assert.equal(res.statusCode, 403)
    assert.match(res.body.message, /没有查看数据库备份的权限/)
}))

test('getOverview returns files, retention and capacity level', withTempBackupDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'linlog-20261030-030000.linbak.gz'), Buffer.alloc(2048))
    process.env.LINBLOG_DB_BACKUP_RETENTION = '7'
    process.env.LINBLOG_DB_BACKUP_MAX_BYTES = '1024'
    process.env.LINBLOG_DB_BACKUP_WARN_PERCENT = '80'

    const originalSummary = backupModel.getLatestSummary
    backupModel.getLatestSummary = async () => ({ lastSuccess: null, lastFailure: null, lastDrill: null })

    try {
        const res = makeResponse()
        await backupController.getOverview({ user: VIEWER }, res)

        assert.equal(res.statusCode, 200)
        assert.equal(res.body.data.backups.length, 1)
        assert.equal(res.body.data.totalFiles, 1)
        assert.equal(res.body.data.totalBytes, 2048)
        assert.equal(res.body.data.retentionCount, 7)
        // 2048/1024 = 200%，超过上限应判定为 critical
        assert.equal(res.body.data.capacity.level, 'critical')
        assert.equal(res.body.data.capacity.usedPercent, 200)
    } finally {
        backupModel.getLatestSummary = originalSummary
        delete process.env.LINBLOG_DB_BACKUP_RETENTION
        delete process.env.LINBLOG_DB_BACKUP_MAX_BYTES
        delete process.env.LINBLOG_DB_BACKUP_WARN_PERCENT
    }
}))

test('getOverview reports warning when usage crosses the threshold', withTempBackupDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'a.linbak.gz'), Buffer.alloc(900))
    process.env.LINBLOG_DB_BACKUP_MAX_BYTES = '1000'
    process.env.LINBLOG_DB_BACKUP_WARN_PERCENT = '80'

    const originalSummary = backupModel.getLatestSummary
    backupModel.getLatestSummary = async () => ({ lastSuccess: null, lastFailure: null, lastDrill: null })

    try {
        const res = makeResponse()
        await backupController.getOverview({ user: VIEWER }, res)
        assert.equal(res.body.data.capacity.level, 'warning')
        assert.equal(res.body.data.capacity.usedPercent, 90)
    } finally {
        backupModel.getLatestSummary = originalSummary
        delete process.env.LINBLOG_DB_BACKUP_MAX_BYTES
        delete process.env.LINBLOG_DB_BACKUP_WARN_PERCENT
    }
}))

test('createBackup requires backup.manage', async () => {
    const res = makeResponse()
    await backupController.createBackup({ user: VIEWER, ip: '127.0.0.1' }, res)
    assert.equal(res.statusCode, 403)
})

test('createBackup records success and prunes old files', withTempBackupDir(async (dir) => {
    const originalCreate = dbBackup.createDatabaseBackup
    const originalInsert = backupModel.insertLog
    const logged = []

    dbBackup.createDatabaseBackup = async () => ({
        filename: 'linlog-20261030-030000.linbak.gz',
        sizeBytes: 1024,
        tables: 3,
        rows: 12,
        durationMs: 250,
        checksum: 'a'.repeat(64),
    })
    backupModel.insertLog = async (payload) => { logged.push(payload) }

    // 预置 10 个旧备份，retention=2 时应只留最新两份（含新建的那份）
    for (let i = 0; i < 9; i++) {
        const name = `old-${i}.linbak.gz`
        await fs.writeFile(path.join(dir, name), 'x')
        const time = new Date(Date.now() - (9 - i) * 60_000)
        await fs.utimes(path.join(dir, name), time, time)
    }
    await fs.writeFile(path.join(dir, 'linlog-20261030-030000.linbak.gz'), 'new')

    process.env.LINBLOG_DB_BACKUP_RETENTION = '2'

    try {
        const res = makeResponse()
        await backupController.createBackup({ user: ADMIN, ip: '127.0.0.1' }, res)

        assert.equal(res.statusCode, 200)
        assert.equal(res.body.data.filename, 'linlog-20261030-030000.linbak.gz')
        assert.equal(res.body.data.tables, 3)
        assert.equal(logged.length, 1)
        assert.equal(logged[0].status, 'success')
        assert.equal(logged[0].triggerType, 'manual')

        const remaining = await fs.readdir(dir)
        assert.equal(remaining.length, 2)
    } finally {
        dbBackup.createDatabaseBackup = originalCreate
        backupModel.insertLog = originalInsert
        delete process.env.LINBLOG_DB_BACKUP_RETENTION
    }
}))

test('createBackup records failure history and returns 500', async () => {
    const originalCreate = dbBackup.createDatabaseBackup
    const originalInsert = backupModel.insertLog
    const logged = []

    dbBackup.createDatabaseBackup = async () => {
        throw new Error('磁盘写入失败')
    }
    backupModel.insertLog = async (payload) => { logged.push(payload) }

    try {
        const res = makeResponse()
        await backupController.createBackup({ user: ADMIN, ip: '127.0.0.1' }, res)

        assert.equal(res.statusCode, 500)
        assert.match(res.body.message, /磁盘写入失败/)
        assert.equal(logged.length, 1)
        assert.equal(logged[0].status, 'failed')
        assert.equal(logged[0].errorMessage, '磁盘写入失败')
    } finally {
        dbBackup.createDatabaseBackup = originalCreate
        backupModel.insertLog = originalInsert
    }
})

test('getHistory validates pagination and maps snake_case rows', async () => {
    const originalPage = backupModel.getLogsByPage
    backupModel.getLogsByPage = async ({ pageSize, offset }) => {
        assert.equal(pageSize, 10)
        assert.equal(offset, 0)
        return {
            total: 1,
            list: [{
                id: 9,
                kind: 'backup',
                filename: 'a.linbak.gz',
                target_database: null,
                size_bytes: 4096,
                checksum: 'b'.repeat(64),
                table_count: 3,
                row_count: 100,
                duration_ms: 900,
                trigger_type: 'manual',
                status: 'success',
                error_message: null,
                created_at: '2026-10-30T03:00:00.000Z',
            }],
        }
    }

    try {
        const res = makeResponse()
        await backupController.getHistory({ user: VIEWER, query: {} }, res)
        assert.equal(res.statusCode, 200)
        assert.equal(res.body.data.total, 1)
        assert.equal(res.body.data.list[0].sizeBytes, 4096)
        assert.equal(res.body.data.list[0].tableCount, 3)
        assert.equal(res.body.data.list[0].createdAt, '2026-10-30T03:00:00.000Z')
    } finally {
        backupModel.getLogsByPage = originalPage
    }
})

test('getHistory rejects invalid page size', async () => {
    const res = makeResponse()
    await backupController.getHistory({ user: VIEWER, query: { pageSize: '999' } }, res)
    assert.equal(res.statusCode, 400)
})

test('downloadBackup rejects path traversal', withTempBackupDir(async () => {
    const res = makeResponse()
    await backupController.downloadBackup({
        user: ADMIN,
        params: { filename: '../secret.linbak.gz' },
    }, res)
    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /无效的备份文件名/)
}))

test('downloadBackup returns 404 when the file is gone', withTempBackupDir(async () => {
    const res = makeResponse()
    await backupController.downloadBackup({
        user: ADMIN,
        params: { filename: 'missing.linbak.gz' },
    }, res)
    assert.equal(res.statusCode, 404)
}))

test('downloadBackup streams an existing file', withTempBackupDir(async (dir) => {
    const filename = 'linlog-20261030-030000.linbak.gz'
    await fs.writeFile(path.join(dir, filename), 'dump')

    const res = makeResponse()
    await backupController.downloadBackup({
        user: ADMIN,
        params: { filename },
        ip: '127.0.0.1',
    }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.downloadCalls.length, 1)
    assert.equal(res.downloadCalls[0].filename, filename)
    assert.ok(res.downloadCalls[0].filepath.endsWith(filename))
}))

test('deleteBackup requires backup.manage and reports missing files', withTempBackupDir(async () => {
    const denied = makeResponse()
    await backupController.deleteBackup({ user: VIEWER, params: { filename: 'a.linbak.gz' } }, denied)
    assert.equal(denied.statusCode, 403)

    const res = makeResponse()
    await backupController.deleteBackup({ user: ADMIN, params: { filename: 'a.linbak.gz' } }, res)
    assert.equal(res.statusCode, 404)
}))

test('deleteBackup removes the file', withTempBackupDir(async (dir) => {
    const filename = 'linlog-20261030-030000.linbak.gz'
    await fs.writeFile(path.join(dir, filename), 'dump')

    const res = makeResponse()
    await backupController.deleteBackup({
        user: ADMIN,
        params: { filename },
        ip: '127.0.0.1',
    }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.data.deleted, true)
    await assert.rejects(fs.access(path.join(dir, filename)))
}))

test('pruneBackups reports nothing to remove when within retention', withTempBackupDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'only.linbak.gz'), 'x')
    process.env.LINBLOG_DB_BACKUP_RETENTION = '5'

    try {
        const res = makeResponse()
        await backupController.pruneBackups({ user: ADMIN, ip: '127.0.0.1' }, res)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body.data.removed, [])
    } finally {
        delete process.env.LINBLOG_DB_BACKUP_RETENTION
    }
}))

test('buildDrillDatabaseName is filesystem/database safe', () => {
    const name = backupController.buildDrillDatabaseName('lin-blog.prod')
    assert.match(name, /^lin-blog_prod_drill_[0-9a-f]{6}$/)
    assert.ok(name.length <= 64)
})

test('runRestoreDrill rejects unknown filenames before touching the database', async () => {
    const res = makeResponse()
    await backupController.runRestoreDrill({
        user: ADMIN,
        body: { filename: '../../etc/passwd' },
    }, res)
    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /无效的备份文件名/)
})
