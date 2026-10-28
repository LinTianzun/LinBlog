const bcrypt = require('bcrypt')
const config = require('../config/default')
const passwordResetModel = require('../model/dbModel/passwordReset/index')
const { sendPasswordResetMail } = require('../utils/mailer')
const { writeSystemLog } = require('../utils/logHelper')

const REQUEST_MESSAGE = '如果该邮箱已注册，重置邮件将在几分钟内送达，请检查收件箱和垃圾邮件。'

function normalizeMail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isMail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function requestPasswordReset(req, res) {
    try {
        const mail = normalizeMail(req.body?.mail)
        if (!mail || !isMail(mail)) {
            return res.status(400).json({ code: 400, message: '请输入合法邮箱' })
        }

        const users = await passwordResetModel.findUserForReset(mail)
        const user = users[0]

        // 无论邮箱是否存在都返回相同提示，避免账号枚举
        if (!user || Number(user.status) !== 1) {
            return res.json({ code: 200, message: REQUEST_MESSAGE })
        }

        const recent = await passwordResetModel.findRecentToken(user.id)
        if (recent) {
            return res.json({ code: 200, message: REQUEST_MESSAGE })
        }

        const token = await passwordResetModel.createResetToken(user.id, req.ip)
        const baseUrl = config.publicUrl || config.allowedOrigins[0]
        const resetUrl = `${baseUrl}/resetPassword?token=${encodeURIComponent(token)}`

        try {
            await sendPasswordResetMail({
                to: user.mail,
                username: user.username,
                resetUrl,
            })
        } catch (err) {
            // 邮件失败不暴露账号状态；立即作废令牌，允许用户稍后重新申请
            console.error('[PasswordReset] 邮件发送失败：', err.message)
            await passwordResetModel.revokeToken(token)
        }

        writeSystemLog({
            userId: user.id,
            action: 'update',
            module: 'user',
            targetType: 'user',
            targetId: user.id,
            detail: '用户申请重置登录密码',
            ip: req.ip || null,
        })

        return res.json({ code: 200, message: REQUEST_MESSAGE })
    } catch (err) {
        console.error('[PasswordReset] 申请失败：', err)
        return res.status(500).json({ code: 500, message: '重置邮件发送失败，请稍后重试' })
    }
}

async function validatePasswordResetToken(req, res) {
    try {
        const token = typeof req.query?.token === 'string' ? req.query.token.trim() : ''
        const record = await passwordResetModel.findValidToken(token)
        if (!record) {
            return res.status(400).json({ code: 400, message: '重置链接无效或已过期，请重新申请' })
        }
        return res.json({
            code: 200,
            data: { username: record.username, expiresInMinutes: passwordResetModel.TOKEN_TTL_MINUTES },
        })
    } catch (err) {
        console.error('[PasswordReset] 校验令牌失败：', err)
        return res.status(500).json({ code: 500, message: '校验重置链接失败，请稍后重试' })
    }
}

async function resetPassword(req, res) {
    try {
        const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
        const newPassword = req.body?.newPassword

        if (!token) {
            return res.status(400).json({ code: 400, message: '重置链接无效，请重新申请' })
        }
        if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
            return res.status(400).json({ code: 400, message: '新密码长度需在 8 到 72 位之间' })
        }

        const record = await passwordResetModel.findValidToken(token)
        if (!record) {
            return res.status(400).json({ code: 400, message: '重置链接无效或已过期，请重新申请' })
        }

        const salt = await bcrypt.genSalt(10)
        const passwordHash = await bcrypt.hash(newPassword, salt)
        const changed = await passwordResetModel.consumeResetToken(
            record.id,
            record.user_id,
            passwordHash
        )
        if (!changed) {
            return res.status(400).json({ code: 400, message: '重置链接已被使用，请重新申请' })
        }

        writeSystemLog({
            userId: record.user_id,
            action: 'update',
            module: 'user',
            targetType: 'user',
            targetId: record.user_id,
            detail: '用户通过邮箱重置了登录密码',
            ip: req.ip || null,
        })

        return res.json({ code: 200, message: '密码已重置，请使用新密码登录' })
    } catch (err) {
        console.error('[PasswordReset] 重置失败：', err)
        return res.status(500).json({ code: 500, message: '密码重置失败，请稍后重试' })
    }
}

module.exports = {
    requestPasswordReset,
    validatePasswordResetToken,
    resetPassword,
}
