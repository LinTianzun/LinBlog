const { query, withTransaction } = require('../../db/dbnew')

const COLLECTION_ARTICLE_FIELDS = `
    a.id,
    a.title,
    a.introduce,
    a.cover,
    a.classify,
    a.state,
    a.label,
    a.views,
    a.likes,
    a.comments,
    a.user_id AS userId,
    a.created_at AS createdAt,
    a.updated_at AS updatedAt,
    a.published_at AS publishedAt,
    a.subset_id AS subsetId,
    s.subset_name AS subsetName,
    ca.sort AS memberSort
`

function execute(connection, sql, values = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (err, result) => {
            if (err) reject(err)
            else resolve(result)
        })
    })
}

async function findCollections({ publicOnly = false } = {}) {
    const publishedCount = publicOnly
        ? `(SELECT COUNT(*)
             FROM content_collection_article ca
             JOIN article a ON a.id = ca.article_id
            WHERE ca.collection_id = c.id AND a.state = 'published')`
        : "0"
    const articleCount = publicOnly
        ? publishedCount
        : `(SELECT COUNT(*)
             FROM content_collection_article ca
             JOIN article a ON a.id = ca.article_id
            WHERE ca.collection_id = c.id AND a.state != 'deleted')`
    const rows = await query(
        `SELECT c.id, c.name, c.description, c.cover, c.sort, c.status,
                c.created_at AS createdAt, c.updated_at AS updatedAt,
                ${articleCount} AS articleCount,
                ${publishedCount} AS publishedCount
           FROM content_collection c
          WHERE c.status = 1
          ORDER BY c.sort DESC, c.id DESC`
    )

    return rows
}

async function findCollectionById(id, { publicOnly = false } = {}) {
    const rows = await query(
        `SELECT c.id, c.name, c.description, c.cover, c.sort, c.status,
                c.created_at AS createdAt, c.updated_at AS updatedAt
           FROM content_collection c
          WHERE c.id = ? AND c.status = 1
          LIMIT 1`,
        [id]
    )
    const collection = rows[0]
    if (!collection) return null

    const stateFilter = publicOnly ? "AND a.state = 'published'" : "AND a.state != 'deleted'"
    const articles = await query(
        `SELECT ${COLLECTION_ARTICLE_FIELDS}
           FROM content_collection_article ca
           JOIN article a ON a.id = ca.article_id
           LEFT JOIN subset s ON s.id = a.subset_id
          WHERE ca.collection_id = ? ${stateFilter}
          ORDER BY ca.sort ASC, ca.id ASC`,
        [id]
    )

    return {
        ...collection,
        articleCount: articles.length,
        publishedCount: publicOnly
            ? articles.length
            : articles.filter(article => article.state === 'published').length,
        articles
    }
}

async function insertCollection({ name, description = '', cover = '', sort = 0 }) {
    const result = await query(
        `INSERT INTO content_collection (name, description, cover, sort)
         VALUES (?, ?, ?, ?)`,
        [name, description, cover, sort]
    )
    return { collectionId: result.insertId }
}

async function updateCollection(id, { name, description, cover, sort }) {
    const fields = []
    const params = []

    if (name !== undefined) {
        fields.push('name = ?')
        params.push(name)
    }
    if (description !== undefined) {
        fields.push('description = ?')
        params.push(description)
    }
    if (cover !== undefined) {
        fields.push('cover = ?')
        params.push(cover)
    }
    if (sort !== undefined) {
        fields.push('sort = ?')
        params.push(sort)
    }
    if (fields.length === 0) return 0

    params.push(id)
    const result = await query(
        `UPDATE content_collection
            SET ${fields.join(', ')}
          WHERE id = ? AND status = 1`,
        params
    )
    return result.affectedRows
}

async function softDeleteCollection(id) {
    const result = await query(
        'UPDATE content_collection SET status = 0 WHERE id = ? AND status = 1',
        [id]
    )
    return result.affectedRows
}

async function findAvailableArticleIds(ids) {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) return []

    const placeholders = uniqueIds.map(() => '?').join(', ')
    const rows = await query(
        `SELECT id FROM article
          WHERE id IN (${placeholders})
            AND state != 'deleted'
            AND classify = 'article'`,
        uniqueIds
    )
    return rows.map(row => Number(row.id))
}

/**
 * 用整组有序 ID 替换系列成员。
 * 先删后插放在同一事务里，避免保存中途失败留下空系列。
 */
async function replaceCollectionArticles(collectionId, articleIds) {
    const uniqueIds = [...new Set(articleIds.map(Number).filter(Number.isSafeInteger))]

    await withTransaction(async (connection) => {
        await execute(
            connection,
            'DELETE FROM content_collection_article WHERE collection_id = ?',
            [collectionId]
        )

        for (let index = 0; index < uniqueIds.length; index += 1) {
            await execute(
                connection,
                `INSERT INTO content_collection_article (collection_id, article_id, sort)
                 VALUES (?, ?, ?)`,
                [collectionId, uniqueIds[index], index * 10]
            )
        }
    })

    return uniqueIds.length
}

module.exports = {
    findCollections,
    findCollectionById,
    insertCollection,
    updateCollection,
    softDeleteCollection,
    findAvailableArticleIds,
    replaceCollectionArticles
}
