const petModel = require('../model/dbModel/pet/index')

const getUserId = (req) => {
    const userId = Number(req.user?.userId)
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null
}

async function getState(req, res) {
    const userId = getUserId(req)
    if (!userId) {
        return res.status(401).json({ code: 401, message: '请先登录' })
    }
    try {
        const state = await petModel.getPetState(userId)
        res.set('Cache-Control', 'no-store')
        res.json({ code: 200, message: '查询成功', data: state })
    } catch (err) {
        console.error('[Pet] 读取养成状态失败：', err)
        res.status(500).json({ code: 500, message: '读取桌宠状态失败' })
    }
}

async function saveState(req, res) {
    const userId = getUserId(req)
    if (!userId) {
        return res.status(401).json({ code: 401, message: '请先登录' })
    }
    try {
        const state = await petModel.savePetState(userId, req.body || {})
        res.set('Cache-Control', 'no-store')
        res.json({ code: 200, message: '保存成功', data: state })
    } catch (err) {
        console.error('[Pet] 保存养成状态失败：', err)
        res.status(500).json({ code: 500, message: '保存桌宠状态失败' })
    }
}

async function getHomestead(req, res) {
    const userId = getUserId(req)
    if (!userId) {
        return res.status(401).json({ code: 401, message: '请先登录' })
    }
    try {
        const state = await petModel.getHomesteadState(userId)
        res.set('Cache-Control', 'no-store')
        res.json({ code: 200, message: '查询成功', data: state })
    } catch (err) {
        console.error('[Pet] 读取小院状态失败：', err)
        res.status(500).json({ code: 500, message: '读取小院状态失败' })
    }
}

async function saveHomestead(req, res) {
    const userId = getUserId(req)
    if (!userId) {
        return res.status(401).json({ code: 401, message: '请先登录' })
    }
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ code: 400, message: '小院存档格式不正确' })
    }
    try {
        const state = await petModel.saveHomesteadState(userId, req.body)
        res.set('Cache-Control', 'no-store')
        res.json({ code: 200, message: '保存成功', data: state })
    } catch (err) {
        console.error('[Pet] 保存小院状态失败：', err)
        res.status(500).json({ code: 500, message: '保存小院状态失败' })
    }
}

module.exports = {
    getState,
    saveState,
    getHomestead,
    saveHomestead
}
