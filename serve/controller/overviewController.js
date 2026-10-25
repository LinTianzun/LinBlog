const articleModel = require('../model/dbModel/article/index')
const fileModel = require('../model/dbModel/file/index')
const diaryModel = require('../model/dbModel/diary/index')
const commentModel = require('../model/dbModel/comment/index')
const messageModel = require('../model/dbModel/message/index')
const recordModel = require('../model/dbModel/record/index')

/**
 * 总览统计聚合接口
 * 复用各模块现有计数方法，不新增 SQL，一次请求汇总前端 gather 卡片所需数据
 */
async function getOverviewSummary(req, res) {
    try {
        const { userId, userType } = req.user

        // 文章 / 图库各自走 countArticlesByState 并按 classify 拆分
        const [articleSummary, gallerySummary, fileSummary, diaryResult, commentResult, messageUnread] =
            await Promise.all([
                articleModel.countArticlesByState({ classify: 'article', userId, userType }),
                articleModel.countArticlesByState({ classify: 'image', userId, userType }),
                fileModel.countFilesSummary(),
                diaryModel.getDiariesByPage({ pageSize: 1, offset: 0 }),
                commentModel.getCommentsByPage(1, 1, 0),
                messageModel.getUnreadCount(userId),
            ])

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                article: articleSummary.all,
                gallery: gallerySummary.all,
                //  本地文件卡片展示磁盘文件总大小（字节），前端再格式化成可读体积
                file: fileSummary.totalSize,
                diary: diaryResult.total,
                comment: commentResult.total,
                messageUnread,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '总览统计查询失败：' + err.message })
    }
}

// 近一周/近一月访问趋势与设备/来源分布
async function getVisitStats(req, res) {
    try {
        const days = req.query.period === 'moon' ? 30 : 7

        const [dayRows, deviceRows, osRows] = await Promise.all([
            recordModel.countRecordsByDay(days),
            recordModel.countRecordsByField('device', days),
            recordModel.countRecordsByField('os', days),
        ])

        // 补全连续日期轴，无访问的天记 0
        const byDate = new Map(dayRows.map((row) => [row.date, row.count]))
        const visit = []
        const now = new Date()
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
            const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            visit.push({ date: label, count: byDate.get(label) ?? 0 })
        }

        const device = deviceRows.map((row) => ({
            key: row.label,
            name: row.label === 'mobile' ? '移动端' : row.label === 'pc' ? '桌面端' : row.label,
            value: row.value,
        }))
        const website = osRows.map((row) => ({ key: row.label, name: row.label, value: row.value }))

        return res.json({
            code: 200,
            message: '查询成功',
            data: { visit, device, website },
        })
    } catch (err) {
        return res.status(500).json({ code: 500, message: '访问统计查询失败：' + err.message })
    }
}

module.exports = {
    getOverviewSummary,
    getVisitStats,
}
