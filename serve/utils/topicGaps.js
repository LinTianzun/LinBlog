/**
 * 零结果搜索反哺选题：把「访客搜了但没有结果」的词，
 * 和站点已有内容的标题/摘要做一个轻量匹配，
 * 得出每个词对应的状态与建议动作。
 *
 * 只做标题与前 300 字的相似度，不读全文：
 * - matched：站内其实有内容，但关键词对不上（叫法不一致）
 * - weak：有一点点相关，适合补连接或补一段说明
 * - gap：完全没有相关内容，是真正的选题缺口
 */

const { cosine, tokenize, weightsOf } = require('./textSimilarity')

const MAX_RELATED = 3
const SNIPPET_LENGTH = 300

function normalizeTopic(row) {
    const keyword = String(row?.keyword || '').trim()
    if (!keyword) return null
    return {
        keyword,
        searches: Math.max(0, Number(row.searches) || 0),
        zeroResults: Math.max(0, Number(row.zeroResults) || 0),
        lastAt: row.lastAt || null,
    }
}

function toDoc(item) {
    return {
        id: Number(item.id) || 0,
        kind: item.kind === 'note' ? 'note' : 'article',
        title: String(item.title || ''),
        description: String(item.description || '').slice(0, SNIPPET_LENGTH),
        labels: Array.isArray(item.labels) ? item.labels : [],
    }
}

/**
 * @param {Array<{keyword:string, searches:number, zeroResults:number, lastAt?:string}>} rows
 * @param {Array<{id:number, kind?:string, title:string, description?:string, labels?:string[]}>} corpus
 */
function buildTopicGaps(rows, corpus, { limit = 10, threshold = 0.12 } = {}) {
    const topics = (Array.isArray(rows) ? rows : [])
        .map(normalizeTopic)
        .filter(topic => topic && topic.zeroResults > 0)

    const docs = (Array.isArray(corpus) ? corpus : []).map(toDoc).filter(doc => doc.title)
    const docWeights = docs.map(doc => weightsOf({
        title: doc.title,
        description: doc.description,
        tags: doc.labels,
    }))
    // 查询侧与文档侧共用词表：IDF 由当前语料估算，零结果词不在语料里时权重自然偏低
    const vocabulary = new Map()
    for (const weights of docWeights) {
        for (const [token, weight] of weights) {
            if (!vocabulary.has(token)) vocabulary.set(token, weight)
        }
    }

    const items = topics.map(topic => {
        const queryTokens = tokenize(topic.keyword)
        const query = new Map(queryTokens.map(token => [token, vocabulary.get(token) || 1]))
        const related = docs
            .map((doc, index) => ({
                id: doc.id,
                kind: doc.kind,
                title: doc.title,
                score: Math.round(cosine(query, docWeights[index]) * 1000) / 1000,
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.id - b.id)
            .slice(0, MAX_RELATED)

        const best = related[0]?.score || 0
        const status = best >= threshold ? 'matched' : best >= threshold / 2 ? 'weak' : 'gap'
        return { ...topic, status, bestScore: best, related }
    })

    // 缺口优先：先列出真正没人写的题，再是按搜索次数排序的失配词
    const order = { gap: 0, weak: 1, matched: 2 }
    return items
        .sort((a, b) =>
            (order[a.status] - order[b.status]) ||
            (b.zeroResults - a.zeroResults) ||
            (b.searches - a.searches) ||
            a.keyword.localeCompare(b.keyword)
        )
        .slice(0, Math.max(1, limit))
}

function summarizeTopicGaps(items) {
    const list = Array.isArray(items) ? items : []
    return {
        total: list.length,
        gap: list.filter(item => item.status === 'gap').length,
        weak: list.filter(item => item.status === 'weak').length,
        matched: list.filter(item => item.status === 'matched').length,
    }
}

module.exports = { buildTopicGaps, summarizeTopicGaps }
