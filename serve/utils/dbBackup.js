const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const readline = require('node:readline')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const mysql = require('mysql2')
const config = require('../config/default')

const DEFAULT_BACKUP_DIR = path.resolve(
    process.env.LINBLOG_DB_BACKUP_DIR || path.join(__dirname, '..', 'storage', 'db-backups')
)

const DEFAULT_RETENTION_COUNT = 7
// 单表一次读取的行数：图片以 MEDIUMBLOB 存在库里，分块避免一次性占用过多内存
const DEFAULT_CHUNK_SIZE = 200
// 单块序列化后的字节上限：必须明显小于服务端 max_allowed_packet，
// 否则一条批量 INSERT 会被 MySQL 直接拒绝（图片 BLOB 单行就可能很大）。
const DEFAULT_MAX_CHUNK_BYTES = 2 * 1024 * 1024
// 单次备份/恢复最长等待 10 分钟，超大库可通过环境变量调大
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_BACKUP_HOUR = 3
const FIRST_RUN_DELAY_MS = 3 * 60 * 1000

const BACKUP_EXTENSION = '.linbak.gz'
const FORMAT_VERSION = 1

function readPositiveInteger(name, fallback, min = 1) {
    const parsed = Number.parseInt(process.env[name] ?? '', 10)
    return Number.isFinite(parsed) && parsed >= min ? parsed : fallback
}

function readRetentionCount() {
    return readPositiveInteger('LINBLOG_DB_BACKUP_RETENTION', DEFAULT_RETENTION_COUNT)
}

function readChunkSize() {
    return Math.min(
        readPositiveInteger('LINBLOG_DB_BACKUP_CHUNK_SIZE', DEFAULT_CHUNK_SIZE),
        5000
    )
}

function readTimeoutMs() {
    return readPositiveInteger('LINBLOG_DB_DUMP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 10_000)
}

function readMaxChunkBytes() {
    return readPositiveInteger(
        'LINBLOG_DB_BACKUP_MAX_CHUNK_BYTES',
        DEFAULT_MAX_CHUNK_BYTES,
        64 * 1024
    )
}

function readBackupHour() {
    const parsed = Number.parseInt(process.env.LINBLOG_DB_BACKUP_HOUR ?? '', 10)
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23
        ? parsed
        : DEFAULT_BACKUP_HOUR
}

function readBackupDir() {
    return path.resolve(process.env.LINBLOG_DB_BACKUP_DIR || DEFAULT_BACKUP_DIR)
}

function timestampLabel(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0')
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
        + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    )
}

function buildBackupFilename(date = new Date()) {
    return `linlog-${timestampLabel(date)}${BACKUP_EXTENSION}`
}

/**
 * 下一次备份延迟：按 LINBLOG_DB_BACKUP_HOUR 指定的整点，默认每天 03:00。
 * 当天时间点已过则顺延到明天。
 */
function computeNextRunDelay(now = new Date(), hour = readBackupHour()) {
    const next = new Date(now)
    next.setHours(hour, 0, 0, 0)
    if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1)
    }
    return next.getTime() - now.getTime()
}

async function pathExists(filePath) {
    try {
        await fsp.access(filePath)
        return true
    } catch {
        return false
    }
}

async function sha256File(filePath) {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('end', resolve)
        stream.on('error', reject)
    })
    return hash.digest('hex')
}

function createConnection(dbConfig) {
    return mysql.createConnection({
        host: dbConfig.HOST,
        port: dbConfig.PORT,
        user: dbConfig.USER,
        password: dbConfig.PASSWORD,
        database: dbConfig.DB,
        charset: 'utf8mb4',
        // 日期按字符串返回，避免序列化时被转成 UTC 造成时区漂移
        dateStrings: true,
        supportBigNumbers: true,
        bigNumberStrings: true,
        multipleStatements: false,
    })
}

function queryAsync(connection, sql, values = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (err, rows) => {
            if (err) reject(err)
            else resolve(rows)
        })
    })
}

/**
 * 关闭连接：超时路径下连接可能已被 destroy，end 会报错，这里统一吞掉。
 */
function closeConnection(connection) {
    return new Promise((resolve) => {
        try {
            connection.end(() => resolve())
        } catch {
            resolve()
        }
    })
}

/**
 * 表按外键依赖排序：被引用的表必须先建。
 * 自引用与外键环通过「访问中跳过」兜底，避免死循环。
 */
function orderTablesByDependency(tables, references) {
    const deps = new Map(tables.map((name) => [name, new Set()]))
    for (const row of references) {
        const child = row.TABLE_NAME
        const parent = row.REFERENCED_TABLE_NAME
        if (!deps.has(child) || !deps.has(parent) || child === parent) continue
        deps.get(child).add(parent)
    }

    const ordered = []
    const visited = new Set()
    const visiting = new Set()

    function visit(name) {
        if (visited.has(name) || visiting.has(name)) return
        visiting.add(name)
        for (const dep of deps.get(name) || []) visit(dep)
        visiting.delete(name)
        visited.add(name)
        ordered.push(name)
    }

    for (const name of tables) visit(name)
    return ordered
}

function encodeValue(value) {
    // Buffer 直接 JSON 序列化会变成 {type:'Buffer',data:[...]}，体积大且易损坏，改存十六进制
    return Buffer.isBuffer(value) ? { $bin: value.toString('hex') } : value
}

function decodeValue(value) {
    if (
        value
        && typeof value === 'object'
        && !Array.isArray(value)
        && typeof value.$bin === 'string'
    ) {
        return Buffer.from(value.$bin, 'hex')
    }
    return value
}

/**
 * 把一批行按估算字节数再切成多个小批。
 * 单行超限时仍单独成批，由数据库给出明确报错，避免静默截断。
 */
function splitRowsByBytes(rows, maxChunkBytes) {
    const batches = []
    let batch = []
    let bytes = 0

    for (const row of rows) {
        const rowBytes = estimateRowBytes(row)
        if (batch.length > 0 && bytes + rowBytes > maxChunkBytes) {
            batches.push(batch)
            batch = []
            bytes = 0
        }
        batch.push(row)
        bytes += rowBytes
    }
    if (batch.length > 0) batches.push(batch)
    return batches
}

function quoteIdentifier(name) {
    return `\`${String(name).replace(/`/g, '``')}\``
}

async function readTableColumns(connection, tableName) {
    const rows = await queryAsync(
        connection,
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND EXTRA NOT LIKE '%GENERATED%'
         ORDER BY ORDINAL_POSITION`,
        [tableName]
    )
    return rows.map((row) => row.COLUMN_NAME)
}

async function readPrimaryKeyColumns(connection, tableName) {
    const rows = await queryAsync(
        connection,
        `SELECT COLUMN_NAME
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND INDEX_NAME = 'PRIMARY'
         ORDER BY SEQ_IN_INDEX`,
        [tableName]
    )
    return rows.map((row) => row.COLUMN_NAME)
}

/**
 * 逐块读取一张表，产出行记录。
 * 有主键时按主键排序分页，保证同一快照内读取顺序稳定。
 */
/**
 * 估算一行序列化后的字节数，用于切分批次。
 * 十六进制 BLOB 的体积是原始字节的 2 倍，这里按 2.2 倍保守估计。
 */
function estimateRowBytes(values) {
    let bytes = 2
    for (const value of values) {
        if (value === null || value === undefined) {
            bytes += 5
        } else if (typeof value === 'object' && typeof value.$bin === 'string') {
            bytes += value.$bin.length + 8
        } else if (typeof value === 'number') {
            bytes += 24
        } else if (typeof value === 'boolean') {
            bytes += 6
        } else {
            bytes += Buffer.byteLength(String(value), 'utf8') + 6
        }
    }
    return bytes
}

async function* iterateTableRows(connection, table, chunkSize, maxChunkBytes = DEFAULT_MAX_CHUNK_BYTES) {
    const columns = await readTableColumns(connection, table)
    if (columns.length === 0) return

    const primaryKey = await readPrimaryKeyColumns(connection, table)
    const columnList = columns.map(quoteIdentifier).join(', ')
    const orderBy = primaryKey.length > 0
        ? ` ORDER BY ${primaryKey.map(quoteIdentifier).join(', ')}`
        : ''

    let offset = 0
    while (true) {
        const rows = await queryAsync(
            connection,
            `SELECT ${columnList} FROM ${quoteIdentifier(table)}${orderBy} LIMIT ? OFFSET ?`,
            [chunkSize, offset]
        )
        if (rows.length === 0) return

        // 逐行累积，超限就切成新的块：单行超过上限时仍然单独成块，
        // 让恢复端给出明确报错，而不是静默丢数据。
        let batch = []
        let batchBytes = 0
        for (const row of rows) {
            const values = columns.map((column) => encodeValue(row[column]))
            const rowBytes = estimateRowBytes(values)
            if (batch.length > 0 && batchBytes + rowBytes > maxChunkBytes) {
                yield { t: 'rows', table, columns, values: batch }
                batch = []
                batchBytes = 0
            }
            batch.push(values)
            batchBytes += rowBytes
        }
        if (batch.length > 0) {
            yield { t: 'rows', table, columns, values: batch }
        }

        offset += rows.length
        if (rows.length < chunkSize) return
    }
}

/**
 * 生成一次完整逻辑备份。
 *
 * 文件为 gzip 压缩的 JSON Lines，每行一条记录：
 *   meta    版本、库名、时间、表顺序
 *   ddl     SHOW CREATE TABLE 原样结构
 *   rows    列名与数据块（BLOB 以十六进制编码）
 *   trigger 触发器定义
 *   end     行数汇总
 *
 * 不依赖 mysqldump/mysql 客户端，容器与本地都能直接执行。
 *
 * @param {object} [options]
 * @param {object} [options.dbConfig]
 * @param {string} [options.backupDir]
 * @param {number} [options.chunkSize]
 * @param {number} [options.timeoutMs]
 * @param {Date}   [options.now]
 * @param {Function} [options.createConnection]
 * @returns {Promise<{ filename, filepath, sizeBytes, databaseName, createdAt, checksum, tables, rows, durationMs }>}
 */
async function createDatabaseBackup(options = {}) {
    const dbConfig = options.dbConfig || config.database
    const backupDir = path.resolve(options.backupDir || readBackupDir())
    const chunkSize = options.chunkSize || readChunkSize()
    const timeoutMs = options.timeoutMs ?? readTimeoutMs()
    const now = options.now || new Date()
    const createdAt = now.toISOString()
    const startedAt = Date.now()
    const connect = options.createConnection || createConnection
    // 单块数据不能超过服务端 max_allowed_packet，否则恢复时 INSERT 会被拒绝。
    // 图片是 BLOB，单行就可能很大，所以这里按字节估算并主动收窄块大小。
    const maxChunkBytes = options.maxChunkBytes || readMaxChunkBytes()

    await fsp.mkdir(backupDir, { recursive: true })

    const baseName = buildBackupFilename(now)
    let filename = baseName
    if (await pathExists(path.join(backupDir, filename))) {
        filename = baseName.replace(
            new RegExp(`${BACKUP_EXTENSION.replace('.', '\\.')}$`),
            `-${crypto.randomBytes(3).toString('hex')}${BACKUP_EXTENSION}`
        )
    }
    const filepath = path.join(backupDir, filename)

    const connection = connect(dbConfig)
    let timer = null
    let timedOut = false

    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            timedOut = true
            // 主动断开连接，让正在进行的读取/写入尽快以错误结束，避免遗留半成品
            try { connection.destroy() } catch {}
            reject(new Error(`数据库备份超时（${timeoutMs}ms）`))
        }, timeoutMs)
        if (timer.unref) timer.unref()
    })

    const summary = { tables: 0, rows: 0 }

    async function* buildRecords() {
        // 一致性快照：InnoDB 下不阻塞写入，读取的是同一时点的数据
        await queryAsync(connection, 'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        await queryAsync(connection, 'START TRANSACTION WITH CONSISTENT SNAPSHOT')

        const tables = (await queryAsync(connection, 'SHOW TABLES'))
            .map((row) => Object.values(row)[0])
        const references = await queryAsync(
            connection,
            `SELECT TABLE_NAME, REFERENCED_TABLE_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND REFERENCED_TABLE_NAME IS NOT NULL`
        )
        const orderedTables = orderTablesByDependency(tables, references)
        summary.tables = orderedTables.length

        yield {
            t: 'meta',
            version: FORMAT_VERSION,
            database: dbConfig.DB,
            createdAt,
            tables: orderedTables,
        }

        for (const table of orderedTables) {
            const result = await queryAsync(
                connection,
                `SHOW CREATE TABLE ${quoteIdentifier(table)}`
            )
            const row = result[0] || {}
            const sql = row['Create Table'] || row['Create View']
            if (!sql) throw new Error(`无法读取表结构：${table}`)
            yield { t: 'ddl', table, sql }
        }

        const counts = {}
        let totalRows = 0
        for (const table of orderedTables) {
            counts[table] = 0
            for await (const chunk of iterateTableRows(connection, table, chunkSize, maxChunkBytes)) {
                counts[table] += chunk.values.length
                totalRows += chunk.values.length
                yield chunk
            }
        }

        let triggerCount = 0
        try {
            const triggers = await queryAsync(connection, 'SHOW TRIGGERS')
            for (const trigger of triggers) {
                const created = await queryAsync(
                    connection,
                    `SHOW CREATE TRIGGER ${quoteIdentifier(trigger.Trigger)}`
                )
                const statement = created[0]?.['SQL Original Statement']
                if (!statement) continue
                yield { t: 'trigger', name: trigger.Trigger, sql: statement }
                triggerCount += 1
            }
        } catch (err) {
            // 读取触发器需要额外权限；没有权限时记录告警，不影响表数据备份
            yield { t: 'warning', scope: 'trigger', message: err.message }
        }

        await queryAsync(connection, 'COMMIT')
        summary.rows = totalRows
        yield { t: 'end', counts, totalRows, triggerCount }
    }

    const work = (async () => {
        await new Promise((resolve, reject) => {
            connection.connect((err) => err ? reject(err) : resolve())
        })

        async function* lines() {
            for await (const record of buildRecords()) {
                yield `${JSON.stringify(record)}\n`
            }
        }

        await pipeline(
            Readable.from(lines()),
            zlib.createGzip({ level: 9 }),
            fs.createWriteStream(filepath)
        )

        return summary
    })()

    try {
        const { tables, rows } = await Promise.race([work, timeoutPromise])
        if (timedOut) throw new Error(`数据库备份超时（${timeoutMs}ms）`)

        const stat = await fsp.stat(filepath)
        const checksum = await sha256File(filepath)

        return {
            filename,
            filepath,
            sizeBytes: stat.size,
            databaseName: dbConfig.DB,
            createdAt,
            checksum,
            tables,
            rows,
            durationMs: Date.now() - startedAt,
        }
    } catch (err) {
        // 超时后 pipeline 可能仍在写文件，先等它因连接关闭而失败，再清理半成品
        await work.catch(() => {})
        // 失败时清理半成品，避免留下无法恢复的残文件
        await fsp.rm(filepath, { force: true }).catch(() => {})
        throw err
    } finally {
        clearTimeout(timer)
        await closeConnection(connection)
    }
}

async function* readDumpRecords(filepath) {
    const gunzip = zlib.createGunzip()
    const source = fs.createReadStream(filepath)
    source.pipe(gunzip)
    const reader = readline.createInterface({ input: gunzip, crlfDelay: Infinity })

    try {
        for await (const line of reader) {
            const trimmed = line.trim()
            if (!trimmed) continue
            yield JSON.parse(trimmed)
        }
    } finally {
        reader.close()
        source.destroy()
    }
}

/**
 * 列出备份目录下的备份文件（最新在前）。
 */
async function listDatabaseBackups(options = {}) {
    const backupDir = path.resolve(options.backupDir || readBackupDir())
    const readdir = options.readdir || fsp.readdir
    const statFn = options.stat || fsp.stat

    let entries
    try {
        entries = await readdir(backupDir, { withFileTypes: true })
    } catch (err) {
        if (err.code === 'ENOENT') return []
        throw err
    }

    const backups = []
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(BACKUP_EXTENSION)) continue

        const filePath = path.join(backupDir, entry.name)
        const stat = await statFn(filePath)
        backups.push({
            filename: entry.name,
            sizeBytes: stat.size,
            createdAt: stat.mtime.toISOString(),
            mtimeMs: stat.mtimeMs,
        })
    }

    backups.sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (const backup of backups) delete backup.mtimeMs
    return backups
}

/**
 * 按保留策略清理过期备份，只保留最近 N 份。
 */
async function pruneOldBackups(options = {}) {
    const retentionCount = options.retentionCount ?? readRetentionCount()
    const backupDir = path.resolve(options.backupDir || readBackupDir())
    const unlink = options.unlink || fsp.unlink

    const backups = await listDatabaseBackups({ backupDir })
    const toRemove = backups.slice(retentionCount)
    const removed = []

    for (const backup of toRemove) {
        try {
            await unlink(path.join(backupDir, backup.filename))
            removed.push(backup.filename)
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.warn(`[DBBackup] 删除过期备份 ${backup.filename} 失败：`, err.message)
            }
        }
    }

    return {
        removed,
        kept: backups.slice(0, retentionCount).map((backup) => backup.filename),
        retentionCount,
    }
}

function assertSafeBackupName(filename) {
    const raw = String(filename || '')
    if (!raw || raw.includes('/') || raw.includes('\\') || raw.includes('..')) {
        throw new Error('无效的备份文件名')
    }
    if (path.basename(raw) !== raw || !raw.endsWith(BACKUP_EXTENSION)) {
        throw new Error(`只支持 ${BACKUP_EXTENSION} 格式的备份文件`)
    }
    return raw
}

/**
 * 从备份文件恢复数据库。
 *
 * @param {object} options
 * @param {string} options.filename
 * @param {string} [options.targetDatabase] - 恢复到另一个库（隔离演练），默认原库
 * @param {object} [options.dbConfig]
 * @param {string} [options.backupDir]
 * @param {boolean} [options.dropExistingTables] - 默认 true
 * @param {number} [options.timeoutMs]
 * @param {Function} [options.createConnection]
 */
async function restoreDatabaseBackup(options = {}) {
    const filename = assertSafeBackupName(options.filename)
    const backupDir = path.resolve(options.backupDir || readBackupDir())
    const filepath = path.join(backupDir, filename)
    const dbConfig = options.dbConfig || config.database
    const targetDatabase = options.targetDatabase || dbConfig.DB
    const dropExistingTables = options.dropExistingTables !== false
    const timeoutMs = options.timeoutMs ?? readTimeoutMs()
    const maxChunkBytes = options.maxChunkBytes || readMaxChunkBytes()
    const connect = options.createConnection || createConnection
    const startedAt = Date.now()

    if (!await pathExists(filepath)) {
        throw new Error(`备份文件不存在：${filename}`)
    }
    if (!/^[A-Za-z0-9_$-]{1,64}$/.test(targetDatabase)) {
        throw new Error('目标数据库名只允许字母、数字、下划线、$ 和 -')
    }

    // 目标库可能还不存在（演练库），连接时不能指定 database，
    // 否则握手阶段会直接报 ER_BAD_DB_ERROR。
    const connection = connect({ ...dbConfig, DB: undefined })
    let timer = null

    const runRestore = async () => {
        await new Promise((resolve, reject) => {
            connection.connect((err) => err ? reject(err) : resolve())
        })

        // 演练库可能还不存在：先建库再切换
        await queryAsync(connection, 'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4', [
            targetDatabase,
        ])
        await queryAsync(connection, 'USE ??', [targetDatabase])
        await queryAsync(connection, 'SET FOREIGN_KEY_CHECKS = 0')

        const ddl = []
        const rowChunks = []
        const triggers = []
        let meta = null
        let totalRows = 0

        for await (const record of readDumpRecords(filepath)) {
            if (record.t === 'meta') {
                if (record.version !== FORMAT_VERSION) {
                    throw new Error(`不支持的备份版本：${record.version}`)
                }
                meta = record
            } else if (record.t === 'ddl') {
                ddl.push(record)
            } else if (record.t === 'rows') {
                rowChunks.push(record)
                totalRows += record.values.length
            } else if (record.t === 'trigger') {
                triggers.push(record)
            }
        }

        if (!meta) throw new Error('备份文件缺少元信息，可能不是有效的备份')

        if (dropExistingTables) {
            const existing = (await queryAsync(connection, 'SHOW TABLES'))
                .map((row) => Object.values(row)[0])
            for (const table of existing.reverse()) {
                await queryAsync(connection, `DROP TABLE IF EXISTS ${quoteIdentifier(table)}`)
            }
        }

        for (const table of ddl) {
            await queryAsync(connection, table.sql)
        }

        for (const chunk of rowChunks) {
            if (chunk.values.length === 0) continue
            const columns = chunk.columns.map(quoteIdentifier).join(', ')
            // 旧备份的块可能超过当前 max_allowed_packet，恢复时再按字节拆一次
            for (const batch of splitRowsByBytes(chunk.values, maxChunkBytes)) {
                const values = batch.map((row) => row.map(decodeValue))
                await queryAsync(
                    connection,
                    `INSERT INTO ${quoteIdentifier(chunk.table)} (${columns}) VALUES ?`,
                    [values]
                )
            }
        }

        for (const trigger of triggers) {
            await queryAsync(connection, trigger.sql)
        }

        await queryAsync(connection, 'SET FOREIGN_KEY_CHECKS = 1')

        return {
            filename,
            database: targetDatabase,
            tables: ddl.length,
            rows: totalRows,
            triggers: triggers.length,
            durationMs: Date.now() - startedAt,
        }
    }

    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            try { connection.destroy() } catch {}
            reject(new Error(`数据库恢复超时（${timeoutMs}ms）`))
        }, timeoutMs)
        if (timer.unref) timer.unref()
    })

    try {
        return await Promise.race([runRestore(), timeoutPromise])
    } finally {
        clearTimeout(timer)
        await closeConnection(connection)
    }
}

/**
 * 删除指定备份文件。
 */
async function deleteDatabaseBackup(filename, options = {}) {
    const safeName = assertSafeBackupName(filename)
    const backupDir = path.resolve(options.backupDir || readBackupDir())
    const filepath = path.join(backupDir, safeName)
    const unlink = options.unlink || fsp.unlink

    if (!await pathExists(filepath)) {
        return { deleted: false, reason: 'not_found', filename: safeName }
    }

    await unlink(filepath)
    return { deleted: true, filename: safeName }
}

/**
 * 备份目录占用统计，供容量告警使用。
 */
async function getBackupDirectoryUsage(options = {}) {
    const backupDir = path.resolve(options.backupDir || readBackupDir())
    let bytes = 0
    let files = 0

    try {
        const entries = await fsp.readdir(backupDir, { withFileTypes: true })
        for (const entry of entries) {
            if (!entry.isFile() || entry.name === '.gitkeep') continue
            const stat = await fsp.stat(path.join(backupDir, entry.name))
            bytes += stat.size
            files += 1
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err
    }

    return { bytes, files, backupDir }
}

/**
 * 定时备份：每天在 LINBLOG_DB_BACKUP_HOUR 指定的整点执行，
 * 成功后按保留策略清理旧文件。失败只记日志，不阻断服务。
 */
function startScheduledBackup(options = {}) {
    const logger = options.logger || console
    let timer = null
    let stopped = false

    const runOnce = async () => {
        const result = await createDatabaseBackup(options.backupOptions)
        logger.info(
            `[DBBackup] 数据库备份完成：${result.filename}`
            + `（${result.tables} 表 / ${result.rows ?? '?'} 行 / ${result.sizeBytes} bytes）`
        )
        const pruned = await pruneOldBackups()
        if (pruned.removed.length > 0) {
            logger.info(`[DBBackup] 已清理 ${pruned.removed.length} 个过期备份`)
        }
        return result
    }

    const scheduleNext = () => {
        if (stopped) return
        timer = setTimeout(async () => {
            try {
                await runOnce()
            } catch (err) {
                logger.error('[DBBackup] 定时备份失败：', err.message)
            } finally {
                scheduleNext()
            }
        }, computeNextRunDelay())
        if (timer.unref) timer.unref()
    }

    // 启动后延迟一轮再首次执行，避开启动高峰
    timer = setTimeout(async () => {
        try {
            await runOnce()
        } catch (err) {
            logger.error('[DBBackup] 首次备份失败：', err.message)
        } finally {
            scheduleNext()
        }
    }, FIRST_RUN_DELAY_MS)
    if (timer.unref) timer.unref()

    return {
        stop() {
            stopped = true
            clearTimeout(timer)
            timer = null
        },
        runOnce,
    }
}

module.exports = {
    BACKUP_EXTENSION,
    FORMAT_VERSION,
    createDatabaseBackup,
    listDatabaseBackups,
    pruneOldBackups,
    restoreDatabaseBackup,
    deleteDatabaseBackup,
    getBackupDirectoryUsage,
    startScheduledBackup,
    computeNextRunDelay,
    orderTablesByDependency,
    encodeValue,
    decodeValue,
    readDumpRecords,
    assertSafeBackupName,
    estimateRowBytes,
    splitRowsByBytes,
    readRetentionCount,
    readChunkSize,
    readMaxChunkBytes,
    readTimeoutMs,
    readBackupHour,
    readBackupDir,
    buildBackupFilename,
}
