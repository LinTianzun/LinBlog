/**
 * 服务端轻量文本相似度：中文二元组 + 英文词，带 IDF 的余弦。
 * 与前端 lin_blog/src/utils/contentSimilarity.ts 保持同一口径，
 * 供摘要分组、待整理推荐等场景复用，避免各自维护一套分词。
 */

const STOP_CHARS = new Set(['的', '了', '和', '与', '是', '在', '我', '你', '他', '它', '也', '就', '都', '而', '及'])
const CJK_PATTERN = /[\u3400-\u9fff]/g
const ASCII_WORD_PATTERN = /[a-z0-9][a-z0-9+#._-]*/g
const MARKUP_PATTERN = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi

function plainText(value) {
    return String(value || '')
        .replace(MARKUP_PATTERN, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .toLowerCase()
}

function tokenize(value) {
    const text = plainText(value)
    const tokens = []
    for (const word of text.match(ASCII_WORD_PATTERN) || []) {
        if (word.length > 1) tokens.push(`w:${word}`)
    }
    for (const segment of text.split(/[^\u3400-\u9fff]+/)) {
        const chars = segment.match(CJK_PATTERN) || []
        if (chars.length === 1) {
            if (!STOP_CHARS.has(chars[0])) tokens.push(`c:${chars[0]}`)
            continue
        }
        for (let i = 0; i < chars.length - 1; i += 1) {
            if (STOP_CHARS.has(chars[i]) || STOP_CHARS.has(chars[i + 1])) continue
            tokens.push(`c:${chars[i]}${chars[i + 1]}`)
        }
    }
    return tokens
}

function weightsOf({ title, description, content, tags }) {
    const weights = new Map()
    const add = (token, weight) => weights.set(token, (weights.get(token) || 0) + weight)
    for (const token of tokenize(title)) add(token, 3)
    for (const token of tokenize(description)) add(token, 1.5)
    for (const token of tokenize(content)) add(token, 1)
    for (const tag of tags || []) {
        const name = String(tag || '').trim().toLowerCase()
        if (name) add(`t:${name}`, 4)
    }
    return weights
}

function cosine(a, b) {
    if (a.size === 0 || b.size === 0) return 0
    const [small, large] = a.size <= b.size ? [a, b] : [b, a]
    let dot = 0
    for (const [token, weight] of small) {
        const other = large.get(token)
        if (other) dot += weight * other
    }
    if (dot === 0) return 0
    let normA = 0
    let normB = 0
    for (const weight of a.values()) normA += weight * weight
    for (const weight of b.values()) normB += weight * weight
    return Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1))
}

/**
 * 一篇内容相对一组候选的相似度向量（已乘 IDF）。
 * 先用同一份语料算 IDF，再逐篇转成稀疏向量，避免两两重算词表。
 */
function buildVectors(items) {
    const weights = items.map(weightsOf)
    const df = new Map()
    for (const map of weights) {
        for (const token of map.keys()) df.set(token, (df.get(token) || 0) + 1)
    }
    const total = items.length
    const vectors = weights.map(map => {
        const vector = new Map()
        for (const [token, weight] of map) {
            const idf = Math.log((total + 1) / ((df.get(token) || 0) + 1)) + 1
            vector.set(token, weight * idf)
        }
        return vector
    })
    return vectors
}

module.exports = {
    tokenize,
    weightsOf,
    cosine,
    buildVectors,
}
