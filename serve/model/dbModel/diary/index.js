const { query } = require('../../db/dbnew')

/**
 * 分页查询日记（可按标题/内容关键词搜索，可按天气名称筛选）
 * @param {Object} options - { keyword, weather, pageSize, offset, sort }
 * @returns {Promise<Object>} { list, total }
 */
async function getDiariesByPage({ keyword, weather, pageSize, offset, sort }) {
    let whereSql = 'WHERE d.status = 1'
    const whereParams = []

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
        `SELECT d.id, d.title, d.content, d.picture, d.weather_id, w.weather_name, d.mood,
                d.views, d.likes, d.comments, d.created_at
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
 * @param {Object} options - { keyword }
 * @returns {Promise<{facet: Array<{weatherName: string, count: number}>, total: number}>}
 */
async function countDiariesByWeather({ keyword } = {}) {
    let whereSql = 'WHERE d.status = 1 AND w.weather_name IS NOT NULL'
    // 总数口径不排除未记天气的随笔：LEFT JOIN 保证这部分被计入
    let totalWhereSql = 'WHERE d.status = 1'
    const whereParams = []

    if (keyword) {
        whereSql += ' AND (d.title LIKE ? OR d.content LIKE ?)'
        totalWhereSql += ' AND (d.title LIKE ? OR d.content LIKE ?)'
        const searchTerm = `%${keyword}%`
        whereParams.push(searchTerm, searchTerm)
    }

    const [rows, totalRows] = await Promise.all([
        query(
        `SELECT w.weather_name AS weatherName, COUNT(*) AS count
         FROM diary d
         INNER JOIN weather w ON d.weather_id = w.id
         ${whereSql}
         GROUP BY w.weather_name
         ORDER BY count DESC, w.weather_name`,
        whereParams
        ),
        query(
            `SELECT COUNT(*) AS total
             FROM diary d
             LEFT JOIN weather w ON d.weather_id = w.id
             ${totalWhereSql}`,
            whereParams
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
async function insertDiary({ title, content, picture, weatherId }) {
    const result = await query(
        `INSERT INTO diary (title, content, picture, weather_id, mood, created_at)
         VALUES (?, ?, ?, ?, 'calm', CURDATE())`,
        [title, content, picture, weatherId]
    )
    return { diaryId: result.insertId }
}

/**
 * 按 ID 查询日记（仅正常状态）
 */
async function findDiaryById(id) {
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
async function updateDiary({ id, title, content, picture, weatherId }) {
    const result = await query(
        `UPDATE diary SET title = ?, content = ?, picture = ?, weather_id = ? WHERE id = ? AND status = 1`,
        [title, content, picture, weatherId, id]
    )
    return { affectedRows: result.affectedRows }
}

/**
 * 删除日记（逻辑删除）
 */
async function deleteDiary(id) {
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
