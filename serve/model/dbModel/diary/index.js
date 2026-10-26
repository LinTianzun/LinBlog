const { query } = require('../../db/dbnew')

/**
 * 分页查询日记（可按标题/内容关键词搜索）
 * @param {Object} options - { keyword, pageSize, offset }
 * @returns {Promise<Object>} { list, total }
 */
async function getDiariesByPage({ keyword, pageSize, offset, sort }) {
    let whereSql = 'WHERE d.status = 1'
    const whereParams = []

    if (keyword) {
        whereSql += ' AND (d.title LIKE ? OR d.content LIKE ?)'
        const searchTerm = `%${keyword}%`
        whereParams.push(searchTerm, searchTerm)
    }

    // sort=hot 按浏览量倒序（热度），默认按记录日期倒序
    const orderBySql = sort === 'hot'
        ? 'd.views DESC, d.created_at DESC, d.id DESC'
        : 'd.created_at DESC, d.id DESC'

    const totalRows = await query(
        `SELECT COUNT(*) AS total FROM diary d ${whereSql}`,
        whereParams
    )

    const list = await query(
        `SELECT d.id, d.title, d.content, d.picture, d.weather_id, w.weather_name, d.mood, d.views, d.created_at
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
    findWeatherByName,
    insertDiary,
    findDiaryById,
    updateDiary,
    deleteDiary
}
