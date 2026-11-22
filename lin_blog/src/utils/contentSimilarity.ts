/**
 * 站内内容的轻量相似度：分词 → 带 IDF 的稀疏词频向量 → 余弦相似度。
 *
 * 不依赖外部服务与索引文件：候选集是站点自己已发布的几十到几百篇内容，
 * 在浏览器里现算完全够用，也能在没有 AI Key 时保持可用。
 * 中文按二元组切分，英文/数字按词切分；标签与分类作为高权重信号单列。
 */

export type SimilarityKind = 'article' | 'gallery' | 'diary' | 'note'

export interface SimilarityDoc {
  id: number
  kind: SimilarityKind
  title: string
  description?: string
  content?: string
  labels?: string[]
  subsetId?: number | null
}

export interface SimilarityResult<T extends SimilarityDoc> {
  doc: T
  score: number
  reasons: string[]
}

export interface SimilarityOptions {
  limit?: number
  // 同类型内容的相似度加成：延伸阅读优先推荐同类型
  sameKindBoost?: number
  // 部分站点希望花园笔记不与文章混排，可传 false
  crossKind?: boolean
}

const STOP_CHARS = new Set(['的', '了', '和', '与', '是', '在', '我', '你', '他', '它', '也', '就', '都', '而', '及'])
const CJK_PATTERN = /[\u3400-\u9fff]/g
const ASCII_WORD_PATTERN = /[a-z0-9][a-z0-9+#._-]*/g
const MARKUP_PATTERN = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi

function plainText(value?: string | null): string {
  return String(value || '')
    .replace(MARKUP_PATTERN, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .toLowerCase()
}

/**
 * 分词：中文二元组（单字串保留单字），英文/数字取完整词。
 * 统一小写，避免英文大小写制造不同维度。
 */
export function tokenize(value?: string | null): string[] {
  const text = plainText(value)
  const tokens: string[] = []

  for (const word of text.match(ASCII_WORD_PATTERN) || []) {
    if (word.length > 1) tokens.push(word)
  }

  // 汉字序列按连续片段切，避免把标点两侧的字拼成假词
  for (const segment of text.split(/[^\u3400-\u9fff]+/)) {
    const chars = segment.match(CJK_PATTERN) || []
    if (chars.length === 1) {
      if (!STOP_CHARS.has(chars[0])) tokens.push(chars[0])
      continue
    }
    for (let i = 0; i < chars.length - 1; i += 1) {
      const bigram = chars[i] + chars[i + 1]
      // 任一侧是虚词就不组成二元组：「的响」「了笔」这类组合只会稀释主题信号
      if (!STOP_CHARS.has(chars[i]) && !STOP_CHARS.has(chars[i + 1])) tokens.push(bigram)
    }
  }

  return tokens
}

export function docWeights(doc: SimilarityDoc): Map<string, number> {
  const weights = new Map<string, number>()
  const add = (token: string, weight: number) => {
    weights.set(token, (weights.get(token) || 0) + weight)
  }

  // 标题是作者对主题最密集的概括，权重最高
  for (const token of tokenize(doc.title)) add(`t:${token}`, 3)
  for (const token of tokenize(doc.description)) add(`d:${token}`, 1.5)
  for (const token of tokenize(doc.content)) add(`c:${token}`, 1)
  for (const label of doc.labels || []) {
    const name = String(label).trim().toLowerCase()
    if (name) add(`l:${name}`, 4)
  }
  if (doc.subsetId) add(`s:${doc.subsetId}`, 3)

  return weights
}

export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  // 先用同一个映射判断是否完全一致：同长度的公共键且权重相等即视为同一向量
  if (small.size === large.size) {
    let identical = true
    for (const [token, weight] of small) {
      if (large.get(token) !== weight) {
        identical = false
        break
      }
    }
    if (identical) return 1
  }
  let dot = 0
  for (const [token, weight] of small) {
    const other = large.get(token)
    if (other) dot += weight * other
  }
  if (dot === 0) return 0

  const normA = Math.sqrt([...a.values()].reduce((sum, weight) => sum + weight * weight, 0))
  const normB = Math.sqrt([...b.values()].reduce((sum, weight) => sum + weight * weight, 0))
  // 同向量的点积与范数平方相同，浮点误差会把 1 算成 0.9999999999999998，这里收口
  return Math.min(1, dot / (normA * normB || 1))
}

/**
 * 计算 IDF：出现在越多文档里的词越没有区分度。
 * 使用平滑对数，单文档语料也不会除以零。
 */
export function inverseDocumentFrequency(docs: SimilarityDoc[]): Map<string, number> {
  const df = new Map<string, number>()
  for (const doc of docs) {
    for (const token of docWeights(doc).keys()) {
      df.set(token, (df.get(token) || 0) + 1)
    }
  }
  const total = docs.length
  const idf = new Map<string, number>()
  for (const [token, count] of df) {
    idf.set(token, Math.log((total + 1) / (count + 1)) + 1)
  }
  return idf
}

function toVector(weights: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vector = new Map<string, number>()
  for (const [token, weight] of weights) {
    vector.set(token, weight * (idf.get(token) ?? 1))
  }
  return vector
}

function overlapReasons(current: SimilarityDoc, candidate: SimilarityDoc): string[] {
  const reasons: string[] = []
  const labels = new Set((current.labels || []).map(label => label.trim().toLowerCase()))
  const sharedLabels = (candidate.labels || [])
    .map(label => label.trim())
    .filter(label => labels.has(label.toLowerCase()))
  if (sharedLabels.length > 0) reasons.push(`同标签 · ${sharedLabels.slice(0, 2).join(' / ')}`)

  if (current.subsetId && current.subsetId === candidate.subsetId) reasons.push('同分类')
  if (current.kind === candidate.kind) reasons.push('同栏目')
  return reasons
}

/**
 * 返回按相似度排序的候选，过滤自身与分数过低的噪声。
 * 分数相同时按「同类型 > 同分类 > 较新 ID」收敛，保证结果稳定。
 */
export function findSimilar<T extends SimilarityDoc>(
  current: T,
  pool: T[],
  options: SimilarityOptions = {}
): SimilarityResult<T>[] {
  const limit = Math.max(0, options.limit ?? 3)
  if (limit === 0) return []
  // 加成只用于同分时的排序，不能把零相关的内容抬过噪声阈值
  const sameKindBoost = options.sameKindBoost ?? 0.04
  const crossKind = options.crossKind ?? true

  const candidates = pool.filter(doc =>
    doc.id !== current.id &&
    (crossKind || doc.kind === current.kind)
  )
  if (candidates.length === 0) return []

  const idf = inverseDocumentFrequency([current, ...candidates])
  const currentVector = toVector(docWeights(current), idf)

  const scored = candidates.map(doc => {
    let score = cosineSimilarity(currentVector, toVector(docWeights(doc), idf))
    if (doc.kind === current.kind && score > 0) score += sameKindBoost
    return { doc, score, reasons: overlapReasons(current, doc) }
  })

  // 标题完全重合或标签命中时即使正文稀疏也要留下，因此阈值取得较低
  return scored
    .filter(item => item.score >= 0.08)
    .sort((a, b) => b.score - a.score || b.doc.id - a.doc.id)
    .slice(0, limit)
}
