const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const modelPath = path.resolve(__dirname, '../model/dbModel/passwordReset/index.js')
const usersModelPath = path.resolve(__dirname, '../model/dbModel/users/index.js')
const originalLoad = Module._load
const queries = []
let transactionHandler = null

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === modelPath) {
        if (request === '../../db/dbnew') {
            return {
                async query(sql, values = []) {
                    queries.push({ sql, values })
                    return []
                },
                async withTransaction(callback) {
                    return callback(transactionHandler)
                },
            }
        }
        if (request === '../users/index' && parent.filename === modelPath) {
            return {
                async resetUserPassword(userId, hash, exec) {
                    await exec('RESET_PASSWORD', [userId, hash])
                }
            }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const model = require(modelPath)
Module._load = originalLoad

test.beforeEach(() => {
    queries.length = 0
    transactionHandler = null
})

test('token hashes are deterministic and never equal the raw token', () => {
    const token = 'b'.repeat(64)
    assert.equal(model.hashToken(token), model.hashToken(token))
    assert.notEqual(model.hashToken(token), token)
    assert.equal(model.hashToken(token).length, 64)
})

test('creating a token stores only its SHA-256 hash and a 30-minute expiry', async () => {
    let rawToken
    const originalRandom = require('node:crypto').randomBytes
    require('node:crypto').randomBytes = () => Buffer.from('c'.repeat(64), 'hex')
    try {
        rawToken = await model.createResetToken(7, '127.0.0.1')
    } finally {
        require('node:crypto').randomBytes = originalRandom
    }

    assert.equal(rawToken, 'c'.repeat(64))
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO password_reset_token'))
    assert.ok(insert)
    assert.notEqual(insert.values[1], rawToken)
    assert.equal(insert.values[1], model.hashToken(rawToken))
    assert.equal(insert.values[3], 30)
    assert.equal(insert.values[4], 7)
})

test('a reset token can be consumed exactly once inside a transaction', async () => {
    const calls = []
    transactionHandler = {
        query(sql, values, callback) {
            calls.push({ sql, values })
            callback(null, { affectedRows: 1 })
        }
    }

    const ok = await model.consumeResetToken(2, 7, 'hash')
    assert.equal(ok, true)
    assert.ok(calls.some(call => call.sql === 'RESET_PASSWORD'))
})

test('consume refuses a token that was already used or expired', async () => {
    transactionHandler = {
        query(_sql, _values, callback) {
            callback(null, { affectedRows: 0 })
        }
    }
    const ok = await model.consumeResetToken(2, 7, 'hash')
    assert.equal(ok, false)
})

test('revoking a token marks it used without exposing the raw value', async () => {
    const token = 'd'.repeat(64)
    await model.revokeToken(token)
    const update = queries.find(entry => entry.sql.includes('SET used_at = NOW()'))
    assert.ok(update)
    assert.equal(update.values[0], model.hashToken(token))
    assert.notEqual(update.values[0], token)
})
