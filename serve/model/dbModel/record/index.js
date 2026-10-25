const { query } = require('../../db/dbnew')

// 写入一条访问记录；字段由中间件解析，游客 user_id 为 NULL
async function createRecord({ userId = null, ip = '', position = null, device = null, browser = null, os = null, path = '/' }) {
    const sql = `
        INSERT INTO record (user_id, ip, position, device, browser, os, path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    return query(sql, [userId, ip, position, device, browser, os, path])
}

// 近 N 天访问量按天聚合（不补空日期，由控制器补全连续日期轴）
async function countRecordsByDay(days) {
    const sql = `
        SELECT DATE_FORMAT(created_at, '%m-%d') AS date, COUNT(*) AS count
        FROM record
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
        GROUP BY date
        ORDER BY MIN(created_at)
    `
    return query(sql, [days])
}

// 近 N 天按字段聚合访问分布（device/browser/os/path/position）
async function countRecordsByField(field, days) {
    const column = ['device', 'browser', 'os', 'path', 'position'].includes(field) ? field : 'device'
    const sql = `
        SELECT ${column} AS label, COUNT(*) AS value
        FROM record
        WHERE ${column} IS NOT NULL
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
        GROUP BY ${column}
        ORDER BY value DESC
    `
    return query(sql, [days])
}

module.exports = {
    createRecord,
    countRecordsByDay,
    countRecordsByField,
}
