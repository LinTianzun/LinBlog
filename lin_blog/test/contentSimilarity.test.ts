import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cosineSimilarity,
  docWeights,
  findSimilar,
  inverseDocumentFrequency,
  tokenize,
  type SimilarityDoc,
} from '../src/utils/contentSimilarity.ts'

test('中文按二元组切分，英文按词切分并统一小写', () => {
  const tokens = tokenize('Vue 3 的响应式原理')
  assert.ok(tokens.includes('vue'))
  assert.ok(tokens.includes('响应'))
  assert.ok(tokens.includes('应式'))
  // 纯停用字组成的二元组不保留
  assert.ok(!tokens.includes('的响'))
})

test('HTML 标签与脚本不会进入分词结果', () => {
  const tokens = tokenize('<p>双链</p><script>alert(1)</script><style>.a{}</style>')
  assert.ok(tokens.includes('双链'))
  assert.ok(!tokens.some(token => token.includes('script') || token.includes('alert')))
})

test('标题权重高于正文，标签权重最高', () => {
  const weights = docWeights({
    id: 1,
    kind: 'article',
    title: '双链',
    content: '双链',
    labels: ['双链'],
    subsetId: null,
  })
  assert.ok((weights.get('t:双链') || 0) > (weights.get('c:双链') || 0))
  assert.ok((weights.get('l:双链') || 0) > (weights.get('t:双链') || 0))
})

test('余弦相似度：完全相同为 1，无交集为 0，空向量为 0', () => {
  const a = new Map([['x:双链', 1], ['y:花园', 2]])
  assert.equal(cosineSimilarity(a, a), 1)
  assert.equal(cosineSimilarity(a, new Map([['z:别的', 1]])), 0)
  assert.equal(cosineSimilarity(new Map(), a), 0)
})

test('IDF 让常见词权重低于罕见词', () => {
  const docs: SimilarityDoc[] = [
    { id: 1, kind: 'article', title: '花园笔记' },
    { id: 2, kind: 'article', title: '花园随笔' },
    { id: 3, kind: 'article', title: '花园文章' },
  ]
  const idf = inverseDocumentFrequency(docs)
  const common = idf.get('t:花园') || 0
  const rare = idf.get('t:笔记') || 0
  assert.ok(rare > common)
})

const current: SimilarityDoc = {
  id: 10,
  kind: 'article',
  title: '数字花园与双链',
  content: '用双链把笔记连成知识网络，顺便聊聊 Obsidian 的做法。',
  labels: ['知识管理'],
  subsetId: 3,
}

const pool: SimilarityDoc[] = [
  current,
  {
    id: 11,
    kind: 'article',
    title: '再谈双链笔记',
    content: 'Obsidian 的双链与反向链接实践。',
    labels: ['知识管理'],
    subsetId: 3,
  },
  {
    id: 12,
    kind: 'article',
    title: '周末去山里拍照',
    content: '光线、雾气和一只路过的猫。',
  },
  {
    id: 13,
    kind: 'note',
    title: '双链的一个小想法',
    content: '知识网络里，笔记之间的连接比分类更重要。',
    subsetId: 3,
  },
]

test('相似推荐过滤自身、按相关度排序并给出理由', () => {
  const result = findSimilar(current, pool, { limit: 3 })
  assert.deepEqual(result.map(item => item.doc.id), [11, 13])
  assert.ok(result[0].score > result[1].score)
  assert.ok(result[0].reasons.includes('同标签 · 知识管理'))
  assert.ok(result[0].reasons.includes('同分类'))
})

test('低相关度候选被噪声阈值过滤', () => {
  const only = pool.filter(doc => doc.id === 12)
  assert.deepEqual(findSimilar(current, [current, ...only]), [])
})

test('crossKind=false 时只推荐同栏目；同类型有加成', () => {
  const sameKind = findSimilar(current, pool, { crossKind: false })
  assert.deepEqual(sameKind.map(item => item.doc.id), [11])

  const withBoost = findSimilar(current, pool, { sameKindBoost: 0.5 })
  assert.equal(withBoost[0].doc.id, 11)
})

test('limit 为 0 或候选为空时返回空数组', () => {
  assert.deepEqual(findSimilar(current, pool, { limit: 0 }), [])
  assert.deepEqual(findSimilar(current, [current]), [])
})
