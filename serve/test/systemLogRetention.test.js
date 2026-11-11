const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const systemLogModel = require(path.resolve(__dirname, '../model/dbModel/systemLog/index.js'))
const retention = require(path.resolve(__dirname, '../utils/systemLogRetention.js'))

test('系统日志保留期至少 30 天且可按环境变量配置', () => {
    assert.equal(retention.readRetentionDays(), 365)

    const original = process.env.LINBLOG_SYSTEM_LOG_RETENTION_DAYS
    process.env.LINBLOG_SYSTEM_LOG_RETENTION_DAYS = '10'
    try {
        assert.equal(retention.readRetentionDays(), 365)
        process.env.LINBLOG_SYSTEM_LOG_RETENTION_DAYS = '90'
        assert.equal(retention.readRetentionDays(), 90)
    } finally {
        if (original === undefined) delete process.env.LINBLOG_SYSTEM_LOG_RETENTION_DAYS
        else process.env.LINBLOG_SYSTEM_LOG_RETENTION_DAYS = original
    }
})

test('系统日志清理任务按保留期调用模型', async () => {
    const originalPrune = systemLogModel.pruneLogs
    const calls = []
    systemLogModel.pruneLogs = async (days) => {
        calls.push(days)
        return { deleted: 12, retentionDays: days }
    }

    try {
        const result = await retention.pruneOnce()
        assert.deepEqual(calls, [365])
        assert.equal(result.deleted, 12)
    } finally {
        systemLogModel.pruneLogs = originalPrune
    }
})
