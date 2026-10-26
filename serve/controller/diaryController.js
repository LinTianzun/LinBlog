const diaryModel = require('../model/dbModel/diary/index')
const { formatPaginationParams } = require('../utils/paginationUtil')
const { writeSystemLog } = require('../utils/logHelper')

/**
 * 将图片字段解析为数组（数据库以逗号分隔存储）
 */
function parsePictures(picture) {
    if (!picture || typeof picture !== 'string') return []
    return picture
        .split(',')
        .map(url => url.trim())
        .filter(Boolean)
}

/**
 * 日记分页查询（支持标题/内容关键词搜索）
 */
async function getDiaries(req, res) {
    try {
        const params = formatPaginationParams(req.query, {
            defaultPageSize: 6,
            maxPageSize: 50
        })
        if (!params.success) {
            return res.status(400).json({ code: 400, message: params.errorMsg })
        }

        const { page, pageSize, offset } = params.data
        const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
        const sort = req.query.sort === 'hot' ? 'hot' : 'latest'

        const { list, total } = await diaryModel.getDiariesByPage({ keyword, pageSize, offset, sort })

        res.json({
            code: 200,
            message: '获取日记列表成功',
            data: {
                total,
                page,
                pageSize,
                totalPage: Math.ceil(total / pageSize),
                list: list.map(item => ({
                    id: item.id,
                    title: item.title,
                    content: item.content,
                    picture: parsePictures(item.picture),
                    weatherId: item.weather_id,
                    weatherName: item.weather_name,
                    views: Number(item.views || 0),
                    createdAt: item.created_at
                }))
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '获取日记列表失败：' + err.message })
    }
}

/**
 * 校验并归一化日记表单字段（新建/编辑共用）
 * @returns {Object} { error: 响应对象 } 或 { data: { title, content, picture, weatherId } }
 */
async function normalizeDiaryPayload(body) {
    const { title, content, picture, weatherName } = body

    if (typeof title !== 'string' || !title.trim()) {
        return { error: { code: 400, message: '日记标题不能为空' } }
    }
    if (typeof content !== 'string' || !content.trim()) {
        return { error: { code: 400, message: '日记内容不能为空' } }
    }

    const normalizedTitle = title.trim()
    const normalizedContent = content.trim()
    if (normalizedTitle.length > 100) {
        return { error: { code: 400, message: '日记标题不能超过100字' } }
    }
    if (normalizedContent.length > 1600) {
        return { error: { code: 400, message: '日记内容不能超过1600字' } }
    }

    // 天气按名称查询，避免前端图标序号与数据库自增 ID 不一致
    let weatherId = null
    if (typeof weatherName === 'string' && weatherName.trim()) {
        const rows = await diaryModel.findWeatherByName(weatherName.trim())
        if (!rows) {
            return { error: { code: 400, message: '天气类型不存在' } }
        }
        weatherId = rows.id
    }

    // picture 支持数组或逗号分隔字符串，最多6张（两种形式统一校验）
    let pictureField = null
    if (Array.isArray(picture) || typeof picture === 'string') {
        const urls = (Array.isArray(picture) ? picture : String(picture).split(','))
            .map(url => String(url).trim())
            .filter(Boolean)
        if (urls.length > 6) {
            return { error: { code: 400, message: '图片最多6张' } }
        }
        pictureField = urls.length > 0 ? urls.join(',') : null
        if (pictureField && pictureField.length > 2000) {
            return { error: { code: 400, message: '图片地址总长度超出限制' } }
        }
    }

    return {
        data: {
            title: normalizedTitle,
            content: normalizedContent,
            picture: pictureField,
            weatherId
        }
    }
}

/**
 * 新建日记
 */
async function createDiary(req, res) {
    try {
        const normalized = await normalizeDiaryPayload(req.body)
        if (normalized.error) {
            return res.status(normalized.error.code).json({ code: normalized.error.code, message: normalized.error.message })
        }

        const result = await diaryModel.insertDiary(normalized.data)

        writeSystemLog({
            userId: req.user?.userId ?? null,
            action: 'create',
            module: 'diary',
            targetType: 'diary',
            targetId: result.diaryId,
            detail: `创建日记「${normalized.data.title}」`,
            ip: req.ip || null,
        })

        res.status(201).json({
            code: 200,
            message: '日记创建成功',
            data: { diaryId: result.diaryId }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '日记创建失败：' + err.message })
    }
}

/**
 * 删除日记（逻辑删除）
 */
async function deleteDiary(req, res) {
    try {
        const diaryId = Number(req.params.id)
        if (!Number.isSafeInteger(diaryId) || diaryId <= 0) {
            return res.status(400).json({ code: 400, message: '日记ID必须是有效数字' })
        }

        const diary = await diaryModel.findDiaryById(diaryId)
        if (!diary) {
            return res.status(404).json({ code: 404, message: '日记不存在或已删除' })
        }

        await diaryModel.deleteDiary(diaryId)

        writeSystemLog({
            userId: req.user?.userId ?? null,
            action: 'delete',
            module: 'diary',
            targetType: 'diary',
            targetId: diaryId,
            detail: `删除日记「${diary.title}」`,
            ip: req.ip || null,
        })

        res.json({ code: 200, message: '日记删除成功' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '日记删除失败：' + err.message })
    }
}

/**
 * 编辑日记（标题/内容/图片/天气全量更新）
 */
async function updateDiary(req, res) {
    try {
        const diaryId = Number(req.params.id)
        if (!Number.isSafeInteger(diaryId) || diaryId <= 0) {
            return res.status(400).json({ code: 400, message: '日记ID必须是有效数字' })
        }

        const diary = await diaryModel.findDiaryById(diaryId)
        if (!diary) {
            return res.status(404).json({ code: 404, message: '日记不存在或已删除' })
        }

        const normalized = await normalizeDiaryPayload(req.body)
        if (normalized.error) {
            return res.status(normalized.error.code).json({ code: normalized.error.code, message: normalized.error.message })
        }

        await diaryModel.updateDiary({ id: diaryId, ...normalized.data })

        writeSystemLog({
            userId: req.user?.userId ?? null,
            action: 'update',
            module: 'diary',
            targetType: 'diary',
            targetId: diaryId,
            detail: `编辑日记「${normalized.data.title}」`,
            ip: req.ip || null,
        })

        res.json({ code: 200, message: '日记更新成功' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '日记更新失败：' + err.message })
    }
}

module.exports = { getDiaries, createDiary, updateDiary, deleteDiary }
