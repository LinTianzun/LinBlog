const assert = require('node:assert/strict')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'https://blog.example.com'
process.env.LINBLOG_PUBLIC_URL = 'https://blog.example.com'

const newsletterModel = require('../model/dbModel/newsletter/index')

function response() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this },
        set(key, value) { this.headers[key.toLowerCase()] = value; return this },
        redirect(code, location) { this.statusCode = code; this.location = location; return this },
    }
}

test('邮箱规范化：去除空格、转小写，拒绝非法地址', () => {
    assert.equal(newsletterModel.normalizeEmail('  User@Example.COM '), 'user@example.com')
    assert.equal(newsletterModel.normalizeEmail('not-an-email'), '')
    assert.equal(newsletterModel.normalizeEmail('a@b'), '')
    assert.equal(newsletterModel.normalizeEmail(123), '')
    assert.equal(newsletterModel.normalizeEmail(`${'a'.repeat(200)}@example.com`), '')
})

test('订阅令牌只保存 SHA-256 哈希', () => {
    const token = newsletterModel.createToken()
    assert.match(token, /^[a-f0-9]{64}$/)
    assert.equal(newsletterModel.hashToken(token).length, 64)
    assert.notEqual(newsletterModel.hashToken(token), token)
})

test('订阅接口正常发信，且不把确认令牌返回给前端', async () => {
    const original = newsletterModel.upsertSubscriberRequest
    const originalCount = newsletterModel.countRecentRequestsByIp
    const mails = []
    newsletterModel.upsertSubscriberRequest = async (email) => ({
        token: 'b'.repeat(64),
        id: 1,
        status: 'pending',
        email,
    })
    newsletterModel.countRecentRequestsByIp = async () => 0

    const { sendNewsletterConfirmMail } = require('../utils/mailer')
    const originalMail = sendNewsletterConfirmMail
    const mailer = require('../utils/mailer')
    mailer.sendNewsletterConfirmMail = async (payload) => { mails.push(payload) }

    const controller = require('../controller/newsletterController')
    const res = response()
    try {
        await controller.subscribe({
            body: { email: 'Reader@Example.com' },
            ip: '127.0.0.1',
            protocol: 'https',
            get: () => 'blog.example.com',
        }, res)
    } finally {
        newsletterModel.upsertSubscriberRequest = original
        newsletterModel.countRecentRequestsByIp = originalCount
        mailer.sendNewsletterConfirmMail = originalMail
    }

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.data.status, 'pending')
    assert.equal(JSON.stringify(res.body).includes('b'.repeat(64)), false)
    assert.equal(mails.length, 1)
    assert.match(mails[0].confirmUrl, /^https:\/\/blog\.example\.com\/api\/newsletter\/confirm\?token=b{64}$/)
})

test('确认与退订链接重定向到门户状态页', async () => {
    const originalConfirm = newsletterModel.confirmSubscriber
    const originalUnsubscribe = newsletterModel.unsubscribeSubscriber
    newsletterModel.confirmSubscriber = async () => ({ id: 1, email: 'a@example.com' })
    newsletterModel.unsubscribeSubscriber = async () => null

    const controller = require('../controller/newsletterController')
    const confirmed = response()
    const invalid = response()
    try {
        await controller.confirm({
            query: { token: 'c'.repeat(64) },
            protocol: 'https',
            get: () => 'blog.example.com',
        }, confirmed)
        await controller.unsubscribe({
            query: { token: 'c'.repeat(64) },
            protocol: 'https',
            get: () => 'blog.example.com',
        }, invalid)
    } finally {
        newsletterModel.confirmSubscriber = originalConfirm
        newsletterModel.unsubscribeSubscriber = originalUnsubscribe
    }

    assert.equal(confirmed.statusCode, 302)
    assert.equal(confirmed.location, 'https://blog.example.com/portal/newsletter?status=confirmed')
    assert.equal(invalid.location, 'https://blog.example.com/portal/newsletter?status=invalid')
})

test('同一 IP 在 60 秒内重复订阅不会再次发信', async () => {
    const originalCount = newsletterModel.countRecentRequestsByIp
    const originalUpsert = newsletterModel.upsertSubscriberRequest
    let upsertCalls = 0
    newsletterModel.countRecentRequestsByIp = async () => 1
    newsletterModel.upsertSubscriberRequest = async () => { upsertCalls += 1 }

    const controller = require('../controller/newsletterController')
    const res = response()
    try {
        await controller.subscribe({ body: { email: 'a@example.com' }, ip: '1.2.3.4' }, res)
    } finally {
        newsletterModel.countRecentRequestsByIp = originalCount
        newsletterModel.upsertSubscriberRequest = originalUpsert
    }

    assert.equal(res.statusCode, 200)
    assert.equal(upsertCalls, 0)
})
