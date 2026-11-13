const { query } = require('../../db/dbnew')

const DEFAULT_SCAN_LIMIT = 2000

/**
 * 内容健康扫描所需的已发布内容。
 * 正文一并取出，用于检测空图库、正文过短和门户内部失效链接。
 */
async function listPublishedContentForHealth(limit = DEFAULT_SCAN_LIMIT) {
    const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_SCAN_LIMIT, 1), DEFAULT_SCAN_LIMIT)
    const rows = await query(
        `SELECT a.id,
                a.title,
                a.classify,
                a.subset_id AS subsetId,
                s.subset_name AS subsetName,
                a.label,
                a.introduce,
                a.cover,
                a.content,
                a.views,
                a.published_at AS publishedAt,
                a.updated_at AS updatedAt,
                a.created_at AS createdAt
           FROM article a
           LEFT JOIN subset s ON s.id = a.subset_id
          WHERE a.state = 'published'
          ORDER BY COALESCE(a.updated_at, a.published_at, a.created_at) ASC, a.id ASC
          LIMIT ?`,
        [safeLimit]
    )

    const [totalRow] = await query(
        "SELECT COUNT(*) AS total FROM article WHERE state = 'published'"
    )

    return {
        rows,
        total: Number(totalRow?.total) || 0,
        scanLimit: safeLimit
    }
}

async function listPublishedArticleTargets() {
    return query(
        `SELECT id, classify
           FROM article
          WHERE state = 'published'`
    )
}

async function listPublishedDiaryIds() {
    return query('SELECT id FROM diary WHERE status = 1')
}

async function listPublicCollectionIds() {
    return query(
        `SELECT DISTINCT c.id
           FROM content_collection c
           JOIN content_collection_article ca ON ca.collection_id = c.id
           JOIN article a ON a.id = ca.article_id
          WHERE c.status = 1 AND a.state = 'published'`
    )
}

module.exports = {
    DEFAULT_SCAN_LIMIT,
    listPublishedContentForHealth,
    listPublishedArticleTargets,
    listPublishedDiaryIds,
    listPublicCollectionIds
}
