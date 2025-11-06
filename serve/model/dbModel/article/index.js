const { query } = require('../../db/dbnew')

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
        label = '', introduce = '', cover = ''
    } = articleInfo
    const sql = `
        INSERT INTO article (
            title, subset_id, classify, label, introduce, 
            content, cover, state, published_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', NULL)
    `
    const result = await query(sql, [
        title, subsetId, classify, label, introduce, content, cover
    ])
    return { articleId: result.insertId }
}

/**
 * 分页查询文章（支持状态、分类筛选+权限控制）
 * @param {Object} params - 查询参数
 * @returns {Promise<Object>} 分页文章数据
 */
async function findArticlesByPage(params) {
    const { page, pageSize, offset, state, classify, subsetId, userId, userType } = params
    let whereClause = 'a.state != ?'  //  排除已删除文章
    const whereParams = ['deleted']

    //  权限控制 普通用户只能查自己的文章
    if (userType === 'normal') {
        whereClause += ' AND a.user_id = ?'
        whereParams.push(userId)
    }

    //  筛选条件：状态
    if (state && ['draft', 'published', 'rejected'].includes(state)) {
        whereClause += 'AND a.state = ?'
        whereParams.push(state)
    }

    //  筛选条件：内容类型
    if (classify && ['article', 'image'].includes(classify)) {
        whereClause += ' AND a.classify = ?'
        whereParams.push(classify)
    }

    //  筛选条件：所属分类
    if (subsetId && !isNaN(subsetId)) {
        whereClause += 'AND a.subset_id = ?'
        whereParams.push(subsetId)
    }

    // 查询当前页文章（关联分类表获取分类名称）
    const listSql = `
        SELECT 
            a.id,
            a.title,
            a.subset_id AS subsetId,
            s.subset_name AS subsetName,
            a.classify,
            a.label,
            a.introduce,
            a.cover,
            a.views,
            a.likes,
            a.comments,
            a.state,
            a.created_at AS createdAt,
            a.updated_at AS updatedAt,
            a.published_at AS publishedAt
        FROM article a
        LEFT JOIN subset s ON a.subset_id = s.id
        WHERE ${whereClause}
        ORDER BY a.created_at DESC
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
 * 根据ID查询文章详情
 * @param {number} articleId - 文章ID
 * @param {number} userId - 当前登录用户ID
 * @param {string} userType - 当前登录用户类型
 * @returns {Promise<Object|null>} 文章详情
 */
async function findAtricleById(articleId, userId, userType) {
    let whereClause = 'a.id = ? AND a.state != ?' // 排除已删除
    const whereParams = [articleId, 'deleted']

    //  普通用户只能查自己的或已发布的文章
    if (userType === 'normal') {
        whereClause += ' AND (a.user_id = ? OR a.state = ?)'
        whereParams.push(userId, 'published')
    }

    const sql = `
        SELECT 
            a.id,
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
            a.state,
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
 * 编辑更新文章（适配真实字段，支持部分更新）
 * @param {number} articleId - 文章ID
 * @param {Object} updateData - 待更新字段
 * @param {number} userId - 当前登录用户ID
 * @param {string} userType - 当前登录用户类型
 * @returns {Promise<number>} 影响行数
 */
async function updateArticle(articleId, updateData, userId, userType) {
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

    const updateFields = Object.entries(updateData)
        .filter(([_, value]) => value !== undefined && value !== null)
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
    if (userType === 'normal') {
        whereClause += ' AND user_id = ?'
        whereParams.push(userId) // 条件参数：追加用户ID
    }

    // 发布时自动填充 published_at
    let publishAtSql = ''
    if (updateData.state === 'published' && !updateFields.includes('published_at')) {
        publishAtSql = ', published_at = NOW()'
    } else if (updateData.state === 'rejected' && !updateFields.includes('published_at')) {
        publishAtSql = ', published_at = NULL' // 驳回时清空发布时间
    }

    // 最终 SQL：SET 子句在前，WHERE 子句在后
    const sql = `
        UPDATE article 
        SET ${setClause}, updated_at = NOW() ${publishAtSql}
        WHERE ${whereClause}
    `

    // 关键修复：参数顺序 = SET参数 + WHERE参数（和 SQL 中的 ? 顺序完全对应）
    const result = await query(sql, [...setParams, ...whereParams])
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
    let whereClause = 'id = ? AND state != ?'
    const whereParams = [articleId, 'deleted']

    if (userType === 'normal') {
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
 * 修改文章状态（支持draft/published/rejected）
 * @param {number} articleId - 文章ID
 * @param {string} state - 目标状态（必须传，函数参数不能漏）
 * @param {number} userId - 当前登录用户ID
 * @param {string} userType - 当前登录用户类型
 * @returns {Promise<number>} 影响行数
 */
async function updateArticleStatus(articleId, state, userId, userType) {
    //  状态合法性校验（适配数据库enum）
    if (!['draft', 'published', 'rejected'].includes(state)) {
        console.warn(`[DB] 无效状态值：${state}`);
        return 0;
    }

    //  WHERE子句：单表也建议加表别名（避免潜在歧义）
    let whereClause = 'article.id = ? AND article.state != ?';
    const whereParams = [articleId, 'deleted'];

    // 权限控制：普通用户只能修改自己的文章
    if (userType === 'normal') {
        whereClause += ' AND article.user_id = ?';
        whereParams.push(userId);
    }

    //  发布/驳回时处理published_at
    let publishAtSql = '';
    if (state === 'published') {
        publishAtSql = ', article.published_at = NOW()';
    } else if (state === 'rejected') {
        publishAtSql = ', article.published_at = NULL';
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
    findAtricleById,
    updateArticle,
    deleteArticle,
    updateArticleStatus,
    insertArticle
}