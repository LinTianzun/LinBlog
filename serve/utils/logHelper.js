const systemLogModel = require('../model/dbModel/systemLog/index')

const ACTION_SET = new Set(systemLogModel.ACTIONS)
const MODULE_SET = new Set(systemLogModel.MODULES)

/**
 * 归一化并异步写系统日志；任何异常只打印不抛出，绝不影响业务请求
 * @param {Object} payload - { userId, action, module, targetType?, targetId?, detail?, ip? }
 */
function writeSystemLog(payload) {
    try {
        const action = typeof payload.action === 'string' && ACTION_SET.has(payload.action) ? payload.action : null
        const module = typeof payload.module === 'string' && MODULE_SET.has(payload.module) ? payload.module : null
        if (!action || !module) {
            return
        }

        let detail = payload.detail == null ? null : String(payload.detail)
        if (detail && detail.length > 500) {
            detail = detail.slice(0, 497) + '...'
        }

        const targetId = Number(payload.targetId)

        systemLogModel.insertLog({
            userId: payload.userId ?? null,
            action,
            module,
            targetType: payload.targetType == null ? null : String(payload.targetType).slice(0, 50),
            targetId: Number.isSafeInteger(targetId) && targetId > 0 ? targetId : null,
            detail,
            ip: payload.ip == null ? null : String(payload.ip).slice(0, 64),
        }).catch((err) => {
            console.error('[SystemLog] 写入失败：', err.message)
        })
    } catch (err) {
        console.error('[SystemLog] 记录异常：', err.message)
    }
}

module.exports = { writeSystemLog }
