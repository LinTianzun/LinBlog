const messageModel = require('../model/dbModel/message/index')

/**
 * 评论/回复的站内通知：发给内容作者或被回复的人。
 * 通知失败不能影响评论本身，调用方负责捕获并记录。
 */
async function notifyComment({ recipientId, senderId, content }) {
    const receiverId = Number(recipientId)
    const sender = Number(senderId)
    const text = String(content || '').trim().slice(0, 500)

    if (!Number.isSafeInteger(receiverId) || receiverId <= 0) {
        return { delivered: false, reason: 'no_recipient' }
    }
    if (receiverId === sender) {
        return { delivered: false, reason: 'self' }
    }
    if (!text) {
        return { delivered: false, reason: 'empty_content' }
    }

    await messageModel.insertMessage({
        receiverId,
        type: 'notice',
        content: text,
    }, sender)

    return { delivered: true, receiverId }
}

module.exports = { notifyComment }
