const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const notifierPath = path.resolve(__dirname, '../utils/articlePublishNotification.js')
const originalLoad = Module._load

let inserted = []
let mails = []
let adminId = 1
let authorMail = 'author@example.com'

Module._load = function (request, parent, isMain) {
    if (parent?.filename === notifierPath) {
        if (request === '../model/db/dbnew') {
            return {
                query: async (sql) => {
                    if (sql.includes('SELECT mail')) {
                        return authorMail ? [{ mail: authorMail }] : []
                    }
                    return []
                },
            }
        }
        if (request === '../model/dbModel/message/index') {
            return {
                insertMessage: async (message, senderId) => {
                    inserted.push({ message, senderId })
                    return { messageId: inserted.length }
                },
            }
        }
        if (request === './notificationHelper') {
            return { getSuperAdminId: async () => adminId }
        }
        if (request === './mailer') {
            return {
                sendAlertMail: async (payload) => {
                    mails.push(payload)
                    return { delivered: true }
                },
            }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const notifier = require(notifierPath)
Module._load = originalLoad

test.beforeEach(() => {
    inserted = []
    mails = []
    adminId = 1
    authorMail = 'author@example.com'
    delete process.env.LINBLOG_SCHEDULE_ALERT_EMAIL
})

test('scheduled publish success sends an in-app notice without email', async () => {
    const result = await notifier.notifyScheduledPublishSuccess({
        userId: 2,
        title: '定时发布的文章',
        classify: 'article',
    })

    assert.equal(result.delivered, true)
    assert.equal(inserted.length, 1)
    assert.equal(inserted[0].senderId, 1)
    assert.equal(inserted[0].message.receiverId, 2)
    assert.equal(inserted[0].message.type, 'notice')
    assert.match(inserted[0].message.content, /已按计划发布/)
    assert.equal(mails.length, 0)
})

test('scheduled publish failure notifies the author and prefers the configured alert email', async () => {
    process.env.LINBLOG_SCHEDULE_ALERT_EMAIL = 'ops@example.com'

    const result = await notifier.notifyScheduledPublishFailure({
        userId: 2,
        title: '失败的图库',
        classify: 'image',
        errorMessage: '数据库暂时不可用',
    })

    assert.equal(result.delivered, true)
    assert.equal(result.emailSent, true)
    assert.match(inserted[0].message.content, /图库《失败的图库》/)
    assert.match(inserted[0].message.content, /数据库暂时不可用/)
    assert.equal(mails.length, 1)
    assert.equal(mails[0].to, 'ops@example.com')
})

test('scheduled publish failure falls back to the author email', async () => {
    const result = await notifier.notifyScheduledPublishFailure({
        userId: 2,
        title: '失败的文章',
        classify: 'article',
        errorMessage: '数据库暂时不可用',
    })

    assert.equal(result.emailSent, true)
    assert.equal(mails[0].to, 'author@example.com')
})

test('missing recipient skips both in-app notice and email', async () => {
    const result = await notifier.notifyScheduledPublishFailure({
        userId: null,
        title: '无主文章',
        classify: 'article',
        errorMessage: '数据库暂时不可用',
    })

    assert.equal(result.delivered, false)
    assert.equal(result.reason, 'no_recipient')
    assert.equal(inserted.length, 0)
    assert.equal(mails.length, 0)
})
