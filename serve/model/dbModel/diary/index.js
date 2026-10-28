const { query } = require('../../db/dbnew')

/**
 * 分页查询日记（可按标题/内容关键词搜索，可按天气名称筛选）
 * @param {Object} options - { keyword, weather, pageSize, offset, sort, ownerScope }
 *   ownerScope: { userId, userType } —— 管理员/编辑看全站，普通用户只看自己名下
 * @returns {Promise<Object>} { list, total }
 */
// 归属过滤：管理员/编辑看全站；普通用户只看自己名下；其余角色（含游客）看不到
function ownerCondition({ userId, userType }) {
    if (userType === 'admin' || userType === 'editor') return null
    if (userType !== 'normal') return { sql: ' AND 1 = 0', params: [] }
    if (!Number.isSafeInteger(userId) || userId <= 0) return { sql: ' AND 1 = 0', params: [] }
    return { sql: ' AND d.user_id = ?', params: [userId] }
}

async function getDiariesByPage({ keyword, weather, pageSize, offset, sort, ownerScope }) {
    let whereSql = 'WHERE d.status = 1'
    const whereParams = []

    const scoped = ownerScope ? ownerCondition(ownerScope) : null
    if (scoped) {
        whereSql += scoped.sql
        whereParams.push(...scoped.params)
    }

    if (keyword) {
        whereSql += ' AND (d.title LIKE ? OR d.content LIKE ?)'
        const searchTerm = `%${keyword}%`
        whereParams.push(searchTerm, searchTerm)
    }

    // 天气按名称筛选：日记可能没有天气（LEFT JOIN 后为 NULL），这类记录只在「全部」下出现
    if (weather) {
        whereSql += ' AND w.weather_name = ?'
        whereParams.push(weather)
    }

    // sort=hot 按浏览量倒序（热度），默认按记录日期倒序
    const orderBySql = sort === 'hot'
        ? 'd.views DESC, d.created_at DESC, d.id DESC'
        : 'd.created_at DESC, d.id DESC'

    const totalRows = await query(
        `SELECT COUNT(*) AS total
         FROM diary d
         LEFT JOIN weather w ON d.weather_id = w.id
         ${whereSql}`,
        whereParams
    )

    const list = await query(
        `SELECT d.id, d.user_id, d.title, d.content, d.picture, d.weather_id, w.weather_name, d.mood,
                d.views, d.likes, d.comments,
                -- 一级评论数与回复数：后台卡片要区分「评论」与「回复」两个口径
                (SELECT COUNT(*) FROM diary_comment c
                  WHERE c.diary_id = d.id AND c.status = 1 AND c.parent_id = 0) AS root_comments,
                (SELECT COUNT(*) FROM diary_comment c
                  WHERE c.diary_id = d.id AND c.status = 1 AND c.parent_id > 0) AS reply_comments,
                d.created_at
         FROM diary d
         LEFT JOIN weather w ON d.weather_id = w.id
         ${whereSql}
         ORDER BY ${orderBySql}
         LIMIT ? OFFSET ?`,
        [...whereParams, pageSize, offset]
    )

    return { list, total: Number(totalRows[0]?.total || 0) }
}

/**
 * 统计各天气下的日记数量（分面计数）
 * 计数口径跟随列表（排除已删除、保留关键词），但不含天气筛选本身，
 * 这样切换天气时各标签的数量保持恒定，不会像前端按当前页统计那样跳变。
 * 同时回带「不按天气过滤」的总数，供“全部天气”标签展示（含未记天气的随笔）。
 * @param {Object} options - { keyword, ownerScope }
 * @returns {Promise<{facet: Array<{weatherName: string, count: number}>, total: number}>}
 */
async function countDiariesByWeather({ keyword, ownerScope } = {}) {
    let whereSql = 'WHERE d.status = 1 AND w.weather_name IS NOT NULL'
    // 总数口径不排除未记天气的随笔：LEFT JOIN 保证这部分被计入
    let totalWhereSql = 'WHERE d.status = 1'
    const whereParams = []

    const scoped = ownerScope ? ownerCondition(ownerScope) : null
    if (scoped) {
        whereSql += scoped.sql
        totalWhereSql += scoped.sql
        whereParams.push(...scoped.params)
    }
    // 分面与总数共用同一份归属参数，关键词参数再往后追加
    const scopedCount = whereParams.length

    if (keyword) {
        whereSql += ' AND (d.title LIKE ? OR d.content LIKE ?)'
        totalWhereSql += ' AND (d.title LIKE ? OR d.content LIKE ?)'
        const searchTerm = `%${keyword}%`
        whereParams.push(searchTerm, searchTerm)
    }

    const keywordParams = whereParams.slice(scopedCount)
    const facetParams = [...whereParams]
    const countParams = [...whereParams.slice(0, scopedCount), ...keywordParams]

    const [rows, totalRows] = await Promise.all([
        query(
        `SELECT w.weather_name AS weatherName, COUNT(*) AS count
         FROM diary d
         INNER JOIN weather w ON d.weather_id = w.id
         ${whereSql}
         GROUP BY w.weather_name
         ORDER BY count DESC, w.weather_name`,
        facetParams
        ),
        query(
            `SELECT COUNT(*) AS total
             FROM diary d
             LEFT JOIN weather w ON d.weather_id = w.id
             ${totalWhereSql}`,
            countParams
        )
    ])

    return {
        facet: rows.map(row => ({
            weatherName: row.weatherName,
            count: Number(row.count || 0)
        })),
        total: Number(totalRows[0]?.total || 0)
    }
}

/**
 * 按名称查询天气字典
 */
async function findWeatherByName(name) {
    const rows = await query(
        `SELECT id, weather_name FROM weather WHERE weather_name = ?`,
        [name]
    )
    return rows[0] || null
}

/**
 * 新增日记
 * @param {Object} payload - { title, content, picture, weatherId }
 */
async function insertDiary({ title, content, picture, weatherId, userId = null }) {
    const result = await query(
        `INSERT INTO diary (user_id, title, content, picture, weather_id, mood, created_at)
         VALUES (?, ?, ?, ?, ?, 'calm', CURDATE())`,
        [userId, title, content, picture, weatherId]
    )
    return { diaryId: result.insertId }
}

/**
 * 按 ID 查询日记（仅正常状态；传入 ownerScope 时同时校验归属）
 */
async function findDiaryById(id, ownerScope = null) {
    const scoped = ownerScope ? ownerCondition(ownerScope) : null
    if (scoped) {
        const rows = await query(
            `SELECT id, title, content, picture, weather_id, user_id
             FROM diary WHERE id = ? AND status = 1${scoped.sql}`,
            [id, ...scoped.params]
        )
        return rows[0] || null
    }

    const rows = await query(
        `SELECT id, title, content, picture, weather_id FROM diary WHERE id = ? AND status = 1`,
        [id]
    )
    return rows[0] || null
}

/**
 * 更新日记（标题/内容/图片/天气）
 * @param {Object} payload - { id, title, content, picture, weatherId }
 */
async function updateDiary({ id, title, content, picture, weatherId }, ownerScope = null) {
    const scoped = ownerScope ? ownerCondition(ownerScope) : null
    const whereSql = scoped ? ` AND ${scoped.sql.replace(/^ AND /, '')}` : ''
    const result = await query(
        `UPDATE diary SET title = ?, content = ?, picture = ?, weather_id = ?
         WHERE id = ? AND status = 1${whereSql}`,
        [title, content, picture, weatherId, id, ...(scoped ? scoped.params : [])]
    )
    return { affectedRows: result.affectedRows }
}

/**
 * 删除日记（逻辑删除）
 */
async function deleteDiary(id, ownerScope = null) {
    const scoped = ownerScope ? ownerCondition(ownerScope) : null
    if (scoped) {
        await query(
            `UPDATE diary SET status = 0 WHERE id = ?${scoped.sql}`,
            [id, ...scoped.params]
        )
        return
    }
    await query(`UPDATE diary SET status = 0 WHERE id = ?`, [id])
}

module.exports = {
    getDiariesByPage,
    countDiariesByWeather,
    findWeatherByName,
    insertDiary,
    findDiaryById,
    updateDiary,
    deleteDiary
}
