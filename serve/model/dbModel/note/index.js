const crypto = require('node:crypto')
const { query, withTransaction } = require('../../db/dbnew')
const {
    excerptMarkdown,
    extractNoteLinks,
    extractNoteTags,
    normalizeLinkTitle,
} = require('../../../utils/noteMarkdown')

const STATE_VALUES = new Set(['draft', 'published'])

function execute(connection, sql, values = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (err, result) => {
            if (err) reject(err)
            else resolve(result)
        })
    })
}

function parseId(value) {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

/**
 * 标题转 slug：中文标题保留拼音不可行，因此用短哈希保证稳定唯一；
 * 英数标题保留可读部分，便于分享链接辨识。
 */
function createSlug(title) {
    const readable = String(title || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    const hash = crypto.createHash('sha1').update(`${title}|${Date.now()}`).digest('hex').slice(0, 8)
    return readable ? `${readable}-${hash}` : `note-${hash}`
}

function normalizeState(value, fallback = 'draft') {
    return STATE_VALUES.has(value) ? value : fallback
}

async function refreshLinks(exec, noteId, markdown) {
    const { titles, ids } = extractNoteLinks(markdown)
    const targetIds = new Set(ids.map(parseId).filter(Boolean))
    if (titles.length > 0) {
        const rows = await exec(
            `SELECT id FROM note WHERE title IN (${titles.map(() => '?').join(', ')})`,
            titles
        )
        rows.forEach(row => targetIds.add(Number(row.id)))
    }
    targetIds.delete(Number(noteId))

    await exec('DELETE FROM note_link WHERE from_note_id = ?', [noteId])
    for (const targetId of targetIds) {
        try {
            await exec(
                'INSERT IGNORE INTO note_link (from_note_id, to_note_id) VALUES (?, ?)',
                [noteId, targetId]
            )
        } catch {
            // 目标笔记可能刚被删除：双链索引允许缺失，不能阻断保存正文
        }
    }
    return [...targetIds]
}

async function findOwnedNote(id, userId) {
    const rows = await query(
        `SELECT n.id, n.title, n.slug, n.content, n.state, n.user_id AS userId,
                n.published_at AS publishedAt, n.created_at AS createdAt, n.updated_at AS updatedAt
           FROM note n WHERE n.id = ? LIMIT 1`,
        [id]
    )
    const note = rows[0]
    if (!note) return null
    // 与文章一致：自己的笔记可编辑，其他人的只允许公开读取
    if (Number(note.userId) !== Number(userId)) return null
    return note
}

async function listNotesForOwner({ userId, page = 1, pageSize = 20, state, keyword } = {}) {
    const safePage = Math.max(1, Number(page) || 1)
    const safeSize = Math.min(50, Math.max(1, Number(pageSize) || 20))
    const where = ['n.user_id = ?']
    const params = [userId]
    if (STATE_VALUES.has(state)) {
        where.push('n.state = ?')
        params.push(state)
    }
    const term = String(keyword || '').trim()
    if (term) {
        where.push('(n.title LIKE ? OR n.content LIKE ?)')
        params.push(`%${term}%`, `%${term}%`)
    }
    const [countRow] = await query(
        `SELECT COUNT(*) AS total FROM note n WHERE ${where.join(' AND ')}`,
        params
    )
    const list = await query(
        `SELECT n.id, n.title, n.slug, n.content, n.state,
                n.published_at AS publishedAt, n.created_at AS createdAt, n.updated_at AS updatedAt,
                (SELECT COUNT(*) FROM note_link l
                   INNER JOIN note t ON t.id = l.to_note_id AND t.state = 'published'
                  WHERE l.from_note_id = n.id) AS outgoingLinks,
                (SELECT COUNT(*) FROM note_link l
                   INNER JOIN note s ON s.id = l.from_note_id AND s.state = 'published'
                  WHERE l.to_note_id = n.id) AS incomingLinks
           FROM note n WHERE ${where.join(' AND ')}
          ORDER BY n.updated_at DESC, n.id DESC
          LIMIT ? OFFSET ?`,
        [...params, safeSize, (safePage - 1) * safeSize]
    )
    return {
        list: list.map(row => ({
            ...row,
            excerpt: excerptMarkdown(row.content, 120),
        })),
        total: Number(countRow?.total || 0),
        page: safePage,
        pageSize: safeSize,
        totalPage: Math.ceil(Number(countRow?.total || 0) / safeSize),
    }
}

async function createNote({ title, content, state = 'draft', userId }) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => execute(connection, sql, values)
        const result = await exec(
            `INSERT INTO note (title, slug, content, state, user_id, published_at)
             VALUES (?, ?, ?, ?, ?, ${state === 'published' ? 'NOW()' : 'NULL'})`,
            [title, createSlug(title), content, normalizeState(state), userId]
        )
        const id = Number(result.insertId)
        await refreshLinks(exec, id, content)
        return { noteId: id }
    })
}

async function updateNote(id, { title, content, state, userId }) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => execute(connection, sql, values)
        const rows = await exec(
            `SELECT id, title, slug, content, state FROM note WHERE id = ? AND user_id = ? FOR UPDATE`,
            [id, userId]
        )
        const current = rows[0]
        if (!current) return { found: false }

        const nextTitle = title ?? current.title
        const nextContent = content ?? current.content
        const nextState = state ?? current.state
        const publishSql = nextState === 'published' && current.state !== 'published'
            ? ', published_at = NOW()'
            : ''
        await exec(
            `UPDATE note SET title = ?, content = ?, state = ?${publishSql}
             WHERE id = ? AND user_id = ?`,
            [nextTitle, nextContent, normalizeState(nextState, current.state), id, userId]
        )
        await refreshLinks(exec, id, nextContent)
        return { found: true, state: normalizeState(nextState, current.state) }
    })
}

async function deleteNote(id, userId) {
    const result = await query('DELETE FROM note WHERE id = ? AND user_id = ?', [id, userId])
    return result.affectedRows > 0
}

/**
 * 公开花园：只返回已发布笔记全文。私密笔记不会出现在公开索引与双链里。
 */
async function listPublicNotes() {
    const rows = await query(
        `SELECT n.id, n.title, n.slug, n.content,
                n.published_at AS publishedAt, n.updated_at AS updatedAt,
                (SELECT COUNT(*) FROM note_link l
                  INNER JOIN note t ON t.id = l.to_note_id AND t.state = 'published'
                 WHERE l.from_note_id = n.id) AS outgoingLinks,
                (SELECT COUNT(*) FROM note_link l
                  INNER JOIN note s ON s.id = l.from_note_id AND s.state = 'published'
                 WHERE l.to_note_id = n.id) AS incomingLinks
           FROM note n
          WHERE n.state = 'published'
          ORDER BY n.published_at DESC, n.id DESC`
    )
    return rows.map(row => ({
        ...row,
        excerpt: excerptMarkdown(row.content, 140),
    }))
}

/**
 * 门户搜索的相关阅读候选：文章按关键词打分，花园笔记按标题/正文命中，
 * 两者合并后由前端做最后的相似度排序。
 */
async function listPublicNotesForSearch(terms = [], limit = 12) {
    const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 30)
    const list = (Array.isArray(terms) ? terms : [])
        .map(term => String(term || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    if (list.length === 0) return []

    const where = list.map(() => '(n.title LIKE ? OR n.content LIKE ?)').join(' OR ')
    const params = list.flatMap(term => [`%${term}%`, `%${term}%`])
    return query(
        `SELECT n.id, n.title, n.slug, n.content,
                n.published_at AS publishedAt, n.updated_at AS updatedAt
           FROM note n
          WHERE n.state = 'published' AND (${where})
          ORDER BY n.updated_at DESC, n.id DESC
          LIMIT ?`,
        [...params, safeLimit]
    )
}

async function findPublicNoteById(id) {
    const rows = await query(
        `SELECT n.id, n.title, n.slug, n.content,
                n.published_at AS publishedAt, n.updated_at AS updatedAt
           FROM note n WHERE n.id = ? AND n.state = 'published' LIMIT 1`,
        [id]
    )
    return rows[0] || null
}

async function listBacklinks(noteId) {
    return query(
        `SELECT s.id, s.title, s.slug
           FROM note_link l
           INNER JOIN note s ON s.id = l.from_note_id
          WHERE l.to_note_id = ? AND s.state = 'published'
          ORDER BY s.title ASC, s.id ASC`,
        [noteId]
    )
}

/**
 * 反向链接聚合：一次查出多篇笔记的入链，供花园索引批量展示，
 * 避免逐条请求详情接口。只统计已发布的来源笔记。
 */
async function listBacklinksAggregated(noteIds) {
    const ids = (Array.isArray(noteIds) ? noteIds : [])
        .map(Number)
        .filter(id => Number.isSafeInteger(id) && id > 0)
    if (!ids.length) return []
    return query(
        `SELECT l.to_note_id AS toNoteId, s.id, s.title, s.slug
           FROM note_link l
           INNER JOIN note s ON s.id = l.from_note_id
          WHERE l.to_note_id IN (?) AND s.state = 'published'
          ORDER BY l.to_note_id ASC, s.title ASC, s.id ASC`,
        [ids]
    )
}

/**
 * 出发链接聚合：当前笔记正文里指向已公开笔记的链接，
 * 同样返回轻量 { id, title, slug }，让门户详情能双向浏览。
 */
async function listOutgoingLinks(noteId) {
    return query(
        `SELECT t.id, t.title, t.slug
           FROM note_link l
           INNER JOIN note t ON t.id = l.to_note_id
          WHERE l.from_note_id = ? AND t.state = 'published'
          ORDER BY t.title ASC, t.id ASC`,
        [noteId]
    )
}

/**
 * 出发链接聚合：花园索引一次取出所有公开出链，
 * 与反向链接一起下发，卡片点开后无需再请求详情。
 */
async function listOutgoingLinksAggregated(noteIds) {
    const ids = (Array.isArray(noteIds) ? noteIds : [])
        .map(Number)
        .filter(id => Number.isSafeInteger(id) && id > 0)
    if (!ids.length) return []
    return query(
        `SELECT l.from_note_id AS fromNoteId, t.id, t.title, t.slug
           FROM note_link l
           INNER JOIN note t ON t.id = l.to_note_id
          WHERE l.from_note_id IN (?) AND t.state = 'published'
          ORDER BY l.from_note_id ASC, t.title ASC, t.id ASC`,
        [ids]
    )
}

/**
 * 记录「这篇笔记升级成了哪篇文章」。
 * 重复升级同一篇笔记时保留最新关系，避免旧草稿挤掉新文章。
 */
async function recordArticleUpgrade(noteId, articleId, userId) {
    await query(
        `INSERT INTO note_article_upgrade (note_id, article_id, user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP, user_id = VALUES(user_id)`,
        [noteId, articleId, userId || null]
    )
}

/**
 * 批量取升级关系：待整理清单一次带出每篇笔记对应的文章状态，
 * 文章发布后就能在清单里提示作者回笔记补链接。
 */
async function listUpgradedArticles(noteIds) {
    const ids = (Array.isArray(noteIds) ? noteIds : [])
        .map(Number)
        .filter(id => Number.isSafeInteger(id) && id > 0)
    if (!ids.length) return []
    return query(
        `SELECT u.note_id AS noteId, a.id, a.title, a.state,
                a.published_at AS publishedAt, u.created_at AS upgradedAt
           FROM note_article_upgrade u
           INNER JOIN article a ON a.id = u.article_id AND a.state <> 'deleted'
          WHERE u.note_id IN (?)
          ORDER BY u.created_at DESC, a.id DESC`,
        [ids]
    )
}

async function findUpgradedArticle(noteId) {
    return query(
        `SELECT a.id, a.title, a.state, a.published_at AS publishedAt
           FROM note_article_upgrade u
           INNER JOIN article a ON a.id = u.article_id AND a.state <> 'deleted'
          WHERE u.note_id = ?
          ORDER BY u.created_at DESC, a.id DESC
          LIMIT 1`,
        [noteId]
    )
}

/**
 * 公开花园的图谱边：只保留两端都已发布的链接，
 * 保证图谱节点与花园索引完全一致。
 */
async function listPublicGraphEdges() {
    return query(
        `SELECT l.from_note_id AS source, l.to_note_id AS target
           FROM note_link l
           INNER JOIN note s ON s.id = l.from_note_id AND s.state = 'published'
           INNER JOIN note t ON t.id = l.to_note_id AND t.state = 'published'
          WHERE l.from_note_id <> l.to_note_id
          ORDER BY l.from_note_id ASC, l.to_note_id ASC`
    )
}

// 图谱标签分面：按笔记正文里出现过的「#标签」统计，只统计公开笔记。
// 度数只算公开链接，与图谱边的口径保持一致。
async function listPublicGraphLabels() {
    const rows = await query(
        `SELECT n.id, n.content,
                COUNT(DISTINCT CASE WHEN other.id IS NOT NULL
                    THEN CASE WHEN l.from_note_id = n.id THEN l.to_note_id ELSE l.from_note_id END
                    END) AS degree
           FROM note n
           LEFT JOIN note_link l ON l.to_note_id = n.id OR l.from_note_id = n.id
           LEFT JOIN note other
                  ON other.id = CASE WHEN l.from_note_id = n.id THEN l.to_note_id ELSE l.from_note_id END
                 AND other.state = 'published'
          WHERE n.state = 'published'
          GROUP BY n.id, n.content`
    )
    const counts = new Map()
    const degrees = new Map()
    for (const row of rows) {
        const degree = Number(row.degree || 0)
        for (const tag of new Set(extractNoteTags(row.content))) {
            counts.set(tag, (counts.get(tag) || 0) + 1)
            degrees.set(tag, (degrees.get(tag) || 0) + degree)
        }
    }
    return [...counts.entries()]
        .map(([name, count]) => ({ name, count, degree: degrees.get(name) || 0 }))
        .sort((a, b) => b.count - a.count || b.degree - a.degree || a.name.localeCompare(b.name))
}

async function resolvePublicLinks(noteId, markdown) {
    const { titles, ids } = extractNoteLinks(markdown)
    const wantedIds = new Set(ids)
    if (titles.length > 0) {
        const rows = await query(
            `SELECT id, title FROM note
              WHERE state = 'published' AND title IN (${titles.map(() => '?').join(', ')})`,
            titles
        )
        rows.forEach(row => wantedIds.add(Number(row.id)))
    }
    if (wantedIds.size === 0) return { titles: {}, ids: {} }
    const rows = await query(
        `SELECT id, title FROM note
          WHERE state = 'published' AND id IN (${[...wantedIds].map(() => '?').join(', ')})`,
        [...wantedIds]
    )
    const byTitle = {}
    const byId = {}
    for (const row of rows) {
        byTitle[normalizeLinkTitle(row.title)] = { id: Number(row.id), title: row.title }
        byId[Number(row.id)] = { id: Number(row.id), title: row.title }
    }
    return { titles: byTitle, ids: byId }
}

async function countNotesByState(userId) {
    const rows = await query(
        `SELECT state, COUNT(*) AS total FROM note WHERE user_id = ? GROUP BY state`,
        [userId]
    )
    const summary = { all: 0, draft: 0, published: 0 }
    for (const row of rows) {
        if (row.state in summary) {
            summary[row.state] = Number(row.total)
            summary.all += Number(row.total)
        }
    }
    return summary
}

// 待整理候选：作者自己的已发布笔记，带上正文用于现算相似度
async function listNotesForTidy(userId) {
    const rows = await query(
        `SELECT n.id, n.title, n.slug, n.content, n.state,
                n.published_at AS publishedAt, n.updated_at AS updatedAt,
                (SELECT COUNT(*) FROM note_link l WHERE l.from_note_id = n.id) AS outgoingLinks,
                (SELECT COUNT(*) FROM note_link l WHERE l.to_note_id = n.id) AS incomingLinks
           FROM note n
          WHERE n.user_id = ? AND n.state = 'published'
          ORDER BY n.updated_at DESC, n.id DESC`,
        [userId]
    )
    return rows.map(row => ({
        ...row,
        outgoingLinks: Number(row.outgoingLinks || 0),
        incomingLinks: Number(row.incomingLinks || 0),
    }))
}

module.exports = {
    parseId,
    createSlug,
    listNotesForOwner,
    findOwnedNote,
    createNote,
    updateNote,
    deleteNote,
    listPublicNotes,
    listPublicNotesForSearch,
    findPublicNoteById,
    listBacklinks,
    listBacklinksAggregated,
    listOutgoingLinks,
    listOutgoingLinksAggregated,
    recordArticleUpgrade,
    listUpgradedArticles,
    findUpgradedArticle,
    listPublicGraphEdges,
    listPublicGraphLabels,
    resolvePublicLinks,
    countNotesByState,
    listNotesForTidy,
}
