const systemLogModel = require('../model/dbModel/systemLog/index')

const DAY_MS = 24 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 60 * 1000

function readRetentionDays() {
    const raw = process.env.LINBLOG_SYSTEM_LOG_RETENTION_DAYS
    const parsed = Number.parseInt(raw ?? '', 10)
    if (!Number.isFinite(parsed) || parsed < 30) return 365
    return parsed
}

async function pruneOnce() {
    const days = readRetentionDays()
    try {
        const result = await systemLogModel.pruneLogs(days)
        if (result.deleted > 0) {
            console.log(`[SystemLog] 已清理 ${result.deleted} 条超过 ${days} 天的系统日志`)
        }
        return result
    } catch (err) {
        console.error('[SystemLog] 清理系统日志失败：', err.message)
        return { deleted: 0, retentionDays: days }
    }
}

function startSystemLogRetention() {
    let interval = null
    const timer = setTimeout(async () => {
        await pruneOnce()
        interval = setInterval(pruneOnce, DAY_MS)
        if (interval.unref) interval.unref()
    }, FIRST_RUN_DELAY_MS)
    if (timer.unref) timer.unref()

    return {
        stop() {
            clearTimeout(timer)
            if (interval) clearInterval(interval)
            interval = null
        },
        pruneOnce
    }
}

module.exports = { startSystemLogRetention, pruneOnce, readRetentionDays }
