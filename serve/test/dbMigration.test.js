const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const db = require(path.resolve(__dirname, '../model/db/dbnew.js'))

// 已应用列表：用例通过「除目标迁移外全部已应用」来隔离单个迁移。
// 新增迁移后同步补进这里，否则待执行迁移会多出一个导致 appliedCount 断言失败。
const ALL_MIGRATIONS = [
    '20261023_article_owner',
    '20261024_image_storage',
    '20261024_subset_soft_delete',
    '20261025_system_log',
    '20261026_view_stats',
    '20261027_file_lifecycle',
    '20261027_diary_interaction',
    '20261027_comment_interaction',
    '20261027_comment_reply_target',
    '20261028_diary_comment_reply',
    '20261028_password_reset',
    '20261028_password_reset_version_guard',
    '20261028_diary_owner',
    '20261028_access_control',
    '20261029_comment_report_reason'
]

// 除 exclude 外全部视为已应用
const appliedExcept = (exclude) => ALL_MIGRATIONS
    .filter(version => version !== exclude)
    .map(version => ({ version }))

test('applied migrations are not executed twice', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return ALL_MIGRATIONS.map(version => ({ version }))
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
            return appliedExcept('20261027_diary_interaction')
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
            return appliedExcept('20261027_comment_interaction')
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

test('comment report reason migration adds reason and detail columns', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261029_comment_report_reason')
        }

        return []
    }

    const result = await db.runMigrations(exec)

    assert.deepEqual(result, { appliedCount: 1 })
    const alterSql = calls
        .filter(call => call.sql.includes('ALTER TABLE comment_report ADD COLUMN'))
        .map(call => call.sql)
    assert.equal(alterSql.length, 2)
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN reason VARCHAR(32)')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN detail VARCHAR(200)')))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261029_comment_report_reason'
    ))
})

test('comment reply target migration adds nullable target columns', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261027_comment_reply_target')
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

test('diary comment reply migration adds two-level reply columns', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261028_diary_comment_reply')
        }

        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    const alterSql = calls
        .filter(call => call.sql.includes('ALTER TABLE diary_comment ADD COLUMN'))
        .map(call => call.sql)
    assert.equal(alterSql.length, 3)
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN parent_id BIGINT UNSIGNED NOT NULL DEFAULT 0')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN reply_to_comment_id BIGINT UNSIGNED NULL')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN reply_to_user_id BIGINT UNSIGNED NULL')))

    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261028_diary_comment_reply'
    ))
})

test('password reset migration adds token version and reset token table', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261028_password_reset')
        }

        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0')
    ))
    assert.ok(calls.some(call =>
        call.sql.includes('CREATE TABLE IF NOT EXISTS password_reset_token')
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261028_password_reset'
    ))
})

test('password reset version guard migration binds tokens to token_version', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })
        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261028_password_reset_version_guard')
        }
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })
    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE password_reset_token ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0')
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261028_password_reset_version_guard'
    ))
})

test('diary owner migration adds owner column, index and backfills legacy rows', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261028_diary_owner')
        }
        // information_schema 查询一律返回空：列/索引/外键都不存在，触发补全
        if (sql.includes('information_schema')) return []
        // 回填归属时取到的最早管理员
        if (sql.includes('FROM users')) return [{ id: 7 }]

        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE diary ADD COLUMN user_id BIGINT UNSIGNED NULL')
    ))
    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE diary ADD INDEX idx_diary_user (user_id)')
    ))
    assert.ok(calls.some(call =>
        call.sql.includes('ADD CONSTRAINT fk_diary_user')
    ))
    // 历史随笔必须落到某个真实用户名下，否则普通用户会看到别人的内容
    assert.ok(calls.some(call =>
        call.sql.includes('UPDATE diary SET user_id = ? WHERE user_id IS NULL')
        && call.values[0] === 7
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261028_diary_owner'
    ))
})

test('diary owner migration keeps NULL owner when no user exists yet', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261028_diary_owner')
        }
        if (sql.includes('information_schema')) return []
        // 空库：没有任何用户可归属
        if (sql.includes('FROM users')) return []

        return []
    }

    await db.runMigrations(exec)
    assert.equal(
        calls.some(call => call.sql.includes('UPDATE diary SET user_id')),
        false
    )
})

test('access control migration creates the role permission matrix and promotes the fixed super admin', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261028_access_control')
        }
        // information_schema 查询一律返回空：列与唯一索引都不存在，触发补全
        if (sql.includes('information_schema')) return []

        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE users ADD COLUMN is_super_admin TINYINT(1) NOT NULL DEFAULT 0')
    ))
    assert.ok(calls.some(call =>
        call.sql.includes('CREATE TABLE IF NOT EXISTS role_permission')
    ))
    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE users ADD UNIQUE KEY uk_single_super_admin (super_admin_slot)')
    ))
    // 固定账号只提升、不重建：历史库里的 admin@linlog.com 会被标记为唯一超级管理员
    const promote = calls.find(call => call.sql.includes('UPDATE users SET is_super_admin = 1'))
    assert.ok(promote)
    assert.equal(promote.values[0], 'admin@linlog.com')
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261028_access_control'
    ))
})
