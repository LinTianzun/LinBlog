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

/**
 * 查询一篇已发布文章所属的公开系列，并给出系列内位置与前后篇。
 * 只返回同时满足「系列启用 + 文章已发布」的上下文，草稿不会出现在门户。
 */
async function findPublicCollectionsForArticle(articleId) {
    const collections = await query(
        `SELECT DISTINCT c.id, c.name, c.description, c.cover, c.sort,
                c.updated_at AS updatedAt
           FROM content_collection c
           JOIN content_collection_article ca ON ca.collection_id = c.id
           JOIN article a ON a.id = ca.article_id AND a.state = 'published'
          WHERE ca.article_id = ? AND c.status = 1
          ORDER BY c.sort DESC, c.id DESC`,
        [articleId]
    )
    if (collections.length === 0) return []

    const collectionIds = collections.map(collection => collection.id)
    const placeholders = collectionIds.map(() => '?').join(', ')
    const members = await query(
        `SELECT ca.collection_id AS collectionId,
                a.id,
                a.title,
                ca.sort AS memberSort
           FROM content_collection_article ca
           JOIN article a ON a.id = ca.article_id
          WHERE ca.collection_id IN (${placeholders})
            AND a.state = 'published'
          ORDER BY ca.collection_id ASC, ca.sort ASC, ca.id ASC`,
        collectionIds
    )

    const grouped = new Map()
    for (const member of members) {
        const key = Number(member.collectionId)
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key).push(member)
    }

    return collections.map(collection => {
        const items = grouped.get(Number(collection.id)) || []
        const index = items.findIndex(item => Number(item.id) === Number(articleId))
        if (index < 0) return null

        const previous = index > 0 ? items[index - 1] : null
        const next = index < items.length - 1 ? items[index + 1] : null
        return {
            id: collection.id,
            name: collection.name,
            description: collection.description || '',
            cover: collection.cover || '',
            position: index + 1,
            total: items.length,
            previous: previous ? { id: previous.id, title: previous.title } : null,
            next: next ? { id: next.id, title: next.title } : null
        }
    }).filter(Boolean)
}

function normalizeArticleIds(value) {
    if (!Array.isArray(value)) return []
    return [...new Set(
        value.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
    )]
}

function parseArticleIds(value) {
    try {
        const parsed = JSON.parse(String(value || '[]'))
        return normalizeArticleIds(parsed)
    } catch {
        return []
    }
}

/**
 * 追加一条版本快照。调用方必须在事务里先锁住系列行，
 * 保证并发保存时 revision 不会重复。
 */
async function appendVersion(
    connection,
    collectionId,
    snapshot,
    articleIds,
    { userId = null, source = 'manual' } = {}
) {
    const rows = await execute(
        connection,
        `SELECT COALESCE(MAX(revision), 0) AS maxRevision
           FROM content_collection_version
          WHERE collection_id = ?`,
        [collectionId]
    )
    const revision = Number(rows?.[0]?.maxRevision || 0) + 1
    await execute(
        connection,
        `INSERT INTO content_collection_version
            (collection_id, revision, name, description, cover, sort, article_ids, source, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            collectionId,
            revision,
            String(snapshot.name || ''),
            snapshot.description ? String(snapshot.description) : null,
            snapshot.cover ? String(snapshot.cover) : null,
            Number(snapshot.sort) || 0,
            JSON.stringify(normalizeArticleIds(articleIds)),
            source === 'rollback' ? 'rollback' : 'manual',
            userId ?? null
        ]
    )
    return revision
}

async function replaceArticlesInConnection(connection, collectionId, articleIds) {
    const ids = normalizeArticleIds(articleIds)
    await execute(
        connection,
        'DELETE FROM content_collection_article WHERE collection_id = ?',
        [collectionId]
    )
    for (let index = 0; index < ids.length; index += 1) {
        await execute(
            connection,
            `INSERT INTO content_collection_article (collection_id, article_id, sort)
             VALUES (?, ?, ?)`,
            [collectionId, ids[index], index * 10]
        )
    }
    return ids.length
}

async function findAvailableArticleIdsInConnection(connection, ids) {
    const uniqueIds = normalizeArticleIds(ids)
    if (uniqueIds.length === 0) return []
    const placeholders = uniqueIds.map(() => '?').join(', ')
    const rows = await execute(
        connection,
        `SELECT id FROM article
          WHERE id IN (${placeholders})
            AND state != 'deleted'
            AND classify = 'article'`,
        uniqueIds
    )
    return (rows || []).map(row => Number(row.id))
}

/**
 * 一次性保存系列基本信息与文章顺序，并追加版本快照。
 * articleIds 传 undefined 表示本次只改元信息，成员顺序原样继承。
 */
async function saveCollectionWithArticles(
    id,
    payload,
    articleIds,
    { userId = null } = {}
) {
    return withTransaction(async (connection) => {
        const currentRows = await execute(
            connection,
            `SELECT id, name, description, cover, sort
               FROM content_collection
              WHERE id = ? AND status = 1
              FOR UPDATE`,
            [id]
        )
        const current = currentRows?.[0]
        if (!current) return { found: false }

        const fields = []
        const params = []
        if (payload.name !== undefined) {
            fields.push('name = ?')
            params.push(payload.name)
        }
        if (payload.description !== undefined) {
            fields.push('description = ?')
            params.push(payload.description)
        }
        if (payload.cover !== undefined) {
            fields.push('cover = ?')
            params.push(payload.cover)
        }
        if (payload.sort !== undefined) {
            fields.push('sort = ?')
            params.push(payload.sort)
        }
        if (fields.length > 0) {
            params.push(id)
            await execute(
                connection,
                `UPDATE content_collection SET ${fields.join(', ')} WHERE id = ?`,
                params
            )
        }

        let nextIds
        if (Array.isArray(articleIds)) {
            nextIds = normalizeArticleIds(articleIds)
            await replaceArticlesInConnection(connection, id, nextIds)
        } else {
            const memberRows = await execute(
                connection,
                `SELECT article_id AS articleId
                   FROM content_collection_article
                  WHERE collection_id = ?
                  ORDER BY sort ASC, id ASC`,
                [id]
            )
            nextIds = (memberRows || []).map(row => Number(row.articleId))
        }

        const revision = await appendVersion(connection, id, {
            name: payload.name !== undefined ? payload.name : current.name,
            description: payload.description !== undefined ? payload.description : current.description,
            cover: payload.cover !== undefined ? payload.cover : current.cover,
            sort: payload.sort !== undefined ? payload.sort : current.sort
        }, nextIds, { userId, source: 'manual' })

        return { found: true, revision, articleCount: nextIds.length }
    })
}

async function replaceCollectionArticlesWithVersion(id, articleIds, { userId = null } = {}) {
    return saveCollectionWithArticles(id, {}, articleIds, { userId })
}

/**
 * 版本列表只返回摘要；文章标题按当前文章表批量补齐，
 * 已被彻底删除的文章会退化成「文章 #id」。
 */
async function listCollectionVersions(id, { page = 1, pageSize = 10 } = {}) {
    const safePage = Math.max(1, Number(page) || 1)
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10))
    const offset = (safePage - 1) * safePageSize

    const rows = await query(
        `SELECT v.id, v.collection_id AS collectionId, v.revision, v.name,
                v.description, v.cover, v.sort, v.article_ids AS articleIds,
                v.source, v.created_by AS createdBy, u.username,
                v.created_at AS createdAt
           FROM content_collection_version v
           LEFT JOIN users u ON u.id = v.created_by
          WHERE v.collection_id = ?
          ORDER BY v.revision DESC, v.id DESC
          LIMIT ? OFFSET ?`,
        [id, safePageSize, offset]
    )
    const [countRow] = await query(
        'SELECT COUNT(*) AS total FROM content_collection_version WHERE collection_id = ?',
        [id]
    )

    const parsedRows = rows.map(row => ({
        ...row,
        articleIdList: parseArticleIds(row.articleIds)
    }))
    const allIds = [...new Set(parsedRows.flatMap(row => row.articleIdList))]
    const titleMap = new Map()
    if (allIds.length > 0) {
        const titleRows = await query(
            `SELECT id, title FROM article WHERE id IN (${allIds.map(() => '?').join(', ')})`,
            allIds
        )
        titleRows.forEach(row => titleMap.set(Number(row.id), row.title))
    }

    return {
        list: parsedRows.map(row => ({
            id: row.id,
            collectionId: row.collectionId,
            revision: Number(row.revision),
            name: row.name,
            description: row.description || '',
            cover: row.cover || '',
            sort: Number(row.sort) || 0,
            articleCount: row.articleIdList.length,
            articleTitles: row.articleIdList
                .slice(0, 4)
                .map(articleId => titleMap.get(articleId) || `文章 #${articleId}`),
            source: row.source,
            operatorName: row.username ? String(row.username) : '系统',
            createdAt: row.createdAt
        })),
        total: Number(countRow?.total) || 0,
        page: safePage,
        pageSize: safePageSize,
        totalPage: Math.ceil((Number(countRow?.total) || 0) / safePageSize)
    }
}

async function findCollectionVersion(id, versionId) {
    const rows = await query(
        `SELECT v.id, v.collection_id AS collectionId, v.revision, v.name,
                v.description, v.cover, v.sort, v.article_ids AS articleIds,
                v.source, v.created_by AS createdBy, u.username,
                v.created_at AS createdAt
           FROM content_collection_version v
           LEFT JOIN users u ON u.id = v.created_by
          WHERE v.collection_id = ? AND v.id = ?
          LIMIT 1`,
        [id, versionId]
    )
    const row = rows?.[0]
    if (!row) return null

    const articleIds = parseArticleIds(row.articleIds)
    let articles = []
    if (articleIds.length > 0) {
        const articleRows = await query(
            `SELECT a.id, a.title, a.introduce, a.cover, a.classify, a.state,
                    a.subset_id AS subsetId, s.subset_name AS subsetName
               FROM article a
               LEFT JOIN subset s ON s.id = a.subset_id
              WHERE a.id IN (${articleIds.map(() => '?').join(', ')})`,
            articleIds
        )
        const articleMap = new Map(articleRows.map(item => [Number(item.id), item]))
        articles = articleIds.map(articleId => {
            const item = articleMap.get(articleId)
            return item
                ? {
                    id: item.id,
                    title: item.title,
                    introduce: item.introduce || '',
                    cover: item.cover || '',
                    classify: item.classify,
                    state: item.state,
                    subsetId: item.subsetId,
                    subsetName: item.subsetName || ''
                }
                : { id: articleId, title: `文章 #${articleId}`, missing: true }
        })
    }

    return {
        id: row.id,
        collectionId: row.collectionId,
        revision: Number(row.revision),
        name: row.name,
        description: row.description || '',
        cover: row.cover || '',
        sort: Number(row.sort) || 0,
        articleIds,
        articles,
        source: row.source,
        operatorName: row.username ? String(row.username) : '系统',
        createdAt: row.createdAt
    }
}

/**
 * 回滚不覆盖历史：恢复目标快照后追加一条 rollback 版本。
 * 快照里已被彻底删除的文章会跳过，避免外键失败。
 */
async function restoreCollectionVersion(id, versionId, { userId = null } = {}) {
    return withTransaction(async (connection) => {
        const collectionRows = await execute(
            connection,
            'SELECT id FROM content_collection WHERE id = ? AND status = 1 FOR UPDATE',
            [id]
        )
        if (!collectionRows?.[0]) return { found: false, reason: 'collection' }

        const versionRows = await execute(
            connection,
            `SELECT id, revision, name, description, cover, sort, article_ids AS articleIds
               FROM content_collection_version
              WHERE collection_id = ? AND id = ?
              LIMIT 1`,
            [id, versionId]
        )
        const version = versionRows?.[0]
        if (!version) return { found: false, reason: 'version' }

        const snapshotIds = parseArticleIds(version.articleIds)
        const available = await findAvailableArticleIdsInConnection(connection, snapshotIds)
        const availableSet = new Set(available)
        const articleIds = snapshotIds.filter(articleId => availableSet.has(articleId))
        const skippedArticleIds = snapshotIds.filter(articleId => !availableSet.has(articleId))

        await execute(
            connection,
            `UPDATE content_collection
                SET name = ?, description = ?, cover = ?, sort = ?
              WHERE id = ?`,
            [
                version.name,
                version.description || null,
                version.cover || null,
                Number(version.sort) || 0,
                id
            ]
        )
        await replaceArticlesInConnection(connection, id, articleIds)
        const revision = await appendVersion(connection, id, {
            name: version.name,
            description: version.description,
            cover: version.cover,
            sort: version.sort
        }, articleIds, { userId, source: 'rollback' })

        return {
            found: true,
            revision,
            restoredFrom: Number(version.revision),
            skippedArticleIds
        }
    })
}

async function insertCollection(
    { name, description = '', cover = '', sort = 0, articleIds = [] },
    { userId = null } = {}
) {
    return withTransaction(async (connection) => {
        const result = await execute(
            connection,
            `INSERT INTO content_collection (name, description, cover, sort)
             VALUES (?, ?, ?, ?)`,
            [name, description, cover, sort]
        )
        const collectionId = Number(result.insertId)
        const ids = normalizeArticleIds(articleIds)
        await replaceArticlesInConnection(connection, collectionId, ids)
        const revision = await appendVersion(connection, collectionId, {
            name,
            description,
            cover,
            sort
        }, ids, { userId, source: 'manual' })
        return { collectionId, revision }
    })
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
    let savedCount = 0
    await withTransaction(async (connection) => {
        savedCount = await replaceArticlesInConnection(connection, collectionId, articleIds)
    })
    return savedCount
}

module.exports = {
    findCollections,
    findCollectionById,
    findPublicCollectionsForArticle,
    insertCollection,
    updateCollection,
    softDeleteCollection,
    findAvailableArticleIds,
    replaceCollectionArticles,
    saveCollectionWithArticles,
    replaceCollectionArticlesWithVersion,
    listCollectionVersions,
    findCollectionVersion,
    restoreCollectionVersion
}
