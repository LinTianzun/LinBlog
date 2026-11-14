const { query } = require('../model/db/dbnew')
const messageModel = require('../model/dbModel/message/index')
const { getSuperAdminId } = require('./notificationHelper')
const { sendAlertMail } = require('./mailer')

function classifyLabel(classify) {
    return classify === 'image' ? '图库' : '文章'
}

function clip(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength)
}

async function findUserMail(userId) {
    const rows = await query(
        'SELECT mail FROM users WHERE id = ? AND status = 1 LIMIT 1',
        [userId]
    )
    return clip(rows?.[0]?.mail, 100)
}

async function insertNotice({ receiverId, senderId, content }) {
    await messageModel.insertMessage({
        receiverId,
        type: 'notice',
        content,
    }, senderId)
}

/**
 * 定时发布成功：只发站内通知，不额外发邮件，避免每次正常发布都打扰作者。
 */
async function notifyScheduledPublishSuccess({ userId, title, classify }) {
    const receiverId = Number(userId)
    if (!Number.isSafeInteger(receiverId) || receiverId <= 0) {
        return { delivered: false, reason: 'no_recipient' }
    }

    const senderId = await getSuperAdminId()
    if (!senderId) return { delivered: false, reason: 'no_system_sender' }

    const label = classifyLabel(classify)
    const content = `你的${label}《${clip(title, 80) || '未命名内容'}》已按计划发布。`
    await insertNotice({ receiverId, senderId, content })
    return { delivered: true, receiverId }
}

/**
 * 定时发布失败：作者站内通知 + 可选邮件。
 * 邮件收件人优先使用 LINBLOG_SCHEDULE_ALERT_EMAIL，否则回退到作者账号邮箱。
 * 任一步失败都不向调度器抛出，避免通知问题反过来阻塞定时发布循环。
 */
async function notifyScheduledPublishFailure({ userId, title, classify, errorMessage }) {
    const receiverId = Number(userId)
    const result = { delivered: false, emailSent: false, reason: null }
    if (!Number.isSafeInteger(receiverId) || receiverId <= 0) {
        return { ...result, reason: 'no_recipient' }
    }

    const label = classifyLabel(classify)
    const reason = clip(errorMessage, 160) || '未知原因'
    const content = `你的${label}《${clip(title, 80) || '未命名内容'}》定时发布失败：${reason}。请到「定时发布」检查后重试。`

    try {
        const senderId = await getSuperAdminId()
        if (senderId) {
            await insertNotice({ receiverId, senderId, content })
            result.delivered = true
        } else {
            result.reason = 'no_system_sender'
        }
    } catch (error) {
        result.reason = error?.message || 'in_app_failed'
    }

    try {
        const alertRecipient = clip(process.env.LINBLOG_SCHEDULE_ALERT_EMAIL, 100)
        const to = alertRecipient || await findUserMail(receiverId)
        if (to) {
            await sendAlertMail({
                to,
                subject: `LinBlog 定时发布失败：${clip(title, 60) || '未命名内容'}`,
                text: content,
            })
            result.emailSent = true
        }
    } catch (error) {
        result.emailError = error?.message || 'mail_failed'
    }

    return result
}

module.exports = {
    notifyScheduledPublishSuccess,
    notifyScheduledPublishFailure,
}
