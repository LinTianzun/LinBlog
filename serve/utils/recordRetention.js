const recordModel = require('../model/dbModel/record/index')

/**
 * 访问记录保留期清理任务。
 *
 * record 表由中间件持续写入且没有删除路径，长期运行会无限增长。
 * 这里起一个定时器按天清理超过保留期的记录：启动后延迟 1 分钟跑第一轮
 * （避开启动瞬时峰值），之后每 24 小时一轮。清理失败只记日志，不阻断服务。
 */
const DAY_MS = 24 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 60 * 1000

function readRetentionDays() {
    const raw = process.env.LINBLOG_RECORD_RETENTION_DAYS
    const parsed = Number.parseInt(raw ?? '', 10)
    // 至少保留 1 天，避免误配成 0 把全表清空
    if (!Number.isFinite(parsed) || parsed < 1) return recordModel.RETENTION_DAYS
    return parsed
}

async function pruneOnce() {
    const days = readRetentionDays()
    try {
        const result = await recordModel.pruneRecords(days)
        if (result.deleted > 0) {
            console.log(`[Record] 已清理 ${result.deleted} 条超过 ${days} 天的访问记录`)
        }
        return result
    } catch (err) {
        console.error('[Record] 清理访问记录失败：', err.message)
        return { deleted: 0, batches: 0 }
    }
}

/**
 * 启动清理定时器。
 * @returns {{ stop: () => void, pruneOnce: () => Promise<object> }}
 */
function startRecordRetention() {
    const timer = setTimeout(async () => {
        await pruneOnce()
        interval = setInterval(pruneOnce, DAY_MS)
        // 定时器不阻止进程退出
        if (interval.unref) interval.unref()
    }, FIRST_RUN_DELAY_MS)
    if (timer.unref) timer.unref()

    let interval = null

    return {
        stop() {
            clearTimeout(timer)
            if (interval) clearInterval(interval)
            interval = null
        },
        pruneOnce,
    }
}

module.exports = { startRecordRetention, pruneOnce, readRetentionDays }
