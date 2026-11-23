const { extractNoteLinks, normalizeLinkTitle, excerptMarkdown } = require('./noteMarkdown')
const { tokenize, weightsOf: noteWeights, cosine } = require('./textSimilarity')

function overlapReasons(current, candidate) {
    const reasons = []
    const tags = new Set(current.tags || [])
    const shared = (candidate.tags || []).filter(tag => tags.has(tag))
    if (shared.length > 0) reasons.push(`同标签 · ${shared.slice(0, 2).join(' / ')}`)
    return reasons
}

function extractArticleLinkIds(content) {
    const ids = new Set()
    const pattern = /\/portal\/articles\?open=(\d+)/g
    let match
    while ((match = pattern.exec(String(content || ''))) !== null) {
        const id = Number(match[1])
        if (Number.isSafeInteger(id) && id > 0) ids.add(id)
    }
    return [...ids]
}

/**
 * 推荐把一篇待整理笔记连向哪些笔记。
 *
 * 评分来自三块：标题/正文/标签的相似度（主信号）、目标已有的被引用数
 * （连向枢纽更容易让新笔记被找到）、以及目标标题是否已在正文中提到。
 * 候选池可以混入已发布文章；这类目标标成长文，复制的是门户链接。
 * 已链接过的目标不再推荐，避免给出“你已经连过了”的建议。
 */
function suggestTargets(note, pool, limit = 3) {
    const self = {
        ...note,
        tags: note.tags || [],
    }
    const selfWeights = noteWeights(self)
    const existingNotes = new Set(note.linkedIds || [])
    const existingArticles = new Set(note.linkedArticleIds || [])
    const scored = []

    for (const candidate of pool) {
        if (!candidate) continue
        const target = { ...candidate, tags: candidate.tags || [] }
        const isArticle = target.kind === 'article'
        if (!isArticle && Number(target.id) === Number(note.id)) continue
        if (isArticle ? existingArticles.has(Number(target.id)) : existingNotes.has(Number(target.id))) {
            continue
        }
        const base = cosine(selfWeights, noteWeights(target))
        const hubBonus = Math.min(0.08, Math.log2(1 + Number(target.incomingLinks || 0)) * 0.03)
        const haystack = `${note.title}\n${note.content || ''}`
        const mentionBonus = target.title && haystack.includes(target.title) ? 0.3 : 0
        const score = base + hubBonus + mentionBonus
        if (score < 0.08) continue
        scored.push({
            id: Number(target.id),
            key: `${isArticle ? 'article' : 'note'}:${Number(target.id)}`,
            title: target.title,
            excerpt: excerptMarkdown(target.content, 80),
            incomingLinks: Number(target.incomingLinks || 0),
            kind: isArticle ? 'article' : 'note',
            url: isArticle ? `/portal/articles?open=${Number(target.id)}` : null,
            score: Number(score.toFixed(3)),
            reasons: [
                ...overlapReasons(self, target),
                ...(isArticle ? ['长文'] : []),
                ...(mentionBonus > 0 ? ['正文已提到标题'] : []),
                ...(hubBonus >= 0.06 ? ['被引用较多'] : []),
            ],
        })
    }

    return scored
        .sort((a, b) => b.score - a.score || b.incomingLinks - a.incomingLinks || a.id - b.id)
        .slice(0, limit)
}

/**
 * 汇总「待整理」清单：
 * - 无任何链接的笔记（没有出发、也没有反向链接）
 * - 正文里有断链（指向未发布或不存在的标题）
 * 每篇都带上推荐连接的标题，以及断链清单。
 */
function buildTidyReport(notes, { limit = 3, articles = [] } = {}) {
    const publicNotes = notes
        .filter(note => note.state === 'published')
        .map(note => ({ ...note, tags: note.tags || [] }))
    const titleToId = new Map(
        publicNotes.map(note => [normalizeLinkTitle(note.title), note.id])
    )

    const linkedIds = new Map()
    const missingByNote = new Map()
    for (const note of publicNotes) {
        const { titles, ids } = extractNoteLinks(note.content)
        const resolved = new Set(ids)
        const missing = []
        for (const title of titles) {
            const id = titleToId.get(normalizeLinkTitle(title))
            if (id) resolved.add(id)
            else missing.push(title)
        }
        const linked = [...resolved].filter(id => id !== note.id)
        linkedIds.set(note.id, linked)
        if (missing.length > 0) missingByNote.set(note.id, missing)
    }

    const orphans = publicNotes.filter(note => (
        Number(note.outgoingLinks || 0) === 0 && Number(note.incomingLinks || 0) === 0
    ))
    const broken = publicNotes.filter(note => missingByNote.has(note.id))

    const articlePool = (Array.isArray(articles) ? articles : [])
        .map(article => ({
            ...article,
            kind: 'article',
            description: article.introduce || '',
            incomingLinks: 0,
        }))

    const withSuggestions = note => {
        const linked = linkedIds.get(note.id) || []
        const linkedArticleIds = extractArticleLinkIds(note.content)
        return {
            id: Number(note.id),
            title: note.title,
            excerpt: excerptMarkdown(note.content, 100),
            tags: note.tags,
            outgoingLinks: Number(note.outgoingLinks || 0),
            incomingLinks: Number(note.incomingLinks || 0),
            updatedAt: note.updatedAt,
            missingLinks: missingByNote.get(note.id) || [],
            suggestions: suggestTargets(
                { ...note, linkedIds: linked, linkedArticleIds },
                [
                    ...publicNotes.filter(item => item.id !== note.id),
                    ...articlePool,
                ],
                limit
            ),
        }
    }

    return {
        orphans: orphans.map(withSuggestions),
        brokenLinks: broken.map(withSuggestions),
        summary: {
            published: publicNotes.length,
            orphan: orphans.length,
            broken: broken.length,
        },
    }
}

module.exports = {
    tokenize,
    suggestTargets,
    buildTidyReport,
}
