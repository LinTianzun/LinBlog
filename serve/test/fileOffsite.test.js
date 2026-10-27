const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET ||= 'file-lifecycle-test-secret-0123456789abcdef'
process.env.LINBLOG_ALLOWED_ORIGINS ||= 'http://localhost:5173'

const fileStorage = require(path.resolve(__dirname, '../utils/fileStorage.js'))
const {
    createMirrorStorage,
    createS3Storage,
    createOffsiteStorage,
    readConfig
} = require(path.resolve(__dirname, '../utils/fileOffsite.js'))
const {
    getBackupCapacity,
    readMaxBackupBytes,
    readWarnPercent
} = require(path.resolve(__dirname, '../utils/fileCapacity.js'))

async function tempRoot(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'linblog-offsite-'))
    t.after(() => fs.rm(root, { recursive: true, force: true }))
    return root
}

test('mirror storage copies backup to a cross-disk directory and can restore it', async (t) => {
    const root = await tempRoot(t)
    const mirror = createMirrorStorage({ dir: path.join(root, 'mirror') })
    const source = path.join(root, 'source.bin')
    const restored = path.join(root, 'restored.bin')
    const payload = Buffer.from('cross-disk-backup')
    await fs.writeFile(source, payload)

    await mirror.put('source.bin', source)
    assert.equal(await mirror.get('source.bin', restored), true)
    assert.deepEqual(await fs.readFile(restored), payload)
    assert.equal(await mirror.remove('source.bin'), true)
    assert.equal(await mirror.remove('source.bin'), false)
    await assert.rejects(() => mirror.put('../escape.bin', source), /invalid_name/)
})

test('offsite sync pulls a missing local backup back from mirror', async (t) => {
    const root = await tempRoot(t)
    const backupDir = path.join(root, 'backup')
    const mirrorDir = path.join(root, 'mirror')
    const sourceDir = path.join(root, 'source')
    await Promise.all([
        fs.mkdir(backupDir, { recursive: true }),
        fs.mkdir(mirrorDir, { recursive: true }),
        fs.mkdir(sourceDir, { recursive: true })
    ])

    const originalBackupDir = fileStorage.backupDir
    fileStorage.backupDir = backupDir
    t.after(() => { fileStorage.backupDir = originalBackupDir })

    const offsite = createOffsiteStorage({ mirrorDir })
    const source = path.join(sourceDir, 'remote.bin')
    await fs.writeFile(source, 'mirrored')
    await offsite.providers[0].storage.put('remote.bin', source)

    const result = await offsite.restoreToBackup('remote.bin')
    assert.equal(result.restored, true)
    assert.equal(result.source, 'mirror')
    assert.deepEqual(
        await fs.readFile(path.join(backupDir, 'remote.bin')),
        Buffer.from('mirrored')
    )
})

test('s3 client signs PUT/GET/DELETE and uploads object body', async (t) => {
    const root = await tempRoot(t)
    const source = path.join(root, 's3.bin')
    const restored = path.join(root, 's3-restored.bin')
    await fs.writeFile(source, 's3-payload')

    const calls = []
    const originalFetch = global.fetch
    global.fetch = async (url, init) => {
        calls.push({ url: String(url), init })
        if (init.method === 'GET') {
            return new Response(Buffer.from('s3-payload'), { status: 200 })
        }
        return new Response(null, { status: 204 })
    }
    t.after(() => { global.fetch = originalFetch })

    const s3 = createS3Storage({
        endpoint: 'https://s3.example.test',
        bucket: 'linblog',
        region: 'us-east-1',
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET',
        prefix: 'files'
    })

    await s3.put('demo.bin', source)
    await s3.get('demo.bin', restored)
    await s3.remove('demo.bin')

    assert.equal(calls[0].init.method, 'PUT')
    assert.match(
        calls[0].init.headers.Authorization,
        /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/us-east-1\/s3\/aws4_request/
    )
    assert.deepEqual(calls[0].init.body, Buffer.from('s3-payload'))
    assert.match(calls[0].url, /\/linblog\/files\/demo\.bin$/)
    assert.deepEqual(await fs.readFile(restored), Buffer.from('s3-payload'))
    assert.equal(calls[2].init.method, 'DELETE')
})

test('s3 uploads surface non-2xx responses with status and detail', async (t) => {
    const root = await tempRoot(t)
    const source = path.join(root, 'fail.bin')
    await fs.writeFile(source, 'x')

    const originalFetch = global.fetch
    global.fetch = async () => new Response('AccessDenied', { status: 403 })
    t.after(() => { global.fetch = originalFetch })

    const s3 = createS3Storage({
        endpoint: 'https://s3.example.test',
        bucket: 'linblog',
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET'
    })
    await assert.rejects(() => s3.put('fail.bin', source), /S3 PUT 403 AccessDenied/)
})

test('offsite config only enables s3 when all required values exist', () => {
    assert.deepEqual(readConfig({}), { mirrorDir: null, s3: null })

    const config = readConfig({
        LINBLOG_FILE_BACKUP_MIRROR_DIR: 'D:/backup-mirror',
        LINBLOG_S3_ENDPOINT: 'https://s3.example.test',
        LINBLOG_S3_BUCKET: 'linblog',
        LINBLOG_S3_ACCESS_KEY_ID: 'AKID',
        LINBLOG_S3_SECRET_ACCESS_KEY: 'SECRET',
        LINBLOG_S3_PREFIX: '/files/'
    })
    assert.equal(config.mirrorDir, 'D:/backup-mirror')
    assert.equal(config.s3.bucket, 'linblog')
    assert.equal(config.s3.prefix, '/files/')
})

test('capacity status reports warning and critical levels', async (t) => {
    const root = await tempRoot(t)
    const backupDir = path.join(root, 'backup')
    const mirrorDir = path.join(root, 'mirror')
    await Promise.all([
        fs.mkdir(backupDir, { recursive: true }),
        fs.mkdir(mirrorDir, { recursive: true })
    ])
    await fs.writeFile(path.join(backupDir, 'a.bin'), Buffer.alloc(60))
    await fs.writeFile(path.join(mirrorDir, 'b.bin'), Buffer.alloc(50))

    const offsite = createOffsiteStorage({ mirrorDir })
    const warning = await getBackupCapacity({
        storage: { backupDir }, offsite, maxBytes: 200, warnPercent: 50
    })
    assert.equal(warning.usedBytes, 110)
    assert.equal(warning.usedPercent, 55)
    assert.equal(warning.level, 'warning')
    assert.equal(warning.local.files, 1)
    assert.equal(warning.mirror.files, 1)

    const critical = await getBackupCapacity({
        storage: { backupDir }, offsite, maxBytes: 100, warnPercent: 80
    })
    assert.equal(critical.level, 'critical')
})

test('capacity env values fall back on malformed input', () => {
    const oldMax = process.env.LINBLOG_FILE_BACKUP_MAX_BYTES
    const oldWarn = process.env.LINBLOG_FILE_BACKUP_WARN_PERCENT
    try {
        for (const value of ['0', '-1', 'abc', '']) {
            process.env.LINBLOG_FILE_BACKUP_MAX_BYTES = value
            assert.equal(readMaxBackupBytes(), 2 * 1024 * 1024 * 1024)
        }
        process.env.LINBLOG_FILE_BACKUP_WARN_PERCENT = '0'
        assert.equal(readWarnPercent(), 1)
        process.env.LINBLOG_FILE_BACKUP_WARN_PERCENT = '999'
        assert.equal(readWarnPercent(), 100)
        process.env.LINBLOG_FILE_BACKUP_WARN_PERCENT = 'abc'
        assert.equal(readWarnPercent(), 80)
    } finally {
        if (oldMax === undefined) delete process.env.LINBLOG_FILE_BACKUP_MAX_BYTES
        else process.env.LINBLOG_FILE_BACKUP_MAX_BYTES = oldMax
        if (oldWarn === undefined) delete process.env.LINBLOG_FILE_BACKUP_WARN_PERCENT
        else process.env.LINBLOG_FILE_BACKUP_WARN_PERCENT = oldWarn
    }
})
