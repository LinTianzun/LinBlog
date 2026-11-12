const siteModel = require('../model/dbModel/site/index')

// 公开读取：桌宠是否显示对所有访客一致，不能依赖各浏览器本地状态
async function getSettings(_req, res) {
    try {
        const settings = await siteModel.getSettings()
        res.set('Cache-Control', 'no-store')
        return res.status(200).json({
            code: 200,
            message: '获取站点设置成功',
            data: settings
        })
    } catch (err) {
        console.error('[Site] 读取站点设置失败：', err)
        return res.status(500).json({
            code: 500,
            message: '读取站点设置失败',
            data: null
        })
    }
}

async function updateSettings(req, res) {
    const body = req.body || {}
    const booleanFields = [
        'desktopPetEnabled',
        'petRoamingEnabled',
        'petDragEnabled',
        'petBubbleEnabled',
        'petAutoSleepEnabled'
    ]
    for (const field of booleanFields) {
        if (body[field] !== undefined && typeof body[field] !== 'boolean') {
            return res.status(400).json({
                code: 400,
                message: `${field} 必须是布尔值`,
                data: null
            })
        }
    }
    if (body.petSize !== undefined && !['small', 'medium', 'large'].includes(body.petSize)) {
        return res.status(400).json({
            code: 400,
            message: 'petSize 只能是 small / medium / large',
            data: null
        })
    }
    if (body.petActivity !== undefined && !['quiet', 'normal', 'lively'].includes(body.petActivity)) {
        return res.status(400).json({
            code: 400,
            message: 'petActivity 只能是 quiet / normal / lively',
            data: null
        })
    }
    if (body.petScope !== undefined && !['all', 'portal', 'admin'].includes(body.petScope)) {
        return res.status(400).json({
            code: 400,
            message: 'petScope 只能是 all / portal / admin',
            data: null
        })
    }
    if (body.petHomeCorner !== undefined && !['left', 'right'].includes(body.petHomeCorner)) {
        return res.status(400).json({
            code: 400,
            message: 'petHomeCorner 只能是 left / right',
            data: null
        })
    }
    const rangeFields = [
        { field: 'petScale', min: 60, max: 200 },
        { field: 'petOpacity', min: 40, max: 100 }
    ]
    for (const { field, min, max } of rangeFields) {
        if (body[field] === undefined) continue
        if (!Number.isInteger(body[field]) || body[field] < min || body[field] > max) {
            return res.status(400).json({
                code: 400,
                message: `${field} 必须是 ${min}-${max} 之间的整数`,
                data: null
            })
        }
    }

    try {
        const settings = await siteModel.updateSettings(body)
        return res.status(200).json({
            code: 200,
            message: '站点设置已保存',
            data: settings
        })
    } catch (err) {
        console.error('[Site] 保存站点设置失败：', err)
        return res.status(500).json({
            code: 500,
            message: '保存站点设置失败',
            data: null
        })
    }
}

module.exports = { getSettings, updateSettings }
