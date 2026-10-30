const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const zlib = require('node:zlib')
const { Readable } = require('node:stream')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const dbBackup = require(path.resolve(__dirname, '../utils/dbBackup.js'))

async function makeTempDir(prefix) {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

/**
 * 极简 mysql2 连接替身：按 SQL 片段返回预置结果，并记录所有执行过的语句。
 */
function createFakeConnection({ tables = [], references = [], data = {}, ddl = {}, triggers = [], columns = {}, primaryKeys = {}, failOn = null } = {}) {
    const calls = []
    const connection = {
        calls,
        connect(callback) {
            calls.push({ sql: '__connect__' })
            callback(null)
        },
        end(callback) {
            calls.push({ sql: '__end__' })
            if (callback) callback()
        },
        destroy() {
            calls.push({ sql: '__destroy__' })
        },
        query(sql, values, callback) {
            if (typeof values === 'function') {
                callback = values
                values = []
            }
            calls.push({ sql, values })

            if (failOn && failOn(sql, values)) {
                callback(new Error('模拟失败'))
                return
            }

            if (sql === 'SHOW TABLES') {
                callback(null, tables.map((name) => ({ [`Tables_in_${'linlog'}`]: name })))
                return
            }
            if (sql.includes('REFERENCED_TABLE_NAME IS NOT NULL')) {
                callback(null, references)
                return
            }
            if (sql.startsWith('SHOW CREATE TABLE')) {
                const name = sql.match(/`(.+?)`/)?.[1]
                callback(null, [{ 'Create Table': ddl[name] || `CREATE TABLE \`${name}\` (id INT)` }])
                return
            }
            if (sql.includes('information_schema.COLUMNS')) {
                callback(null, (columns[values[0]] || ['id']).map((name) => ({ COLUMN_NAME: name })))
                return
            }
            if (sql.includes('information_schema.STATISTICS')) {
                callback(null, (primaryKeys[values[0]] || ['id']).map((name) => ({ COLUMN_NAME: name })))
                return
            }
            if (sql.startsWith('SELECT `')) {
                const table = sql.match(/FROM `(.+?)`/)?.[1]
                const allRows = data[table] || []
                const limit = values[values.length - 2]
                const offset = values[values.length - 1]
                callback(null, allRows.slice(offset, offset + limit))
                return
            }
            if (sql === 'SHOW TRIGGERS') {
                callback(null, triggers)
                return
            }
            if (sql.startsWith('SHOW CREATE TRIGGER')) {
                const name = sql.match(/`(.+?)`/)?.[1]
                const trigger = triggers.find((t) => t.Trigger === name)
                callback(null, [{ 'SQL Original Statement': trigger?.Statement || '' }])
                return
            }
            callback(null, [])
        },
    }
    return connection
}

async function readAllRecords(filepath) {
    const records = []
    for await (const record of dbBackup.readDumpRecords(filepath)) records.push(record)
    return records
}

test('orderTablesByDependency puts referenced tables first', () => {
    const ordered = dbBackup.orderTablesByDependency(
        ['article', 'users', 'comment', 'subset'],
        [
            { TABLE_NAME: 'article', REFERENCED_TABLE_NAME: 'users' },
            { TABLE_NAME: 'article', REFERENCED_TABLE_NAME: 'subset' },
            { TABLE_NAME: 'comment', REFERENCED_TABLE_NAME: 'article' },
        ]
    )
    const index = (name) => ordered.indexOf(name)
    assert.ok(index('users') < index('article'))
    assert.ok(index('subset') < index('article'))
    assert.ok(index('article') < index('comment'))
})

test('orderTablesByDependency does not loop on cyclic references', () => {
    const ordered = dbBackup.orderTablesByDependency(
        ['a', 'b'],
        [
            { TABLE_NAME: 'a', REFERENCED_TABLE_NAME: 'b' },
            { TABLE_NAME: 'b', REFERENCED_TABLE_NAME: 'a' },
        ]
    )
    assert.deepEqual(ordered.sort(), ['a', 'b'])
})

test('encodeValue/decodeValue round-trips binary data', () => {
    const buffer = Buffer.from('图片二进制内容', 'utf8')
    const encoded = dbBackup.encodeValue(buffer)
    assert.deepEqual(encoded, { $bin: buffer.toString('hex') })
    assert.deepEqual(dbBackup.decodeValue(encoded), buffer)
})

test('encodeValue leaves non-buffer values untouched', () => {
    assert.equal(dbBackup.encodeValue('text'), 'text')
    assert.equal(dbBackup.encodeValue(42), 42)
    assert.equal(dbBackup.encodeValue(null), null)
})

test('splitRowsByBytes splits large batches below the packet limit', () => {
    const bigBinary = Buffer.alloc(400 * 1024, 1)
    const rows = Array.from({ length: 6 }, (_, index) => [
        index,
        dbBackup.encodeValue(bigBinary),
    ])

    const batches = dbBackup.splitRowsByBytes(rows, 1024 * 1024)
    assert.ok(batches.length > 1)
    for (const batch of batches) {
        const bytes = batch.reduce((sum, row) => sum + dbBackup.estimateRowBytes(row), 0)
        // 单行本身就可能超过上限，因此只校验多行批次不超额
        if (batch.length > 1) assert.ok(bytes <= 1024 * 1024)
    }
    assert.equal(batches.reduce((sum, batch) => sum + batch.length, 0), rows.length)
})

test('splitRowsByBytes keeps every row when batching', () => {
    const rows = Array.from({ length: 10 }, (_, index) => [index, `row-${index}`])
    const batches = dbBackup.splitRowsByBytes(rows, 32)
    assert.equal(batches.flat().length, 10)
    assert.ok(batches.every((batch) => batch.length >= 1))
})

test('buildBackupFilename embeds a stable local timestamp', () => {
    const filename = dbBackup.buildBackupFilename(new Date(2026, 9, 30, 3, 15, 9))
    assert.equal(filename, 'linlog-20261030-031509.linbak.gz')
})

test('computeNextRunDelay schedules the next configured hour', () => {
    const before = new Date(2026, 9, 30, 1, 0, 0)
    const delay = dbBackup.computeNextRunDelay(before, 3)
    assert.equal(delay, 2 * 60 * 60 * 1000)

    const after = new Date(2026, 9, 30, 5, 0, 0)
    const nextDelay = dbBackup.computeNextRunDelay(after, 3)
    assert.equal(nextDelay, 22 * 60 * 60 * 1000)
})

test('createDatabaseBackup writes DDL and rows into a gzip dump', async () => {
    const backupDir = await makeTempDir('linblog-backup-')
    const now = new Date(2026, 9, 30, 3, 0, 0)

    const connection = createFakeConnection({
        tables: ['users', 'article'],
        references: [{ TABLE_NAME: 'article', REFERENCED_TABLE_NAME: 'users' }],
        columns: { users: ['id', 'username'], article: ['id', 'title', 'cover'] },
        primaryKeys: { users: ['id'], article: ['id'] },
        data: {
            users: [
                { id: 1, username: '管理员' },
                { id: 2, username: '访客' },
            ],
            article: [
                { id: 10, title: '第一篇文章', cover: Buffer.from([0x01, 0x02, 0xff]) },
            ],
        },
        ddl: {
            users: 'CREATE TABLE `users` (`id` BIGINT PRIMARY KEY, `username` VARCHAR(50))',
            article: 'CREATE TABLE `article` (`id` BIGINT PRIMARY KEY, `title` VARCHAR(150), `cover` BLOB)',
        },
        triggers: [{ Trigger: 'trg_article', Statement: 'CREATE TRIGGER trg_article BEFORE INSERT ON article FOR EACH ROW SET NEW.title = NEW.title' }],
    })

    const result = await dbBackup.createDatabaseBackup({
        backupDir,
        now,
        chunkSize: 1,
        dbConfig: { HOST: 'localhost', PORT: 3306, USER: 'root', PASSWORD: '', DB: 'linlog' },
        createConnection: () => connection,
    })

    assert.equal(result.filename, 'linlog-20261030-030000.linbak.gz')
    assert.equal(result.tables, 2)
    assert.equal(result.rows, 3)
    assert.ok(result.sizeBytes > 0)
    assert.match(result.checksum, /^[0-9a-f]{64}$/)

    const records = await readAllRecords(result.filepath)
    assert.equal(records[0].t, 'meta')
    assert.equal(records[0].database, 'linlog')
    assert.deepEqual(records[0].tables, ['users', 'article'])

    const ddlRecords = records.filter((record) => record.t === 'ddl')
    assert.equal(ddlRecords.length, 2)
    assert.ok(ddlRecords[0].sql.includes('CREATE TABLE `users`'))

    const rowRecords = records.filter((record) => record.t === 'rows')
    // chunkSize=1：2 行用户 + 1 行文章 = 3 个数据块
    assert.equal(rowRecords.length, 3)
    const articleChunk = rowRecords.find((record) => record.table === 'article')
    assert.equal(articleChunk.values[0][2].$bin, '0102ff')

    const triggerRecord = records.find((record) => record.t === 'trigger')
    assert.equal(triggerRecord.name, 'trg_article')

    const endRecord = records.at(-1)
    assert.equal(endRecord.t, 'end')
    assert.equal(endRecord.totalRows, 3)
    assert.equal(endRecord.triggerCount, 1)

    // 必须使用一致性快照，避免备份期间写入造成数据撕裂
    assert.ok(connection.calls.some((call) => call.sql === 'START TRANSACTION WITH CONSISTENT SNAPSHOT'))
    assert.ok(connection.calls.some((call) => call.sql === 'COMMIT'))
    assert.ok(connection.calls.some((call) => call.sql === '__end__'))

    await fs.rm(backupDir, { recursive: true, force: true })
})

test('createDatabaseBackup removes the partial file when the dump fails', async () => {
    const backupDir = await makeTempDir('linblog-backup-fail-')
    const connection = createFakeConnection({
        tables: ['users'],
        columns: { users: ['id'] },
        failOn: (sql) => sql.startsWith('SELECT `'),
    })

    await assert.rejects(
        dbBackup.createDatabaseBackup({
            backupDir,
            now: new Date(2026, 9, 30, 3, 0, 0),
            dbConfig: { HOST: 'localhost', PORT: 3306, USER: 'root', PASSWORD: '', DB: 'linlog' },
            createConnection: () => connection,
        }),
        /模拟失败/
    )

    const files = await fs.readdir(backupDir)
    assert.deepEqual(files, [])
    await fs.rm(backupDir, { recursive: true, force: true })
})

test('listDatabaseBackups returns newest first and ignores other files', async () => {
    const backupDir = await makeTempDir('linblog-list-')
    await fs.writeFile(path.join(backupDir, 'older.linbak.gz'), 'old')
    await fs.writeFile(path.join(backupDir, 'newer.linbak.gz'), 'new')
    await fs.writeFile(path.join(backupDir, 'notes.txt'), 'ignored')
    await fs.writeFile(path.join(backupDir, '.gitkeep'), '')

    const older = new Date(Date.now() - 60_000)
    const newer = new Date()
    await fs.utimes(path.join(backupDir, 'older.linbak.gz'), older, older)
    await fs.utimes(path.join(backupDir, 'newer.linbak.gz'), newer, newer)

    const list = await dbBackup.listDatabaseBackups({ backupDir })
    assert.deepEqual(list.map((item) => item.filename), ['newer.linbak.gz', 'older.linbak.gz'])
    assert.ok(list[0].sizeBytes > 0)

    await fs.rm(backupDir, { recursive: true, force: true })
})

test('listDatabaseBackups returns an empty list when the directory is missing', async () => {
    const list = await dbBackup.listDatabaseBackups({
        backupDir: path.join(os.tmpdir(), 'linblog-does-not-exist-xyz'),
    })
    assert.deepEqual(list, [])
})

test('pruneOldBackups keeps only the newest N backups', async () => {
    const backupDir = await makeTempDir('linblog-prune-')
    for (let i = 0; i < 5; i++) {
        const name = `backup-${i}.linbak.gz`
        await fs.writeFile(path.join(backupDir, name), 'x')
        const time = new Date(Date.now() - (5 - i) * 60_000)
        await fs.utimes(path.join(backupDir, name), time, time)
    }

    const result = await dbBackup.pruneOldBackups({ backupDir, retentionCount: 2 })
    assert.equal(result.retentionCount, 2)
    assert.deepEqual(result.kept, ['backup-4.linbak.gz', 'backup-3.linbak.gz'])
    assert.deepEqual(result.removed.sort(), [
        'backup-0.linbak.gz',
        'backup-1.linbak.gz',
        'backup-2.linbak.gz',
    ])

    const remaining = (await fs.readdir(backupDir)).sort()
    assert.deepEqual(remaining, ['backup-3.linbak.gz', 'backup-4.linbak.gz'])
    await fs.rm(backupDir, { recursive: true, force: true })
})

test('pruneOldBackups never deletes when count is within retention', async () => {
    const backupDir = await makeTempDir('linblog-prune-keep-')
    await fs.writeFile(path.join(backupDir, 'only.linbak.gz'), 'x')
    const result = await dbBackup.pruneOldBackups({ backupDir, retentionCount: 5 })
    assert.deepEqual(result.removed, [])
    assert.deepEqual(result.kept, ['only.linbak.gz'])
    await fs.rm(backupDir, { recursive: true, force: true })
})

test('deleteDatabaseBackup rejects path traversal', async () => {
    const backupDir = await makeTempDir('linblog-delete-')
    await assert.rejects(
        dbBackup.deleteDatabaseBackup('../escape.linbak.gz', { backupDir }),
        /无效的备份文件名/
    )
    await assert.rejects(
        dbBackup.deleteDatabaseBackup('anything.sql', { backupDir }),
        /linbak\.gz/
    )
    await fs.rm(backupDir, { recursive: true, force: true })
})

test('deleteDatabaseBackup reports missing files without throwing', async () => {
    const backupDir = await makeTempDir('linblog-delete-missing-')
    const result = await dbBackup.deleteDatabaseBackup('missing.linbak.gz', { backupDir })
    assert.deepEqual(result, {
        deleted: false,
        reason: 'not_found',
        filename: 'missing.linbak.gz',
    })
    await fs.rm(backupDir, { recursive: true, force: true })
})

test('getBackupDirectoryUsage sums backup file sizes only', async () => {
    const backupDir = await makeTempDir('linblog-usage-')
    await fs.writeFile(path.join(backupDir, 'a.linbak.gz'), Buffer.alloc(10))
    await fs.writeFile(path.join(backupDir, 'b.linbak.gz'), Buffer.alloc(20))
    await fs.writeFile(path.join(backupDir, '.gitkeep'), '')

    const usage = await dbBackup.getBackupDirectoryUsage({ backupDir })
    assert.equal(usage.bytes, 30)
    assert.equal(usage.files, 2)
    await fs.rm(backupDir, { recursive: true, force: true })
})

test('restoreDatabaseBackup recreates schema, rows and triggers', async () => {
    const backupDir = await makeTempDir('linblog-restore-')
    const now = new Date(2026, 9, 30, 3, 0, 0)

    const dumpConnection = createFakeConnection({
        tables: ['users', 'article'],
        references: [{ TABLE_NAME: 'article', REFERENCED_TABLE_NAME: 'users' }],
        columns: { users: ['id', 'username'], article: ['id', 'title', 'cover'] },
        primaryKeys: { users: ['id'], article: ['id'] },
        data: {
            users: [{ id: 1, username: '管理员' }],
            article: [{ id: 10, title: '文章', cover: Buffer.from([0xca, 0xfe]) }],
        },
        ddl: {
            users: 'CREATE TABLE `users` (`id` BIGINT PRIMARY KEY, `username` VARCHAR(50))',
            article: 'CREATE TABLE `article` (`id` BIGINT PRIMARY KEY, `title` VARCHAR(150), `cover` BLOB)',
        },
        triggers: [{ Trigger: 'trg_article', Statement: 'CREATE TRIGGER trg_article BEFORE INSERT ON article FOR EACH ROW SET NEW.title = NEW.title' }],
    })

    const backup = await dbBackup.createDatabaseBackup({
        backupDir,
        now,
        chunkSize: 10,
        dbConfig: { HOST: 'localhost', PORT: 3306, USER: 'root', PASSWORD: '', DB: 'linlog' },
        createConnection: () => dumpConnection,
    })

    const restoreCalls = []
    const restoreConnection = {
        connect(callback) { restoreCalls.push('connect'); callback(null) },
        end(callback) { restoreCalls.push('end'); if (callback) callback() },
        destroy() { restoreCalls.push('destroy') },
        query(sql, values, callback) {
            if (typeof values === 'function') {
                callback = values
                values = []
            }
            restoreCalls.push({ sql, values })
            if (sql === 'SHOW TABLES') return callback(null, [])
            callback(null, [])
        },
    }

    const result = await dbBackup.restoreDatabaseBackup({
        filename: backup.filename,
        backupDir,
        targetDatabase: 'linlog_drill',
        dbConfig: { HOST: 'localhost', PORT: 3306, USER: 'root', PASSWORD: '', DB: 'linlog' },
        createConnection: () => restoreConnection,
    })

    assert.equal(result.database, 'linlog_drill')
    assert.equal(result.tables, 2)
    assert.equal(result.rows, 2)
    assert.equal(result.triggers, 1)

    const insertCalls = restoreCalls.filter((call) => typeof call === 'object' && call.sql.includes('INSERT INTO'))
    assert.equal(insertCalls.length, 2)
    const articleInsert = insertCalls.find((call) => call.sql.includes('`article`'))
    assert.ok(Buffer.isBuffer(articleInsert.values[0][0][2]))
    assert.deepEqual(articleInsert.values[0][0][2], Buffer.from([0xca, 0xfe]))

    assert.ok(restoreCalls.some((call) => typeof call === 'object' && call.sql.includes('SET FOREIGN_KEY_CHECKS = 0')))
    assert.ok(restoreCalls.some((call) => typeof call === 'object' && call.sql.includes('SET FOREIGN_KEY_CHECKS = 1')))

    await fs.rm(backupDir, { recursive: true, force: true })
})

test('restoreDatabaseBackup rejects unsafe filenames', async () => {
    const backupDir = await makeTempDir('linblog-restore-unsafe-')
    await assert.rejects(
        dbBackup.restoreDatabaseBackup({ filename: '../evil.linbak.gz', backupDir }),
        /无效的备份文件名/
    )
    await fs.rm(backupDir, { recursive: true, force: true })
})

test('restoreDatabaseBackup rejects an unknown target database name', async () => {
    const backupDir = await makeTempDir('linblog-restore-dbname-')
    const filepath = path.join(backupDir, 'sample.linbak.gz')
    const body = `${JSON.stringify({ t: 'meta', version: 1, database: 'linlog', tables: [] })}\n`
    await fs.writeFile(filepath, zlib.gzipSync(body))

    await assert.rejects(
        dbBackup.restoreDatabaseBackup({
            filename: 'sample.linbak.gz',
            backupDir,
            targetDatabase: 'bad;name',
        }),
        /目标数据库名/
    )
    await fs.rm(backupDir, { recursive: true, force: true })
})

test('restoreDatabaseBackup rejects corrupt archives', async () => {
    const backupDir = await makeTempDir('linblog-restore-corrupt-')
    await fs.writeFile(path.join(backupDir, 'broken.linbak.gz'), 'not gzip')

    await assert.rejects(
        dbBackup.restoreDatabaseBackup({
            filename: 'broken.linbak.gz',
            backupDir,
            createConnection: () => ({
                connect(callback) { callback(null) },
                end(callback) { if (callback) callback() },
                destroy() {},
                query(_sql, _values, callback) { callback(null, []) },
            }),
        })
    )
    await fs.rm(backupDir, { recursive: true, force: true })
})
