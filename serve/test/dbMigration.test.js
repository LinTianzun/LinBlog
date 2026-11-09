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
    '20261029_comment_report_reason',
    '20261029_comment_report_handling',
    '20261029_message_channel',
    '20261029_comment_report_note',
    '20261030_db_backup',
    '20261030_article_workflow',
    '20261101_composite_indexes',
    '20261102_file_image_binding',
    '20261103_content_image_subset',
    '20261109_ai_management',
    '20261110_ai_env_import',
    '20261111_ai_pending_image',
    '20261112_ai_usage_metrics',
    '20261113_ai_model_health',
    '20261114_ai_model_quota',
    '20261115_ai_content_marker',
    '20261116_ai_prompt_template',
    '20261117_ai_prompt_custom'
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

test('comment report handling migration adds status, handler and index', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261029_comment_report_handling')
        }

        // information_schema 查询一律返回空：列与索引都不存在，触发补全
        if (sql.includes('information_schema')) return []

        return []
    }

    const result = await db.runMigrations(exec)

    assert.deepEqual(result, { appliedCount: 1 })
    const alterSql = calls
        .filter(call => call.sql.includes('ALTER TABLE comment_report ADD COLUMN'))
        .map(call => call.sql)
    assert.equal(alterSql.length, 3)
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN status TINYINT(1) NOT NULL DEFAULT 0')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN handled_by BIGINT UNSIGNED NULL')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN handled_at TIMESTAMP NULL')))
    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE comment_report ADD INDEX idx_report_status')
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261029_comment_report_handling'
    ))
})

test('message channel migration separates wall posts from direct messages', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261029_message_channel')
        }

        return []
    }

    const result = await db.runMigrations(exec)

    assert.deepEqual(result, { appliedCount: 1 })
    assert.ok(calls.some(call =>
        call.sql.includes("ALTER TABLE message ADD COLUMN channel ENUM('direct', 'wall') NOT NULL DEFAULT 'direct'")
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261029_message_channel'
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

test('comment report note migration adds the handling note column', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261029_comment_report_note')
        }

        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })
    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE comment_report ADD COLUMN handle_note VARCHAR(200) NULL')
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261029_comment_report_note'
    ))
})

test('db backup migration creates the backup history table', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261030_db_backup')
        }

        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })
    assert.ok(calls.some(call =>
        call.sql.includes('CREATE TABLE IF NOT EXISTS db_backup_log')
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261030_db_backup'
    ))
})

test('article workflow migration adds working copy fields and version table', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261030_article_workflow')
        }
        if (sql.includes('information_schema')) return []
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })
    const alterSql = calls
        .filter(call => call.sql.includes('ALTER TABLE article ADD COLUMN'))
        .map(call => call.sql)
    assert.equal(alterSql.length, 5)
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN scheduled_at DATETIME NULL')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN draft_content LONGTEXT NULL')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN draft_payload LONGTEXT NULL')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN draft_revision INT UNSIGNED NOT NULL DEFAULT 0')))
    assert.ok(alterSql.some(sql => sql.includes('ADD COLUMN draft_saved_at DATETIME NULL')))
    assert.ok(calls.some(call => call.sql.includes('CREATE TABLE IF NOT EXISTS article_version')))
    assert.ok(calls.some(call => call.sql.includes('ADD INDEX idx_article_scheduled')))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261030_article_workflow'
    ))
})

test('composite indexes migration adds covering indexes for report/message/record', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261101_composite_indexes')
        }
        // ensureIndex 内部的 INFORMATION_SCHEMA 查询返回空，触发 ADD INDEX
        if (sql.includes('information_schema')) return []
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    // 四条复合索引都应通过 ALTER TABLE ... ADD INDEX 下发
    assert.ok(calls.some(call => call.sql.includes('ADD INDEX idx_report_status_created (status, created_at)')))
    assert.ok(calls.some(call => call.sql.includes('ADD INDEX idx_message_receiver_type_read_created (receiver_id, type, is_read, created_at)')))
    assert.ok(calls.some(call => call.sql.includes('ADD INDEX idx_message_sender_type_created (sender_id, type, created_at)')))
    assert.ok(calls.some(call => call.sql.includes('ADD INDEX idx_record_created_path (created_at, path)')))

    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261101_composite_indexes'
    ))
})

test('ensureIndex is idempotent: existing index is not re-added', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261101_composite_indexes')
        }
        // 所有 INFORMATION_SCHEMA 查询都返回非空，模拟索引已存在
        if (sql.includes('information_schema')) return [{ INDEX_NAME: 'already_exists' }]
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })
    // 不应出现任何 ALTER TABLE ADD INDEX
    assert.ok(!calls.some(call => call.sql.includes('ADD INDEX')))
})

test('file image binding migration adds the column, unique key and backfills content images', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })
        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261102_file_image_binding')
        }
        // information_schema 查询返回空：列与唯一索引都需要补齐
        if (sql.includes('information_schema')) return []
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    assert.ok(calls.some(call =>
        call.sql.includes('ALTER TABLE file ADD COLUMN source_image_id')
    ))
    assert.ok(calls.some(call =>
        call.sql.includes('ADD UNIQUE KEY uk_file_source_image (source_image_id)')
    ))
    // 存量内容图片要补一条聚合记录，本地文件模块才能看到它们
    assert.ok(calls.some(call =>
        call.sql.includes('INSERT INTO file') && call.sql.includes('source_image_id')
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261102_file_image_binding'
    ))
})

test('content image subset migration creates the group and moves content images into it', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })
        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261103_content_image_subset')
        }
        // 分组不存在，需要新建
        if (sql.includes("subset_name = '内容图片'")) return []
        if (sql.includes('INSERT INTO subset')) return { insertId: 42 }
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    assert.ok(calls.some(call =>
        call.sql.includes('INSERT INTO subset')
        && call.values.includes('内容图片')
    ))
    // 存量内容图片要从「图片」迁到「内容图片」
    assert.ok(calls.some(call =>
        call.sql.includes('UPDATE file f')
        && call.sql.includes('source_image_id IS NOT NULL')
        && call.values[0] === 42
    ))
    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261103_content_image_subset'
    ))
})

test('ai content marker migration adds marker columns to article and diary', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })
        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261115_ai_content_marker')
        }
        // 列不存在，触发 ADD COLUMN
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    const alters = calls
        .filter(call => call.sql.includes('ADD COLUMN'))
        .map(call => call.sql)

    // 文章与随笔各三列：是否 AI 辅助、环节、时间
    assert.equal(alters.length, 6)
    assert.ok(alters.some(sql => sql.includes('ALTER TABLE article ADD COLUMN ai_assisted')))
    assert.ok(alters.some(sql => sql.includes('ALTER TABLE article ADD COLUMN ai_assist_features')))
    assert.ok(alters.some(sql => sql.includes('ALTER TABLE article ADD COLUMN ai_assisted_at')))
    assert.ok(alters.some(sql => sql.includes('ALTER TABLE diary ADD COLUMN ai_assisted')))
    assert.ok(alters.some(sql => sql.includes('ALTER TABLE diary ADD COLUMN ai_assist_features')))
    assert.ok(alters.some(sql => sql.includes('ALTER TABLE diary ADD COLUMN ai_assisted_at')))

    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261115_ai_content_marker'
    ))
})

test('ai prompt template migration creates the table and seeds default templates', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })
        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261116_ai_prompt_template')
        }
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    assert.ok(calls.some(call =>
        call.sql.includes('CREATE TABLE IF NOT EXISTS ai_prompt_template')
    ))

    // 内置模板要写进库，管理员打开页面就能看到并修改
    const seeds = calls.filter(call =>
        call.sql.includes('INSERT INTO ai_prompt_template')
    )
    assert.ok(seeds.length >= 8)
    assert.ok(seeds.some(call => call.values.includes('suggest')))
    assert.ok(seeds.some(call => call.values.includes('cover')))

    // 重复执行时不能覆盖管理员改过的内容
    assert.ok(seeds.every(call => !call.sql.includes('content = VALUES(content)')))

    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261116_ai_prompt_template'
    ))
})

test('ai prompt custom migration adds feature key and binding table', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })
        if (sql === 'SELECT version FROM schema_migrations') {
            return appliedExcept('20261117_ai_prompt_custom')
        }
        // feature_key 列已存在时 ADD COLUMN 不会执行；这里直接返回空让迁移走完整流程
        return []
    }

    const result = await db.runMigrations(exec)
    assert.deepEqual(result, { appliedCount: 1 })

    // 存量库要补 feature_key 列，并把旧模板的所属功能回填成自己的标识
    assert.ok(calls.some(call => call.sql.includes('ADD COLUMN feature_key')))
    assert.ok(calls.some(call =>
        call.sql.includes("UPDATE ai_prompt_template SET feature_key = template_key WHERE feature_key = ''")
    ))

    // 新建「功能 → 选用的模板」绑定表，支撑自定义提示词切换
    assert.ok(calls.some(call =>
        call.sql.includes('CREATE TABLE IF NOT EXISTS ai_prompt_binding')
    ))

    assert.ok(calls.some(call =>
        call.sql === 'INSERT INTO schema_migrations (version) VALUES (?)'
        && call.values[0] === '20261117_ai_prompt_custom'
    ))
})
