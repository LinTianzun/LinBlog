const { query } = require('../../db/dbnew')
const labelModel = require('../label/index')

function normalizeAccess(access) {
    if (access && typeof access === 'object') {
        return {
            viewAll: Boolean(access.viewAll),
            viewOwn: Boolean(access.viewOwn),
            manageAll: Boolean(access.manageAll),
            manageOwn: Boolean(access.manageOwn),
            publish: Boolean(access.publish)
        }
    }

    const isAdmin = access === 'admin' || access === 'editor'
    return {
        viewAll: isAdmin,
        viewOwn: isAdmin || access === 'normal',
        manageAll: isAdmin,
        manageOwn: isAdmin || access === 'normal',
        publish: isAdmin
    }
}

/**
 * 校验文章是否存在（仅查ID和状态）
 * @param {number} articleId  - 文章ID
 * @returns 
 */
async function findAtricleStateById(articleId) {
    const sql = 'SELECT id, state FROM article WHERE id = ?'
    return query(sql, [articleId])
}

/**
 * 新增文章（适配真实表字段）
 * @param {Object} articleInfo - 文章信息
 * @returns {Promise<Object>} 新增文章ID
 */
async function insertArticle(articleInfo) {
    const {
        title, content, classify, subsetId = null,
        label = '', introduce = '', cover = '', userId
    } = articleInfo
    const sql = `
        INSERT INTO article (
            user_id, title, subset_id, classify, label, introduce,
            content, cover, state, published_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL)
    `
    const result = await query(sql, [
        userId, title, subsetId, classify, label, introduce, content, cover
    ])
    //  文章使用的标签同步进字典表，便于标签管理与筛选
    await labelModel.ensureLabels(label)
    return { articleId: result.insertId }
}

/**
 * 分页查询文章（支持状态、分类筛选+权限控制）
 * @param {Object} params - 查询参数
 * @returns {Promise<Object>} 分页文章数据
 */
async function findArticlesByPage(params) {
    const {
        page, pageSize, offset, state, classify, subsetId, withContent,
        uncategorized, label, keyword, userId, userType, userAccess, sort
    } = params
    const access = normalizeAccess(userAccess || userType)
    let whereClause = 'a.state != ?'  //  排除已删除文章
    const whereParams = ['deleted']

    //  权限控制 普通用户只能查自己的文章
    if (!access.viewAll && access.viewOwn) {
        whereClause += ' AND a.user_id = ?'
        whereParams.push(userId)
    } else if (!access.viewAll && !access.viewOwn) {
        whereClause += ' AND a.state = ?'
        whereParams.push('published')
    }

    //  筛选条件：状态
    if (state && ['draft', 'published', 'rejected'].includes(state)) {
        whereClause += ' AND a.state = ?'
        whereParams.push(state)
    }

    //  筛选条件：内容类型
    if (classify && ['article', 'image'].includes(classify)) {
        whereClause += ' AND a.classify = ?'
        whereParams.push(classify)
    }

    //  筛选条件：所属分类
    if (subsetId && !isNaN(subsetId)) {
        whereClause += ' AND a.subset_id = ?'
        whereParams.push(subsetId)
    }

    //  筛选条件：未分类
    if (uncategorized) {
        whereClause += ' AND a.subset_id IS NULL'
    }

    //  筛选条件：标签（FIND_IN_SET 精确匹配逗号分隔中的某一项）
    if (label) {
        whereClause += ' AND FIND_IN_SET(?, a.label)'
        whereParams.push(label)
    }

    //  筛选条件：标题、简介、标签或正文关键词
    if (keyword) {
        whereClause += ` AND (
            a.title LIKE ?
            OR a.introduce LIKE ?
            OR a.label LIKE ?
            OR a.content LIKE ?
        )`
        const searchTerm = `%${keyword}%`
        whereParams.push(searchTerm, searchTerm, searchTerm, searchTerm)
    }

    // 排序：sort=hot 按浏览量倒序（热度），默认按创建时间倒序
    const orderBySql = sort === 'hot'
        ? 'a.views DESC, a.created_at DESC'
        : 'a.created_at DESC, a.id DESC'

    // 查询当前页文章（关联分类表获取分类名称）
    const listSql = `
        SELECT 
            a.id,
            a.user_id AS userId,
            a.title,
            a.subset_id AS subsetId,
            s.subset_name AS subsetName,
            a.classify,
            a.label,
            a.introduce,
            ${withContent ? 'a.content,' : ''}
            a.cover,
            a.views,
            a.likes,
            a.comments,
            -- 一级评论数：卡片要区分「评论」与「回复」两个口径
            (SELECT COUNT(*) FROM comment c2
              WHERE c2.article_id = a.id AND c2.status = 1 AND c2.parent_id = 0) AS root_comments,
            (SELECT COUNT(*) FROM comment c2
              WHERE c2.article_id = a.id AND c2.status = 1 AND c2.parent_id > 0) AS reply_comments,
            a.state,
            (a.draft_content IS NOT NULL OR a.draft_payload IS NOT NULL) AS hasUnpublishedChanges,
            a.ai_assisted AS aiAssisted,
            a.ai_assist_features AS aiAssistFeatures,
            a.ai_assisted_at AS aiAssistedAt,
            a.scheduled_at AS scheduledAt,
            a.created_at AS createdAt,
            a.updated_at AS updatedAt,
            a.published_at AS publishedAt
        FROM article a
        LEFT JOIN subset s ON a.subset_id = s.id
        WHERE ${whereClause}
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?
    `
    const list = await query(listSql, [...whereParams, pageSize, offset])

    //  查询总条数
    const totalSql = `
        SELECT COUNT(*) AS total 
        FROM article a
        LEFT JOIN subset s ON a.subset_id = s.id
        WHERE ${whereClause}
    `
    const [totalResult] = await query(totalSql, whereParams)
    const total = totalResult.total
    return {
        list,
        total,
        page,
        pageSize,
        totalPage: Math.ceil(total / pageSize)
    }
}

/**
 * 统计文章状态分布（权限规则与列表查询一致）
 * @param {Object} params - 统计参数
 * @returns {Promise<Object>} 各状态数量汇总
 */
async function countArticlesByState(params) {
    const { classify, userId, userType, userAccess } = params
    const access = normalizeAccess(userAccess || userType)
    let whereClause = 'a.state != ?'  //  排除已删除文章
    const whereParams = ['deleted']

    if (!access.viewAll && access.viewOwn) {
        whereClause += ' AND a.user_id = ?'
        whereParams.push(userId)
    } else if (!access.viewAll && !access.viewOwn) {
        // 既看不了全站也看不了自己的（如游客）：不允许回退成「统计全站已发布」，
        // 否则后台总览会把全站内容数量泄漏给无权限账号。显式排除所有行。
        whereClause += ' AND 1 = 0'
    }

    if (classify && ['article', 'image'].includes(classify)) {
        whereClause += ' AND a.classify = ?'
        whereParams.push(classify)
    }

    const rows = await query(
        `SELECT a.state, COUNT(*) AS total FROM article a WHERE ${whereClause} GROUP BY a.state`,
        whereParams
    )
    const summary = { all: 0, published: 0, draft: 0, rejected: 0 }
    for (const row of rows) {
        if (row.state in summary) {
            summary[row.state] = Number(row.total)
            summary.all += Number(row.total)
        }
    }

    const [uncategorizedRow] = await query(
        `SELECT COUNT(*) AS total FROM article a WHERE ${whereClause} AND a.subset_id IS NULL`,
        whereParams
    )
    summary.uncategorized = Number(uncategorizedRow.total)
    return summary
}

/**
 * 根据ID查询文章详情
 * @param {number} articleId - 文章ID
 * @param {number} userId - 当前登录用户ID
 * @param {string} userType - 当前登录用户类型
 * @returns {Promise<Object|null>} 文章详情
 */
async function findAtricleById(articleId, userId, userType) {
    const access = normalizeAccess(userType)
    let whereClause = 'a.id = ? AND a.state != ?' // 排除已删除
    const whereParams = [articleId, 'deleted']

    //  普通用户只能查自己的或已发布的文章
    if (!access.viewAll && access.viewOwn) {
        whereClause += ' AND (a.user_id = ? OR a.state = ?)'
        whereParams.push(userId, 'published')
    } else if (!access.viewAll && !access.viewOwn) {
        whereClause += ' AND a.state = ?'
        whereParams.push('published')
    }

    const sql = `
        SELECT 
            a.id,
            a.user_id AS userId,
            a.title,
            a.subset_id AS subsetId,
            s.subset_name AS subsetName,
            a.classify,
            a.label,
            a.introduce,
            a.content,
            a.cover,
            a.views,
            a.likes,
            a.comments,
            -- 一级评论数与回复数：后台详情/卡片要区分「评论」与「回复」两个口径
            (SELECT COUNT(*) FROM comment c2
              WHERE c2.article_id = a.id AND c2.status = 1 AND c2.parent_id = 0) AS root_comments,
            (SELECT COUNT(*) FROM comment c2
              WHERE c2.article_id = a.id AND c2.status = 1 AND c2.parent_id > 0) AS reply_comments,
            a.state,
            (a.draft_content IS NOT NULL OR a.draft_payload IS NOT NULL) AS hasUnpublishedChanges,
            a.ai_assisted AS aiAssisted,
            a.ai_assist_features AS aiAssistFeatures,
            a.ai_assisted_at AS aiAssistedAt,
            a.scheduled_at AS scheduledAt,
            a.created_at AS createdAt,
            a.updated_at AS updatedAt,
            a.published_at AS publishedAt
        FROM article a
        LEFT JOIN subset s ON a.subset_id = s.id
        WHERE ${whereClause}
    `

    const result = await query(sql, whereParams)
    return result.length > 0 ? result[0] : null
}

/**
 * 站点地图与 RSS 使用的已发布内容摘要。
 */
async function listPublishedContentForFeed(limit = 5000) {
    const safeLimit = Math.min(Math.max(Number(limit) || 5000, 1), 5000)
    return query(
        `SELECT a.id, a.title, a.introduce, a.cover, a.classify,
                a.published_at AS publishedAt, a.updated_at AS updatedAt,
                a.created_at AS createdAt
         FROM article a
         WHERE a.state = 'published'
         ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC
         LIMIT ?`,
        [safeLimit]
    )
}

/**
 * 门户 AI 问答的语料检索：在已发布内容里按关键词找候选片段。
 * 只取公开内容，草稿与随笔工作稿不会出现在回答依据里。
 */
async function searchPublishedContentForAsk(keyword, limit = 6) {
    const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 10)
    const term = String(keyword || '').trim()
    if (!term) return []

    const like = `%${term}%`
    const rows = await query(
        `SELECT id, title, introduce, content, classify, subset_id AS subsetId,
                published_at AS publishedAt
         FROM article
         WHERE state = 'published'
           AND (title LIKE ? OR introduce LIKE ? OR content LIKE ? OR label LIKE ?)
         ORDER BY
            (CASE WHEN title LIKE ? THEN 0 ELSE 1 END),
            (CASE WHEN introduce LIKE ? THEN 0 ELSE 1 END),
            COALESCE(published_at, created_at) DESC
         LIMIT ?`,
        [like, like, like, like, like, like, safeLimit]
    )

    return (rows || []).map(row => ({
        id: Number(row.id),
        title: String(row.title || ''),
        introduce: String(row.introduce || ''),
        content: String(row.content || ''),
        classify: String(row.classify || 'article'),
        subsetId: row.subsetId ? Number(row.subsetId) : null,
        publishedAt: row.publishedAt
    }))
}

/**
 * 语义搜索：按一组关键词在已发布内容里做加权匹配。
 * 标题命中最重，其次简介、标签，正文命中权重最低；
 * 综合得分越高排得越靠前，同分时按发布时间倒序。
 */
async function searchPublishedContentByTerms(terms, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50)
    const list = (Array.isArray(terms) ? terms : [])
        .map(term => String(term || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    if (list.length === 0) return []

    const scoreParts = []
    const scoreParams = []
    for (const term of list) {
        scoreParts.push(
            '(CASE WHEN a.title LIKE ? THEN 8 ELSE 0 END)',
            '(CASE WHEN a.introduce LIKE ? THEN 4 ELSE 0 END)',
            '(CASE WHEN a.label LIKE ? THEN 3 ELSE 0 END)',
            '(CASE WHEN a.content LIKE ? THEN 1 ELSE 0 END)'
        )
        scoreParams.push(term, term, term, term)
    }

    const whereClause = list
        .map(() => '(a.title LIKE ? OR a.introduce LIKE ? OR a.label LIKE ? OR a.content LIKE ?)')
        .join(' OR ')
    const whereParams = list.flatMap(term => [term, term, term, term])

    const rows = await query(
        `SELECT id, title, introduce, label, cover, classify, subset_id AS subsetId,
                views, likes, comments,
                published_at AS publishedAt, created_at AS createdAt,
                ${scoreParts.join(' + ')} AS score
         FROM article a
         WHERE a.state = 'published' AND (${whereClause})
         ORDER BY score DESC, COALESCE(a.published_at, a.created_at) DESC, a.id DESC
         LIMIT ?`,
        [...scoreParams, ...whereParams, safeLimit]
    )

    return (rows || []).map(row => ({
        id: Number(row.id),
        title: String(row.title || ''),
        introduce: String(row.introduce || ''),
        label: String(row.label || ''),
        cover: String(row.cover || ''),
        classify: String(row.classify || 'article'),
        subsetId: row.subsetId ? Number(row.subsetId) : null,
        views: Number(row.views) || 0,
        likes: Number(row.likes) || 0,
        comments: Number(row.comments) || 0,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        score: Number(row.score) || 0
    }))
}

/**
 * 更新前判断文章是否存在及当前用户是否有修改权限。
 * 避免把“字段值未变化”产生的 0 影响行数误判为无权限。
 */
async function findArticleMutationAccess(articleId, userId, userType, action = 'update') {
    const access = normalizeAccess(userType)
    const rows = await query(
        'SELECT id, user_id, state, classify FROM article WHERE id = ? LIMIT 1',
        [articleId]
    )

    if (rows.length === 0 || rows[0].state === 'deleted') {
        return { exists: false, allowed: false, article: null }
    }

    const article = rows[0]
    let allowed = access.manageAll

    if (!allowed && access.manageOwn) {
        const editableStates = action === 'status' ? ['rejected'] : ['draft', 'rejected']
        allowed = Number(article.user_id) === Number(userId) &&
            (access.publish || editableStates.includes(article.state))
    }

    return { exists: true, allowed, article }
}

/**
 * 编辑更新文章（适配真实字段，支持部分更新）
 * @param {number} articleId - 文章ID
 * @param {Object} updateData - 待更新字段
 * @param {number} userId - 当前登录用户ID
 * @param {string} userType - 当前登录用户类型
 * @returns {Promise<number>} 影响行数
 */
async function updateArticle(articleId, updateData, userId, userType) {
    const access = normalizeAccess(userType)
    if (!access.manageAll && !access.manageOwn) return 0

    // 权限在模型层再次兜底：普通用户不能设置 published/rejected。
    if (!access.manageAll && !access.publish && updateData.state !== undefined && updateData.state !== 'draft') return 0

    // 筛选非空的更新字段，映射前端驼峰→数据库下划线
    const fieldMap = {
        subsetId: 'subset_id',
        classify: 'classify',
        label: 'label',
        introduce: 'introduce',
        title: 'title',
        content: 'content',
        cover: 'cover',
        state: 'state'
    }

    const nullableFields = new Set([
        'subset_id',
        'label',
        'introduce',
        'cover'
    ])

    const updateFields = Object.entries(updateData)
        .filter(([key, value]) => {
            if (value === undefined) return false
            if (value === null) return nullableFields.has(fieldMap[key])
            return true
        })
        .map(([key]) => fieldMap[key])
        .filter(key => key) // 过滤无效字段

    if (updateFields.length === 0) return 0

    // 构建 SET 子句（字段=?）
    const setClause = updateFields.map(field => `${field} = ?`).join(', ')
    // 构建 SET 参数（更新字段的值，顺序和 setClause 一致）
    const setParams = updateFields.map(field => {
        const key = Object.keys(fieldMap).find(k => fieldMap[k] === field)
        return updateData[key]
    })

    // 构建 WHERE 子句（条件：ID 有效 + 未删除 + 权限控制）
    let whereClause = 'id = ? AND state != ?'
    const whereParams = [articleId, 'deleted'] // 条件参数：先放 ID 和状态
    // 普通用户：只能更新自己的文章（追加 user_id 条件）
    if (!access.manageAll && access.manageOwn) {
        // 普通用户只能编辑自己的草稿/驳回文章，不能直接修改已发布文章。
        whereClause += ' AND user_id = ?'
        whereParams.push(userId)
        if (!access.publish) {
            whereClause += " AND state IN ('draft', 'rejected')"
        }
    }

    // 发布时自动填充 published_at
    let publishAtSql = ''
    if (updateData.state === 'published' && !updateFields.includes('published_at')) {
        publishAtSql = ', published_at = NOW()'
    } else if (updateData.state === 'rejected' && !updateFields.includes('published_at')) {
        publishAtSql = ', published_at = NULL' // 驳回时清空发布时间
    }

    // 内容已实际发布/驳回/退回草稿时，待发布计划不再有意义：
    // 草稿（draft）是定时发布的正常载体，不能在此清除 scheduled_at。
    if (['published', 'rejected'].includes(updateData.state)) {
        publishAtSql += ', scheduled_at = NULL'
    }

    // 最终 SQL：SET 子句在前，WHERE 子句在后
    const sql = `
        UPDATE article 
        SET ${setClause}, updated_at = NOW() ${publishAtSql}
        WHERE ${whereClause}
    `

    // 关键修复：参数顺序 = SET参数 + WHERE参数（和 SQL 中的 ? 顺序完全对应）
    const result = await query(sql, [...setParams, ...whereParams])
    if (result.affectedRows > 0 && updateData.label !== undefined) {
        //  标签变更时同步字典表
        await labelModel.ensureLabels(updateData.label)
    }
    return result.affectedRows
}

/**
 * 文章删除（逻辑删除：state=deleted）
 * @param {number} articleId - 文章ID
 * @param {number} userId - 当前登录用户ID
 * @param {string} userType - 当前登录用户类型
 * @returns {Promise<number>} 影响行数
 */
async function deleteArticle(articleId, userId, userType) {
    const access = normalizeAccess(userType)
    if (!access.manageAll && !access.manageOwn) return 0

    let whereClause = 'id = ? AND state != ?'
    const whereParams = [articleId, 'deleted']

    if (!access.manageAll && access.manageOwn) {
        whereClause += ' AND user_id = ?'
        whereParams.push(userId)
    }

    const sql = `
        UPDATE article 
        SET state = 'deleted', updated_at = NOW()
        WHERE ${whereClause}
    `

    const result = await query(sql, whereParams)
    return result.affectedRows
}

/**
 * 标记文章经过 AI 辅助，并累计用过的环节。
 * 环节用逗号分隔存储，便于后台列表直接展示「AI 润色 / AI 封面」这类来源。
 */
async function markAiAssisted(articleId, features = []) {
    const list = (Array.isArray(features) ? features : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    if (list.length === 0) return 0

    const rows = await query(
        'SELECT ai_assist_features FROM article WHERE id = ? AND state != ? LIMIT 1',
        [articleId, 'deleted']
    )
    if (!rows || rows.length === 0) return 0

    const existing = String(rows[0].ai_assist_features || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    const merged = [...new Set([...existing, ...list])].slice(0, 8)

    const result = await query(
        'UPDATE article SET ai_assisted = 1, ai_assist_features = ?, ai_assisted_at = NOW() WHERE id = ?',
        [merged.join(','), articleId]
    )
    return result.affectedRows
}

/**
 * 清除文章的 AI 标记：作者手动重写后可以手动摘掉这个标记。
 */
async function clearAiMarker(articleId) {
    const result = await query(
        'UPDATE article SET ai_assisted = 0, ai_assist_features = NULL, ai_assisted_at = NULL WHERE id = ?',
        [articleId]
    )
    return result.affectedRows
}

/**
 * 修改文章状态（支持draft/published/rejected）
 * @param {number} articleId - 文章ID
 * @param {string} state - 目标状态（必须传，函数参数不能漏）
 * @param {number} userId - 当前登录用户ID
 * @param {string} userType - 当前登录用户类型
 * @returns {Promise<number>} 影响行数
 */
async function updateArticleStatus(articleId, state, userId, userType) {
    const access = normalizeAccess(userType)
    if (!access.manageAll && !access.manageOwn) return 0

    // 普通用户只能把被驳回的自己的文章退回草稿。
    if (!access.manageAll && !access.publish && state !== 'draft') return 0

    //  状态合法性校验（适配数据库enum）
    if (!['draft', 'published', 'rejected'].includes(state)) {
        console.warn(`[DB] 无效状态值：${state}`);
        return 0;
    }

    //  WHERE子句：单表也建议加表别名（避免潜在歧义）
    let whereClause = 'article.id = ? AND article.state != ?';
    const whereParams = [articleId, 'deleted'];

    // 权限控制：普通用户只能修改自己的文章
    if (!access.manageAll && access.manageOwn) {
        whereClause += ' AND article.user_id = ?';
        whereParams.push(userId);
        if (!access.publish) {
            whereClause += " AND article.state = 'rejected'";
        }
    }

    //  发布/驳回时处理published_at
    let publishAtSql = '';
    if (state === 'published') {
        publishAtSql = ', article.published_at = NOW()';
    } else if (state === 'rejected') {
        publishAtSql = ', article.published_at = NULL';
    }

    // 状态已落到 published / rejected 时，定时发布计划必须一并清除，
    // 否则内容会继续留在待发布队列并在到点时被重复发布。
    // draft 是定时发布的正常载体，退回草稿不应清除已安排的计划。
    if (['published', 'rejected'].includes(state)) {
        publishAtSql += ', article.scheduled_at = NULL';
    }

    //  SQL语句：所有字段加表别名（article.），避免歧义
    const sql = `
        UPDATE article 
        SET article.state = ?, article.updated_at = NOW() ${publishAtSql}
        WHERE ${whereClause}
    `;

    //  参数绑定：顺序 = state（更新值） + whereParams（条件值）
    const result = await query(sql, [state, ...whereParams]);
    return result.affectedRows;
}

module.exports = {
    findAtricleStateById,
    findArticlesByPage,
    countArticlesByState,
    findAtricleById,
    listPublishedContentForFeed,
    searchPublishedContentForAsk,
    searchPublishedContentByTerms,
    findArticleMutationAccess,
    updateArticle,
    deleteArticle,
    updateArticleStatus,
    markAiAssisted,
    clearAiMarker,
    insertArticle
}
