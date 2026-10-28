const nodemailer = require('nodemailer')
const config = require('../config/default')

let transporter = null
let transporterKey = ''

function getTransporter() {
    const { host, port, secure, user, password } = config.smtp
    if (!host) return null

    const key = [host, port, secure, user, password].join('|')
    if (!transporter || transporterKey !== key) {
        transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: user ? { user, pass: password } : undefined,
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 15_000,
        })
        transporterKey = key
    }
    return transporter
}

/**
 * 发送密码重置邮件。SMTP 未配置时仅输出到服务端日志，便于本地开发，
 * 绝不把重置链接返回给 API 调用方。
 */
async function sendPasswordResetMail({ to, username, resetUrl }) {
    const mailer = getTransporter()
    if (!mailer) {
        console.info(`[Mail] SMTP 未配置，密码重置链接（${to}）：${resetUrl}`)
        return { delivered: false, development: true }
    }

    await mailer.sendMail({
        from: config.smtp.from,
        to,
        subject: '重置你的 LinBlog 密码',
        text: [
            `${username}，你好：`,
            '',
            '我们收到了重置你 LinBlog 账户密码的请求。请在 30 分钟内打开下面的链接：',
            resetUrl,
            '',
            '如果这不是你发起的操作，请忽略这封邮件，你的密码不会改变。',
        ].join('\n'),
        html: `
            <div style="max-width:560px;margin:0 auto;padding:32px;font-family:Arial,sans-serif;color:#222;line-height:1.7">
                <h2 style="margin:0 0 20px">重置 LinBlog 密码</h2>
                <p>${escapeHtml(username)}，你好：</p>
                <p>请在 30 分钟内点击下面的按钮设置新密码。此链接只能使用一次。</p>
                <p style="margin:28px 0">
                    <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2b5aed;color:#fff;text-decoration:none">设置新密码</a>
                </p>
                <p style="color:#666;font-size:13px">如果这不是你发起的操作，请忽略这封邮件，你的密码不会改变。</p>
            </div>
        `,
    })
    return { delivered: true, development: false }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

module.exports = { sendPasswordResetMail }
