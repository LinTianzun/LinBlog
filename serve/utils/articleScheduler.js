const articleWorkflowModel = require('../model/dbModel/articleWorkflow/index')
const { writeSystemLog } = require('./logHelper')
const { cleanupCover } = require('./coverCleanup')

const DEFAULT_INTERVAL_MS = 30_000

/**
 * 定时发布调度器：低频扫描到期内容，适合单机或小规模部署。
 * 数据库更新带 scheduled_at 非空条件，多实例并发时只有一个会成功发布。
 */
function startArticleScheduler({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    let running = false
    let stopped = false
    let timer = null

    const tick = async () => {
        if (running || stopped) return
        running = true
        try {
            const rows = await articleWorkflowModel.findDueScheduledArticles(20)
            for (const row of rows) {
                try {
                    const result = await articleWorkflowModel.publishScheduledArticle(row.id)
                    if (!result.published) continue

                    if (result.previousCover) await cleanupCover(result.previousCover)

                    writeSystemLog({
                        userId: row.userId,
                        action: 'publish',
                        module: row.classify === 'image' ? 'gallery' : 'article',
                        targetType: 'article',
                        targetId: row.id,
                        detail: '定时发布已执行',
                    })
                } catch (err) {
                    console.error(`[ArticleScheduler] 文章 ${row.id} 定时发布失败：`, err.message)
                }
            }
        } catch (err) {
            console.error('[ArticleScheduler] 扫描定时发布失败：', err.message)
        } finally {
            running = false
        }
    }

    timer = setInterval(() => void tick(), intervalMs)
    timer.unref?.()
    void tick()

    return {
        stop() {
            stopped = true
            if (timer) clearInterval(timer)
            timer = null
        },
        runOnce: tick,
    }
}

module.exports = { startArticleScheduler, DEFAULT_INTERVAL_MS }
