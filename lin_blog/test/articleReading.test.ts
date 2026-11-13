import assert from 'node:assert/strict'
import test from 'node:test'
import {
  prepareArticleContent,
  stripArticleHtml,
} from '../src/utils/articleReading.ts'

test('正文标题生成稳定锚点并输出目录', () => {
  const result = prepareArticleContent(
    '<h2>第一节</h2><p>内容</p><h3>小节 <code>示例</code></h3>'
  )

  assert.match(result.html, /<h2 id="article-heading-1">第一节<\/h2>/)
  assert.match(result.html, /<h3 id="article-heading-2">/)
  assert.deepEqual(result.outline, [
    { id: 'article-heading-1', text: '第一节', level: 2 },
    { id: 'article-heading-2', text: '小节 示例', level: 3 },
  ])
})

test('标题已有 id 时原样保留，不被 reserved 集合误加后缀', () => {
  const result = prepareArticleContent(
    '<h2 id="intro" class="section">简介</h2><p id="summary">正文</p>'
  )

  assert.match(result.html, /<h2 id="intro" class="section">简介<\/h2>/)
  assert.equal(result.outline[0]?.id, 'intro')
})

test('重复标题 id 依次生成后缀，目录不会指向同一位置', () => {
  const result = prepareArticleContent(
    '<h2 id="intro">一</h2><h2 id="intro">二</h2><h2 id="intro">三</h2>'
  )

  assert.deepEqual(
    result.outline.map((item) => item.id),
    ['intro', 'intro-2', 'intro-3']
  )
  assert.match(result.html, /<h2 id="intro-2">二<\/h2>/)
  assert.match(result.html, /<h2 id="intro-3">三<\/h2>/)
})

test('自动锚点会避让正文中非标题元素的 id', () => {
  const result = prepareArticleContent(
    '<div id="article-heading-2">占位</div><h2 id="article-heading-2">标题</h2><h2>第二节</h2>'
  )

  assert.deepEqual(
    result.outline.map((item) => item.id),
    ['article-heading-2', 'article-heading-2-2']
  )
})

test('目录文本解码 HTML 实体并忽略空标题', () => {
  const result = prepareArticleContent(
    '<h2>&nbsp;</h2><h2>Tom &amp; Jerry &#39;25</h2>'
  )

  assert.equal(result.outline.length, 1)
  assert.equal(result.outline[0]?.text, "Tom & Jerry '25")
  assert.match(result.html, /<h2>&nbsp;<\/h2>/)
})

test('stripArticleHtml 保留可读文本', () => {
  assert.equal(
    stripArticleHtml('<p>Hello <strong>world</strong>&nbsp;!</p>'),
    'Hello world !'
  )
})
