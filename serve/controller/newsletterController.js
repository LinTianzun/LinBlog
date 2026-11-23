const config = require('../config/default')
const newsletterModel = require('../model/dbModel/newsletter/index')
const { logger } = require('../utils/logger.js')
const { sendNewsletterConfirmMail } = require('../utils/mailer')
const { writeSystemLog } = require('../utils/logHelper')

function resolveBaseUrl(req) {
    if (config.publicUrl) return config.publicUrl
    const protocol = req?.protocol || 'http'
    const host = typeof req?.get === 'function' ? req.get('host') : ''
    return `${protocol}://${host || 'localhost'}`
}

function buildNewsletterUrl(req, action, token) {
    const url = new URL('/api/newsletter/' + action, resolveBaseUrl(req))
    url.searchParams.set('token', token)
    return url.toString()
}

function redirectTo(req, res, status) {
    const url = new URL('/portal/newsletter', resolveBaseUrl(req))
    url.searchParams.set('status', status)
    res.redirect(302, url.toString())
}

/**
 * 公开订阅入口：统一返回“若邮箱可用会收到确认信”，
 * 不透露该邮箱是否已订阅，避免被枚举。
 */
async function subscribe(req, res) {
    try {
        const email = newsletterModel.normalizeEmail(req.body?.email)
        if (!email) {
            return res.status(400).json({ code: 400, message: '请输入有效的邮箱地址' })
        }

        const recent = await newsletterModel.countRecentRequestsByIp(req.ip)
        if (recent > 0) {
            return res.json({
                code: 200,
                message: '如果该邮箱可用，我们已发送确认邮件',
                data: { status: 'pending' },
            })
        }

        const subscriber = await newsletterModel.upsertSubscriberRequest(
            email,
            req.body?.source || 'portal',
            req.ip
        )

        if (subscriber.status === 'confirmed') {
            return res.json({
                code: 200,
                message: '这个邮箱已经在订阅列表里了',
                data: { status: 'confirmed' },
            })
        }

        try {
            await sendNewsletterConfirmMail({
                to: email,
                confirmUrl: buildNewsletterUrl(req, 'confirm', subscriber.token),
            })
        } catch (mailError) {
            logger.warn('[Newsletter] 确认邮件发送失败', null, mailError)
            return res.status(503).json({
                code: 503,
                message: '确认邮件发送失败，请稍后再试',
            })
        }

        writeSystemLog({
            userId: null,
            action: 'create',
            module: 'newsletter',
            targetType: 'newsletter',
            targetId: subscriber.id,
            detail: '门户新增一条订阅意向',
            ip: req.ip || null,
        })

        return res.json({
            code: 200,
            message: '确认邮件已发送，请打开邮箱完成订阅',
            data: { status: 'pending' },
        })
    } catch (err) {
        return res.status(500).json({ code: 500, message: '订阅失败：' + err.message })
    }
}

// 邮件里的链接直接落在浏览器：成功/过期都跳到门户状态页，不返回 JSON
async function confirm(req, res) {
    try {
        const result = await newsletterModel.confirmSubscriber(req.query?.token)
        redirectTo(req, res, result ? 'confirmed' : 'invalid')
    } catch (err) {
        logger.error('[Newsletter] 确认订阅失败', null, err)
        redirectTo(req, res, 'error')
    }
}

async function unsubscribe(req, res) {
    try {
        const result = await newsletterModel.unsubscribeSubscriber(req.query?.token)
        redirectTo(req, res, result ? 'unsubscribed' : 'invalid')
    } catch (err) {
        logger.error('[Newsletter] 退订失败', null, err)
        redirectTo(req, res, 'error')
    }
}

function getStatus(req, res) {
    res.set('Cache-Control', 'no-store')
    res.json({
        code: 200,
        message: 'ok',
        data: {
            emailConfigured: Boolean(config.smtp.host),
            intervalSeconds: newsletterModel.RESEND_INTERVAL_SECONDS,
        },
    })
}

module.exports = {
    subscribe,
    confirm,
    unsubscribe,
    getStatus,
    buildNewsletterUrl,
}
