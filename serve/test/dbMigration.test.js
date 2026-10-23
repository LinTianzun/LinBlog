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
            return [{ version: '20261023_article_owner' }]
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
