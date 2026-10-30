const { query, withTransaction } = require('../../db/dbnew')
const articleModel = require('../article/index')
const labelModel = require('../label/index')

const VERSION_SOURCES = ['manual', 'autosave', 'publish', 'rollback', 'scheduled']
const AUTOSAVE_SNAPSHOT_WINDOW_MINUTES = 5
const AUTOSAVE_RETENTION_HOURS = 24
const MAX_AUTOSAVE_VERSIONS_PER_ARTICLE = 50

function normalizeVersionSource(source) {
    return VERSION_SOURCES.includes(source) ? source : 'manual'
}

function normalizeSnapshot(article) {
    if (!article) return null
    return {
        title: article.title,
        subsetId: article.subsetId ?? null,
        classify: article.classify,
        label: article.label ?? '',
        introduce: article.introduce ?? '',
        content: article.content,
        cover: article.cover ?? '',
        state: article.state,
    }
}

function parseDraftPayload(value) {
    if (!value) return null
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value
        if (!parsed || typeof parsed !== 'object') return null
        return parsed
    } catch {
        return null
    }
}

async function findArticleForWorkflow(articleId) {
    const rows = await query(
        `SELECT a.id, a.user_id AS userId, a.title, a.subset_id AS subsetId,
                a.classify, a.label, a.introduce, a.content, a.cover, a.state,
                a.published_at AS publishedAt, a.updated_at AS updatedAt,
                a.scheduled_at AS scheduledAt, a.draft_content AS draftContent,
                a.draft_payload AS draftPayload,
                a.draft_revision AS draftRevision, a.draft_saved_at AS draftSavedAt
         FROM article a
         WHERE a.id = ? AND a.state != 'deleted'
         LIMIT 1`,
        [articleId]
    )
    return rows[0] || null
}

/**
 * 工作稿读取：已发布文章优先返回 draft_content，草稿则直接返回正文。
 * revision 只随工作稿保存递增，用于前端自动保存的乐观锁。
 */
async function findWorkflowState(articleId) {
    const article = await findArticleForWorkflow(articleId)
    if (!article) return null

    const draftPayload = parseDraftPayload(article.draftPayload)
    const hasDraft = article.state === 'published' &&
        (article.draftContent !== null || draftPayload !== null)
    const publishedCopy = normalizeSnapshot(article)
    return {
        articleId: article.id,
        classify: article.classify,
        state: article.state,
        revision: Number(article.draftRevision) || 0,
        savedAt: article.draftSavedAt || article.updatedAt,
        scheduledAt: article.scheduledAt || null,
        publishedAt: article.publishedAt || null,
        hasUnpublishedChanges: hasDraft,
        workingCopy: hasDraft
            ? {
                ...publishedCopy,
                ...(draftPayload || {}),
                content: article.draftContent ?? draftPayload?.content ?? article.content,
            }
            : publishedCopy,
    }
}

async function insertVersionSnapshot(client, articleId, snapshot, source, userId, revision) {
    await client(
        `INSERT INTO article_version
            (article_id, revision, title, subset_id, classify, label, introduce,
             content, cover, state, source, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            articleId,
            revision,
            snapshot.title,
            snapshot.subsetId ?? null,
            snapshot.classify,
            snapshot.label ?? '',
            snapshot.introduce ?? '',
            snapshot.content,
            snapshot.cover ?? '',
            snapshot.state,
            normalizeVersionSource(source),
            userId ?? null,
        ]
    )
}

/**
 * 连续自动保存只保留每 5 分钟窗口的首个快照。
 * 当前工作稿仍会在每次保存时更新，因此合并只影响可回滚历史，不影响防丢稿。
 */
async function hasRecentAutosaveSnapshot(client, articleId) {
    const rows = await client(
        `SELECT source,
                (created_at >= DATE_SUB(NOW(), INTERVAL ${AUTOSAVE_SNAPSHOT_WINDOW_MINUTES} MINUTE)) AS isRecent
         FROM article_version
         WHERE article_id = ?
         ORDER BY revision DESC, id DESC
         LIMIT 1`,
        [articleId]
    )
    const latest = rows[0]
    return latest?.source === 'autosave' &&
        (latest.isRecent === true || Number(latest.isRecent) === 1)
}

/**
 * 自动快照只保留近 24 小时和最近 50 条；手动、发布、回滚与定时发布
 * 快照属于明确操作节点，不参与自动裁剪，避免关键版本被高频自动保存挤掉。
 */
async function pruneVersions(client, articleId) {
    await client(
        `DELETE FROM article_version
         WHERE article_id = ?
           AND source = 'autosave'
           AND created_at < DATE_SUB(NOW(), INTERVAL ${AUTOSAVE_RETENTION_HOURS} HOUR)`,
        [articleId]
    )
    await client(
        `DELETE FROM article_version
         WHERE article_id = ?
           AND source = 'autosave'
           AND id NOT IN (
               SELECT id FROM (
                   SELECT id FROM article_version
                   WHERE article_id = ? AND source = 'autosave'
                   ORDER BY revision DESC, id DESC
                   LIMIT ${MAX_AUTOSAVE_VERSIONS_PER_ARTICLE}
               ) AS keep_rows
           )`,
        [articleId, articleId]
    )
}

/**
 * 保存工作稿。草稿直接更新 article.content；已发布内容写 draft_content，
 * 保证自动保存不会把线上正文提前换掉。
 * expectedRevision 为 -1 表示调用方没有打开过历史版本，允许覆盖；
 * 否则版本不一致返回 conflict，由前端提示用户刷新后再保存。
 */
async function saveWorkingCopy(articleId, payload, { userId, source = 'autosave', expectedRevision } = {}) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, result) => err ? reject(err) : resolve(result))
        })

        const [article] = await exec(
            `SELECT id, user_id AS userId, state, classify, title, subset_id AS subsetId,
                    label, introduce, content, cover, draft_revision AS draftRevision
             FROM article
             WHERE id = ? AND state != 'deleted'
             LIMIT 1
             FOR UPDATE`,
            [articleId]
        )
        if (!article) return { found: false }

        const currentRevision = Number(article.draftRevision) || 0
        if (
            Number.isInteger(expectedRevision) &&
            expectedRevision >= 0 &&
            expectedRevision !== currentRevision
        ) {
            return {
                found: true,
                conflict: true,
                revision: currentRevision,
                updatedAt: null,
            }
        }

        const snapshot = {
            title: payload.title,
            subsetId: payload.subsetId ?? null,
            classify: payload.classify || article.classify,
            label: payload.label ?? '',
            introduce: payload.introduce ?? '',
            content: payload.content,
            cover: payload.cover ?? '',
            state: article.state === 'published' ? 'published' : article.state,
        }
        const nextRevision = currentRevision + 1
        const isPublished = article.state === 'published'

        if (isPublished) {
            await exec(
                `UPDATE article
                 SET draft_payload = ?, draft_content = ?,
                     draft_revision = ?, draft_saved_at = NOW()
                 WHERE id = ?`,
                [
                    JSON.stringify({
                        title: snapshot.title,
                        subsetId: snapshot.subsetId,
                        classify: snapshot.classify,
                        label: snapshot.label,
                        introduce: snapshot.introduce,
                        cover: snapshot.cover,
                    }),
                    snapshot.content,
                    nextRevision,
                    articleId,
                ]
            )
        } else {
            await exec(
                `UPDATE article
                 SET title = ?, subset_id = ?, label = ?, introduce = ?, content = ?,
                     cover = ?, draft_revision = ?, draft_saved_at = NOW()
                 WHERE id = ?`,
                [
                    snapshot.title,
                    snapshot.subsetId,
                    snapshot.label,
                    snapshot.introduce,
                    snapshot.content,
                    snapshot.cover,
                    nextRevision,
                    articleId,
                ]
            )
        }

        const normalizedSource = normalizeVersionSource(source)
        const coalesceAutosave = normalizedSource === 'autosave' &&
            await hasRecentAutosaveSnapshot(exec, articleId)
        if (!coalesceAutosave) {
            await insertVersionSnapshot(
                exec,
                articleId,
                snapshot,
                normalizedSource,
                userId,
                nextRevision
            )
        }
        await pruneVersions(exec, articleId)
        if (snapshot.label !== undefined) {
            await labelModel.ensureLabels(snapshot.label)
        }

        return {
            found: true,
            conflict: false,
            revision: nextRevision,
            updatedAt: new Date().toISOString(),
            savedAt: new Date().toISOString(),
            hasUnpublishedChanges: isPublished,
        }
    })
}

async function listVersions(articleId, { page = 1, pageSize = 20 } = {}) {
    const safePage = Math.max(1, Number(page) || 1)
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20))
    const offset = (safePage - 1) * safePageSize

    const rows = await query(
        `SELECT id, article_id AS articleId, revision, title, subset_id AS subsetId,
                classify, label, introduce, cover, state, source,
                created_by AS createdBy, created_at AS createdAt,
                CHAR_LENGTH(content) AS contentLength
         FROM article_version
         WHERE article_id = ?
         ORDER BY revision DESC, id DESC
         LIMIT ? OFFSET ?`,
        [articleId, safePageSize, offset]
    )
    const [countRow] = await query(
        'SELECT COUNT(*) AS total FROM article_version WHERE article_id = ?',
        [articleId]
    )
    // 图库版本的正文是图片 URL 数组，列表页展示「几张图片」比字数更有意义。
    // 单独取一次内容，避免把大字段带进列表查询。
    const galleryRows = rows.filter((row) => row.classify === 'image')
    if (galleryRows.length > 0) {
        const contents = await query(
            `SELECT id, content FROM article_version WHERE id IN (${galleryRows.map(() => '?').join(', ')})`,
            galleryRows.map((row) => row.id)
        )
        const countMap = new Map()
        contents.forEach((row) => {
            let size = 0
            try {
                const parsed = typeof row.content === 'string' ? JSON.parse(row.content) : row.content
                size = Array.isArray(parsed) ? parsed.length : 0
            } catch {
                size = 0
            }
            countMap.set(row.id, size)
        })
        rows.forEach((row) => {
            if (row.classify === 'image') row.mediaCount = countMap.get(row.id) || 0
        })
    }
    return {
        list: rows,
        total: Number(countRow?.total) || 0,
        page: safePage,
        pageSize: safePageSize,
        totalPage: Math.ceil((Number(countRow?.total) || 0) / safePageSize),
    }
}

async function findVersion(articleId, versionId) {
    const rows = await query(
        `SELECT id, article_id AS articleId, revision, title, subset_id AS subsetId,
                classify, label, introduce, content, cover, state, source,
                created_by AS createdBy, created_at AS createdAt
         FROM article_version
         WHERE article_id = ? AND id = ?
         LIMIT 1`,
        [articleId, versionId]
    )
    return rows[0] || null
}

async function findLatestVersion(articleId) {
    const rows = await query(
        `SELECT id, article_id AS articleId, revision, title, subset_id AS subsetId,
                classify, label, introduce, content, cover, state, source,
                created_by AS createdBy, created_at AS createdAt
         FROM article_version
         WHERE article_id = ?
         ORDER BY revision DESC, id DESC
         LIMIT 1`,
        [articleId]
    )
    return rows[0] || null
}

/**
 * 回滚不是覆盖历史：先把目标版本内容恢复成新的工作稿，
 * 再追加一条 rollback 快照。这样版本链只追加、不篡改，随时还能回退到回滚前。
 */
async function restoreVersion(articleId, versionId, { userId } = {}) {
    const version = await findVersion(articleId, versionId)
    if (!version) return { found: false }

    return saveWorkingCopy(articleId, {
        title: version.title,
        subsetId: version.subsetId,
        classify: version.classify,
        label: version.label,
        introduce: version.introduce,
        content: version.content,
        cover: version.cover,
    }, {
        userId,
        source: 'rollback',
        expectedRevision: -1,
    })
}

async function schedulePublish(articleId, scheduledAt, { userId } = {}) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, result) => err ? reject(err) : resolve(result))
        })
        const [article] = await exec(
            `SELECT id, state FROM article
             WHERE id = ? AND state != 'deleted'
             LIMIT 1
             FOR UPDATE`,
            [articleId]
        )
        if (!article) return { found: false }

        await exec(
            `UPDATE article
             SET scheduled_at = ?, updated_at = updated_at
             WHERE id = ?`,
            [scheduledAt, articleId]
        )
        return { found: true, articleId, scheduledAt }
    })
}

async function clearSchedule(articleId) {
    const result = await query(
        `UPDATE article
         SET scheduled_at = NULL, updated_at = updated_at
         WHERE id = ? AND state != 'deleted'`,
        [articleId]
    )
    return result.affectedRows > 0
}

async function findDueScheduledArticles(limit = 20) {
    return query(
        `SELECT id, user_id AS userId, classify
         FROM article
         WHERE state != 'deleted'
           AND scheduled_at IS NOT NULL
           AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC, id ASC
         LIMIT ?`,
        [Math.min(Math.max(Number(limit) || 20, 1), 100)]
    )
}

/**
 * 定时发布工作台队列。
 * 只返回仍挂在 article.scheduled_at 上的内容；其中 scheduled_at <= NOW()
 * 的项代表调度器尚未成功发布（常见于进程停机或发布异常），前端作为逾期告警展示。
 */
async function listScheduledArticles({
    page = 1,
    pageSize = 20,
    classify = null,
    scopes = [],
    userId = null,
} = {}) {
    const safePage = Math.max(1, Number(page) || 1)
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20))
    const offset = (safePage - 1) * safePageSize

    const where = ['a.state != ?', 'a.scheduled_at IS NOT NULL']
    const values = ['deleted']

    if (classify && ['article', 'image'].includes(classify)) {
        where.push('a.classify = ?')
        values.push(classify)
    }

    const accessClauses = []
    for (const scope of Array.isArray(scopes) ? scopes : []) {
        if (!scope || !['article', 'image'].includes(scope.classify)) continue
        if (classify && scope.classify !== classify) continue
        if (scope.manageAll) {
            accessClauses.push('a.classify = ?')
            values.push(scope.classify)
        } else if (scope.manageOwn && Number.isSafeInteger(Number(userId))) {
            accessClauses.push('(a.classify = ? AND a.user_id = ?)')
            values.push(scope.classify, Number(userId))
        }
    }
    if (accessClauses.length === 0) {
        where.push('1 = 0')
    } else {
        where.push(`(${accessClauses.join(' OR ')})`)
    }

    const whereSql = where.join(' AND ')
    const list = await query(
        `SELECT a.id, a.user_id AS userId, u.username AS ownerName,
                a.title, a.classify, a.state, a.scheduled_at AS scheduledAt,
                (a.draft_content IS NOT NULL OR a.draft_payload IS NOT NULL) AS hasUnpublishedChanges,
                a.draft_saved_at AS draftSavedAt, a.updated_at AS updatedAt
         FROM article a
         LEFT JOIN users u ON a.user_id = u.id
         WHERE ${whereSql}
         ORDER BY a.scheduled_at ASC, a.id ASC
         LIMIT ? OFFSET ?`,
        [...values, safePageSize, offset]
    )
    const [totalRow] = await query(
        `SELECT COUNT(*) AS total FROM article a WHERE ${whereSql}`,
        values
    )
    const [summaryRow] = await query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN a.scheduled_at > NOW() THEN 1 ELSE 0 END) AS upcoming,
                SUM(CASE WHEN a.scheduled_at <= NOW() THEN 1 ELSE 0 END) AS overdue
         FROM article a
         WHERE ${whereSql}`,
        values
    )
    const total = Number(totalRow?.total) || 0
    return {
        list,
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPage: Math.ceil(total / safePageSize),
        summary: {
            total,
            upcoming: Number(summaryRow?.upcoming) || 0,
            overdue: Number(summaryRow?.overdue) || 0,
        },
    }
}

async function clearScheduledArticle(articleId) {
    const result = await query(
        `UPDATE article
         SET scheduled_at = NULL, updated_at = NOW()
         WHERE id = ? AND state != 'deleted'`,
        [articleId]
    )
    return result.affectedRows > 0
}

/**
 * 把工作稿落到线上字段并清空工作稿。
 * 状态流转（撤回 / 草稿转发布）时调用，保证未发布的修改不会被丢掉，
 * 也不会在下次进入编辑页时又被当成「未发布修改」弹回来。
 */
async function promoteWorkingCopy(articleId) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, result) => err ? reject(err) : resolve(result))
        })
        const [article] = await exec(
            `SELECT id, title, subset_id AS subsetId, classify, label, introduce,
                    content, cover, draft_content AS draftContent, draft_payload AS draftPayload
             FROM article
             WHERE id = ? AND state != 'deleted'
             LIMIT 1
             FOR UPDATE`,
            [articleId]
        )
        if (!article) return { found: false }

        const draftPayload = parseDraftPayload(article.draftPayload)
        if (article.draftContent === null && draftPayload === null) {
            return { found: true, promoted: false, previousCover: null }
        }

        await exec(
            `UPDATE article
             SET title = ?, subset_id = ?, label = ?, introduce = ?, content = ?, cover = ?,
                 draft_content = NULL, draft_payload = NULL, draft_saved_at = NOW()
             WHERE id = ?`,
            [
                draftPayload?.title ?? article.title,
                draftPayload?.subsetId ?? article.subsetId ?? null,
                draftPayload?.label ?? article.label ?? '',
                draftPayload?.introduce ?? article.introduce ?? '',
                article.draftContent ?? draftPayload?.content ?? article.content,
                draftPayload?.cover ?? article.cover ?? '',
                articleId,
            ]
        )
        return { found: true, promoted: true, previousCover: article.cover ?? null }
    })
}

/**
 * 定时发布：工作稿存在时先应用工作稿，再置为 published 并清空计划时间。
 * 更新条件带 scheduled_at 非空，避免多实例重复执行。
 */
async function publishScheduledArticle(articleId) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, result) => err ? reject(err) : resolve(result))
        })
        const [article] = await exec(
            `SELECT id, user_id AS userId, title, subset_id AS subsetId, classify,
                    label, introduce, content, cover, state, draft_content AS draftContent,
                    draft_payload AS draftPayload,
                    draft_revision AS draftRevision, scheduled_at AS scheduledAt
             FROM article
             WHERE id = ? AND state != 'deleted' AND scheduled_at IS NOT NULL
             LIMIT 1
             FOR UPDATE`,
            [articleId]
        )
        if (!article) return { published: false }

        const draftPayload = parseDraftPayload(article.draftPayload)
        const snapshot = {
            ...normalizeSnapshot(article),
            ...(draftPayload || {}),
            content: article.draftContent ?? draftPayload?.content ?? article.content,
            state: 'published',
        }
        const nextRevision = (Number(article.draftRevision) || 0) + 1

        const result = await exec(
            `UPDATE article
             SET title = ?, subset_id = ?, label = ?, introduce = ?, content = ?,
                 cover = ?, state = 'published', published_at = NOW(),
                 scheduled_at = NULL, draft_content = NULL, draft_payload = NULL,
                 draft_revision = ?, draft_saved_at = NOW(), updated_at = NOW()
             WHERE id = ? AND state != 'deleted' AND scheduled_at IS NOT NULL`,
            [
                snapshot.title,
                snapshot.subsetId,
                snapshot.label,
                snapshot.introduce,
                snapshot.content,
                snapshot.cover,
                nextRevision,
                articleId,
            ]
        )
        if (result.affectedRows === 0) return { published: false }

        await insertVersionSnapshot(
            exec,
            articleId,
            snapshot,
            'scheduled',
            article.userId,
            nextRevision
        )
        await pruneVersions(exec, articleId)
        return {
            published: true,
            articleId,
            revision: nextRevision,
            previousCover: article.cover ?? null,
        }
    })
}

/**
 * 发布工作稿：将工作稿字段应用到已发布正文，并记录 publish 快照。
 * 非 published 状态由现有状态接口处理，这里只服务已发布文章的内容更新。
 */
async function publishWorkingCopy(articleId, { userId } = {}) {
    return withTransaction(async (connection) => {
        const exec = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, result) => err ? reject(err) : resolve(result))
        })
        const [article] = await exec(
            `SELECT id, user_id AS userId, title, subset_id AS subsetId, classify,
                    label, introduce, content, cover, state,
                    draft_content AS draftContent, draft_payload AS draftPayload,
                    draft_revision AS draftRevision
             FROM article
             WHERE id = ? AND state != 'deleted'
             LIMIT 1
             FOR UPDATE`,
            [articleId]
        )
        if (!article) return { found: false }

        const draftPayload = parseDraftPayload(article.draftPayload)
        const snapshot = {
            ...normalizeSnapshot(article),
            ...(draftPayload || {}),
            content: article.draftContent ?? draftPayload?.content ?? article.content,
            state: 'published',
        }
        const nextRevision = (Number(article.draftRevision) || 0) + 1

        await exec(
            `UPDATE article
             SET title = ?, subset_id = ?, label = ?, introduce = ?, content = ?,
                 cover = ?, state = 'published', published_at = NOW(),
                 scheduled_at = NULL, draft_content = NULL, draft_payload = NULL,
                 draft_revision = ?, draft_saved_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [
                snapshot.title,
                snapshot.subsetId,
                snapshot.label,
                snapshot.introduce,
                snapshot.content,
                snapshot.cover,
                nextRevision,
                articleId,
            ]
        )
        await insertVersionSnapshot(exec, articleId, snapshot, 'publish', userId, nextRevision)
        await pruneVersions(exec, articleId)
        return {
            found: true,
            articleId,
            revision: nextRevision,
            previousCover: article.cover ?? null,
        }
    })
}

module.exports = {
    VERSION_SOURCES,
    AUTOSAVE_SNAPSHOT_WINDOW_MINUTES,
    AUTOSAVE_RETENTION_HOURS,
    MAX_AUTOSAVE_VERSIONS_PER_ARTICLE,
    normalizeVersionSource,
    findArticleForWorkflow,
    findWorkflowState,
    saveWorkingCopy,
    listVersions,
    findVersion,
    findLatestVersion,
    restoreVersion,
    schedulePublish,
    clearSchedule,
    findDueScheduledArticles,
    listScheduledArticles,
    publishScheduledArticle,
    publishWorkingCopy,
    clearScheduledArticle,
    promoteWorkingCopy,
}
