const labelModel = require('../model/dbModel/label/index')
const { writeSystemLog } = require('../utils/logHelper')

async function getLabels(req, res) {
    try {
        const rows = await labelModel.findLabels()

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                count: rows.reduce((total, row) => total + Number(row.value || 0), 0),
                list: rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    value: Number(row.value || 0),
                    moment: row.moment
                }))
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '标签查询失败：' + err.message })
    }
}

async function createLabel(req, res) {
    try {
        if (!['admin', 'editor'].includes(req.user.userType)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以创建标签' })
        }

        const { name } = req.body
        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ code: 400, message: '标签名称不能为空' })
        }
        const normalizedName = name.trim()
        if (normalizedName.length > labelModel.MAX_LABEL_LENGTH) {
            return res.status(400).json({ code: 400, message: `标签名称不能超过${labelModel.MAX_LABEL_LENGTH}字` })
        }

        const existing = await labelModel.findLabelByName(normalizedName)
        if (existing) {
            return res.status(409).json({ code: 409, message: '已存在同名标签' })
        }

        const result = await labelModel.insertLabel(normalizedName)
        writeSystemLog({
            userId: req.user.userId,
            action: 'create',
            module: 'label',
            targetType: 'label',
            targetId: result.labelId,
            detail: `创建标签「${normalizedName}」`,
            ip: req.ip || null,
        })

        res.status(201).json({
            code: 200,
            message: '标签创建成功',
            data: { labelId: result.labelId }
        })
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ code: 409, message: '已存在同名标签' })
        }
        res.status(500).json({ code: 500, message: '标签创建失败：' + err.message })
    }
}

async function deleteLabel(req, res) {
    try {
        if (!['admin', 'editor'].includes(req.user.userType)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以删除标签' })
        }

        const { id } = req.params
        if (!id || isNaN(id)) {
            return res.status(400).json({ code: 400, message: '请传入有效的标签ID' })
        }

        const rows = await labelModel.findLabels()
        const target = rows.find(row => Number(row.id) === Number(id))
        if (!target) {
            return res.status(404).json({ code: 404, message: '标签不存在' })
        }

        const articleCount = await labelModel.countArticlesByLabelName(target.name)
        if (articleCount > 0) {
            return res.status(400).json({
                code: 400,
                message: `该标签仍被 ${articleCount} 篇文章使用，请先移除相关文章的标签`
            })
        }

        const affectedRows = await labelModel.deleteLabel(id)
        if (affectedRows === 0) {
            return res.status(404).json({ code: 404, message: '标签不存在' })
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'delete',
            module: 'label',
            targetType: 'label',
            targetId: Number(id) || null,
            detail: `删除标签「${target.name}」`,
            ip: req.ip || null,
        })

        res.json({ code: 200, message: '标签删除成功' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '标签删除失败：' + err.message })
    }
}

module.exports = { getLabels, createLabel, deleteLabel }
