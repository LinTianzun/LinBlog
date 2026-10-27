const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const db = require(path.resolve(__dirname, '../model/db/dbnew.js'))

test('applied migrations are not executed twice', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return [
                { version: '20261023_article_owner' },
                { version: '20261024_image_storage' },
                { version: '20261024_subset_soft_delete' },
                { version: '20261025_system_log' },
                { version: '20261026_view_stats' },
                { version: '20261027_file_lifecycle' },
                { version: '20261027_diary_interaction' },
                { version: '20261027_comment_interaction' },
                { version: '20261027_comment_reply_target' }
            ]
        }

        return []
    }

    const result = await db.runMigrations(exec)

    assert.deepEqual(result, { appliedCount: 0 })
    assert.equal(calls.length, 2)
    assert.match(calls[0].sql, /CREATE TABLE IF NOT EXISTS schema_migrations/)
    assert.equal(
        calls.some((call) => call.sql.includes('information_schema.COLUMNS')),
        false
    )
})

test('diary interaction migration creates praise/comment tables and counters', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return [
                { version: '20261023_article_owner' },
                { version: '20261024_image_storage' },
                { version: '20261024_subset_soft_delete' },
                { version: '20261025_system_log' },
                { version: '20261026_view_stats' },
                { version: '20261027_file_lifecycle' },
                { version: '20261027_comment_interaction' },
                { version: '20261027_comment_reply_target' }
            ]
        }

        // 列不存在，触发 ADD COLUMN
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    assert.ok(calls.some(call => call.sql.includes('CREATE TABLE IF NOT EXISTS diary_praise')))
    assert.ok(calls.some(call => call.sql.includes('CREATE TABLE IF NOT EXISTS diary_comment')))

    // ensureColumn 的 ALTER 语句把列名拼在 SQL 里，values[0] 是列注释
    const alterSql = calls
        .filter(call => call.sql.includes('ALTER TABLE diary ADD COLUMN'))
        .map(call => call.sql)
    assert.equal(alterSql.length, 2)
    assert.ok(alterSql[0].includes('ADD COLUMN likes '))
    assert.ok(alterSql[1].includes('ADD COLUMN comments '))

    // 迁移登记必须写入，否则下次启动会重复执行
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261027_diary_interaction'
    ))
})

test('comment interaction migration creates interaction tables and counters', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return [
                { version: '20261023_article_owner' },
                { version: '20261024_image_storage' },
                { version: '20261024_subset_soft_delete' },
                { version: '20261025_system_log' },
                { version: '20261026_view_stats' },
                { version: '20261027_file_lifecycle' },
                { version: '20261027_diary_interaction' },
                { version: '20261027_comment_reply_target' }
            ]
        }

        // 列不存在，触发存量库 ADD COLUMN
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    assert.ok(calls.some(call =>
        call.sql.includes('CREATE TABLE IF NOT EXISTS comment_praise')
    ))
    assert.ok(calls.some(call =>
        call.sql.includes('CREATE TABLE IF NOT EXISTS comment_report')
    ))

    const alterSql = calls
        .filter(call => call.sql.includes('ALTER TABLE comment ADD COLUMN')
            || call.sql.includes('ALTER TABLE diary_comment ADD COLUMN'))
        .map(call => call.sql)
    assert.equal(alterSql.length, 3)
    assert.ok(alterSql.some(sql => sql.includes('ALTER TABLE comment ADD COLUMN likes ')))
    assert.ok(alterSql.some(sql => sql.includes('ALTER TABLE diary_comment ADD COLUMN likes ')))
    assert.ok(alterSql.some(sql => sql.includes('ALTER TABLE diary_comment ADD COLUMN complaint ')))

    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261027_comment_interaction'
    ))
})

test('comment reply target migration adds nullable target columns', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return [
                { version: '20261023_article_owner' },
                { version: '20261024_image_storage' },
                { version: '20261024_subset_soft_delete' },
                { version: '20261025_system_log' },
                { version: '20261026_view_stats' },
                { version: '20261027_file_lifecycle' },
                { version: '20261027_diary_interaction' },
                { version: '20261027_comment_interaction' }
            ]
        }

        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    const alterSql = calls
        .filter(call => call.sql.includes('ALTER TABLE comment ADD COLUMN'))
        .map(call => call.sql)
    assert.equal(alterSql.length, 2)
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN reply_to_comment_id BIGINT UNSIGNED NULL')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN reply_to_user_id BIGINT UNSIGNED NULL')))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261027_comment_reply_target'
    ))
})
