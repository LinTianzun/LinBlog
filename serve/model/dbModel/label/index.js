const { query } = require('../../db/dbnew')

const MAX_LABEL_LENGTH = 30

function normalizeLabelNames(input) {
    const raw = Array.isArray(input) ? input : String(input || '').split(',')
    const names = []
    for (const item of raw) {
        const name = String(item || '').trim()
        if (name && !names.includes(name)) {
            names.push(name)
        }
    }
    return names
}

async function findLabels() {
    return query(`
        SELECT l.id,
               l.label_name AS name,
               l.created_at AS moment,
               (SELECT COUNT(*) FROM article a
                 WHERE a.state != 'deleted'
                   AND a.classify = 'article'
                   AND FIND_IN_SET(l.label_name, a.label)) AS value
        FROM label l
        ORDER BY value DESC, l.id ASC
    `)
}

async function findLabelByName(name) {
    const rows = await query(
        'SELECT id FROM label WHERE label_name = ? LIMIT 1',
        [name]
    )
    return rows[0] || null
}

async function insertLabel(name) {
    const result = await query(
        'INSERT INTO label (label_name) VALUES (?)',
        [name]
    )
    return { labelId: result.insertId }
}

async function deleteLabel(id) {
    const result = await query('DELETE FROM label WHERE id = ?', [id])
    return result.affectedRows
}

async function countArticlesByLabelName(name) {
    const rows = await query(
        `SELECT COUNT(*) AS total FROM article
         WHERE state != 'deleted' AND classify = 'article' AND FIND_IN_SET(?, label)`,
        [name]
    )
    return rows[0]?.total ?? 0
}

/**
 * 确保文章使用的标签都存在于字典表（自动补录新标签）
 * @param {string|string[]} labelInput - 逗号分隔字符串或数组
 * @returns {Promise<string[]>} 实际入库的标签名列表
 */
async function ensureLabels(labelInput) {
    const names = normalizeLabelNames(labelInput)
        .filter(name => name.length <= MAX_LABEL_LENGTH)

    for (const name of names) {
        const existing = await module.exports.findLabelByName(name)
        if (!existing) {
            await module.exports.insertLabel(name)
        }
    }
    return names
}

module.exports = {
    MAX_LABEL_LENGTH,
    normalizeLabelNames,
    findLabels,
    findLabelByName,
    insertLabel,
    deleteLabel,
    countArticlesByLabelName,
    ensureLabels
}
