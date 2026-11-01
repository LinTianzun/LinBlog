/**
 * 服务器时间接口。
 * 定时发布等"本地时间"语义必须与服务器保持一致：前端若用浏览器时区
 * 计算/解析 datetime-local，浏览器时区与服务器（或用户挂钟）不一致时
 * 会算错数小时。前端以本接口返回的偏移作为唯一权威。
 */
function now(req, res) {
    const date = new Date()
    const offsetMinutes = -date.getTimezoneOffset()
    res.set('Cache-Control', 'no-store')
    res.status(200).json({
        code: 200,
        message: '查询成功',
        data: {
            // 服务器当前绝对时间
            now: date.toISOString(),
            // 服务器时区偏移（分钟，东八区为 480）
            offsetMinutes,
            // 服务器时区名，仅用于展示/排障
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        },
    })
}

module.exports = { now }
