const subsetModel = require('../model/dbModel/subset/index')

function canManageSubsets(userType) {
    return ['admin', 'editor'].includes(userType)
}

function formatSubset(row) {
    return {
        id: row.id,
        name: row.name,
        classify: row.classify,
        sort: row.sort,
        value: row.value !== undefined ? Number(row.value) : undefined,
        moment: row.moment
    }
}

async function getSubsets(req, res) {
    try {
        const classify = req.query.classify
        const includeCount = req.query.withCount !== 'false'
        const rows = await subsetModel.findSubsets({ classify, includeCount })

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                count: rows.reduce((total, row) => total + Number(row.value || 0), 0),
                list: rows.map(formatSubset)
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '分类查询失败：' + err.message })
    }
}

async function createSubset(req, res) {
    try {
        const { name, classify, sort } = req.body

        if (!canManageSubsets(req.user.userType)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以创建分类' })
        }
        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ code: 400, message: '分类名称不能为空' })
        }
        if (name.trim().length > 50) {
            return res.status(400).json({ code: 400, message: '分类名称不能超过50字' })
        }
        if (!subsetModel.CLASSIFY_TYPES.includes(classify)) {
            return res.status(400).json({ code: 400, message: '分类类型仅支持 article/image/resource' })
        }

        const normalizedName = name.trim()
        const existing = await subsetModel.findSubsetByNameAndClassify(normalizedName, classify)
        if (existing && existing.status === 1) {
            return res.status(409).json({ code: 409, message: '同类型下已存在同名分类' })
        }

        if (existing && existing.status === 0) {
            await subsetModel.reviveSubset(existing.id, {
                sort: Number.isFinite(Number(sort)) ? Number(sort) : 0
            })
            return res.status(201).json({
                code: 200,
                message: '分类创建成功',
                data: { subsetId: existing.id }
            })
        }

        const result = await subsetModel.insertSubset({
            name: normalizedName,
            classify,
            sort: Number.isFinite(Number(sort)) ? Number(sort) : 0
        })

        res.status(201).json({
            code: 200,
            message: '分类创建成功',
            data: { subsetId: result.subsetId }
        })
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ code: 409, message: '同类型下已存在同名分类' })
        }
        res.status(500).json({ code: 500, message: '分类创建失败：' + err.message })
    }
}

async function updateSubset(req, res) {
    try {
        const { id } = req.params
        const { name, sort } = req.body

        if (!canManageSubsets(req.user.userType)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以修改分类' })
        }
        if (!id || isNaN(id)) {
            return res.status(400).json({ code: 400, message: '请传入有效的分类ID' })
        }
        if (name === undefined && sort === undefined) {
            return res.status(400).json({ code: 400, message: '请传入至少一个更新字段' })
        }
        if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
            return res.status(400).json({ code: 400, message: '分类名称不能为空' })
        }
        if (name !== undefined && name.trim().length > 50) {
            return res.status(400).json({ code: 400, message: '分类名称不能超过50字' })
        }

        const subset = await subsetModel.findSubsetById(id)
        if (!subset || subset.status !== 1) {
            return res.status(404).json({ code: 404, message: '分类不存在' })
        }

        const normalizedName = name !== undefined ? name.trim() : undefined
        if (normalizedName && normalizedName !== subset.subset_name) {
            const existing = await subsetModel.findSubsetByNameAndClassify(
                normalizedName,
                subset.classify
            )
            if (existing && existing.status === 1) {
                return res.status(409).json({ code: 409, message: '同类型下已存在同名分类' })
            }
            if (existing && existing.status === 0) {
                await subsetModel.removeInactiveDuplicates(normalizedName, subset.classify)
            }
        }

        await subsetModel.updateSubset(id, {
            name: normalizedName,
            sort: sort !== undefined ? (Number.isFinite(Number(sort)) ? Number(sort) : 0) : undefined
        })

        res.json({ code: 200, message: '分类更新成功' })
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ code: 409, message: '同类型下已存在同名分类' })
        }
        res.status(500).json({ code: 500, message: '分类更新失败：' + err.message })
    }
}

async function deleteSubset(req, res) {
    try {
        const { id } = req.params

        if (!canManageSubsets(req.user.userType)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以删除分类' })
        }
        if (!id || isNaN(id)) {
            return res.status(400).json({ code: 400, message: '请传入有效的分类ID' })
        }

        const subset = await subsetModel.findSubsetById(id)
        if (!subset || subset.status !== 1) {
            return res.status(404).json({ code: 404, message: '分类不存在' })
        }

        const articleCount = await subsetModel.countArticlesBySubset(id)
        if (articleCount > 0) {
            return res.status(400).json({
                code: 400,
                message: `该分类下仍有 ${articleCount} 篇文章，请先移动或删除相关文章`
            })
        }

        const affectedRows = await subsetModel.softDeleteSubset(id)
        if (affectedRows === 0) {
            return res.status(404).json({ code: 404, message: '分类不存在' })
        }

        res.json({ code: 200, message: '分类删除成功' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '分类删除失败：' + err.message })
    }
}

module.exports = { getSubsets, createSubset, updateSubset, deleteSubset }
