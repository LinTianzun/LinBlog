const assert = require('node:assert/strict')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const dbBackup = require('../utils/dbBackup')
const backupModel = require('../model/dbModel/backup/index')
const systemLogModel = require('../model/dbModel/systemLog/index')
const mailer = require('../utils/mailer')

async function withScheduler(run, overrides = {}) {
    const scheduler = dbBackup.startScheduledBackup({
        runOnceAtStart: false,
        createDatabaseBackup: dbBackup.createDatabaseBackup,
        pruneOldBackups: async () => ({ removed: [] }),
        pruneBackupLogs: async () => 0,
        ...overrides,
    })
    try {
        await run(scheduler)
    } finally {
        scheduler.stop()
    }
}

test.afterEach(() => {
    delete process.env.LINBLOG_BACKUP_ALERT_EMAIL
})

test('scheduled backup records success history and system activity', async () => {
    const histories = []
    const logs = []
    const originalCreate = dbBackup.createDatabaseBackup
    const originalInsert = backupModel.insertLog
    const originalSystemLog = systemLogModel.insertLog

    dbBackup.createDatabaseBackup = async () => ({
        filename: 'linlog-test.linbak.gz',
        databaseName: 'linlog',
        sizeBytes: 123,
        checksum: 'a'.repeat(64),
        tables: 2,
        rows: 7,
        durationMs: 35,
    })
    backupModel.insertLog = async (payload) => {
        histories.push(payload)
        return { insertId: 1 }
    }
    systemLogModel.insertLog = async (payload) => {
        logs.push(payload)
        return { insertId: 1 }
    }

    try {
        await withScheduler(async (scheduler) => {
            const result = await scheduler.runOnce()
            assert.equal(result.filename, 'linlog-test.linbak.gz')
            assert.deepEqual(histories, [{
                filename: 'linlog-test.linbak.gz',
                targetDatabase: 'linlog',
                sizeBytes: 123,
                checksum: 'a'.repeat(64),
                tableCount: 2,
                rowCount: 7,
                durationMs: 35,
                triggerType: 'scheduled',
                status: 'success',
            }])
            assert.equal(logs[0].module, 'backup')
            assert.equal(logs[0].action, 'system')
            assert.match(logs[0].detail, /定时数据库备份完成/)
        })
    } finally {
        dbBackup.createDatabaseBackup = originalCreate
        backupModel.insertLog = originalInsert
        systemLogModel.insertLog = originalSystemLog
    }
})

test('scheduled backup records failure, logs it and sends optional alert mail', async () => {
    const histories = []
    const logs = []
    const mails = []
    const originalCreate = dbBackup.createDatabaseBackup
    const originalInsert = backupModel.insertLog
    const originalSystemLog = systemLogModel.insertLog
    const originalSendAlert = mailer.sendAlertMail

    process.env.LINBLOG_BACKUP_ALERT_EMAIL = 'owner@example.com'
    dbBackup.createDatabaseBackup = async () => {
        throw new Error('连接失败')
    }
    backupModel.insertLog = async (payload) => {
        histories.push(payload)
        return { insertId: 1 }
    }
    systemLogModel.insertLog = async (payload) => {
        logs.push(payload)
        return { insertId: 1 }
    }
    mailer.sendAlertMail = async (payload) => {
        mails.push(payload)
        return { delivered: true }
    }

    try {
        await withScheduler(async (scheduler) => {
            await assert.rejects(() => scheduler.runOnce(), /连接失败/)
            assert.equal(histories[0].status, 'failed')
            assert.equal(histories[0].triggerType, 'scheduled')
            assert.equal(histories[0].errorMessage, '连接失败')
            assert.match(logs[0].detail, /定时数据库备份失败/)
            assert.equal(mails[0].to, 'owner@example.com')
            assert.match(mails[0].text, /连接失败/)
        })
    } finally {
        dbBackup.createDatabaseBackup = originalCreate
        backupModel.insertLog = originalInsert
        systemLogModel.insertLog = originalSystemLog
        mailer.sendAlertMail = originalSendAlert
    }
})

test('cleanup failure after a successful backup does not mark the backup as failed', async () => {
    const histories = []
    const originalInsert = backupModel.insertLog

    backupModel.insertLog = async (payload) => {
        histories.push(payload)
        return { insertId: 1 }
    }

    try {
        await withScheduler(async (scheduler) => {
            const result = await scheduler.runOnce()
            assert.equal(result.filename, 'linlog-test.linbak.gz')
        }, {
            createDatabaseBackup: async () => ({
                filename: 'linlog-test.linbak.gz',
                databaseName: 'linlog',
                sizeBytes: 123,
                checksum: 'a'.repeat(64),
                tables: 2,
                rows: 7,
                durationMs: 35,
            }),
            pruneOldBackups: async () => {
                throw new Error('磁盘清理失败')
            },
        })

        assert.equal(histories.length, 1)
        assert.equal(histories[0].status, 'success')
    } finally {
        backupModel.insertLog = originalInsert
    }
})
