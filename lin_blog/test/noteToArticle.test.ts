import assert from 'node:assert/strict'
import test from 'node:test'
import { buildArticleDraft, noteBodyToMarkdown } from '../src/utils/noteToArticle.ts'

test('没有标题的笔记正文补上「原始想法」小节', () => {
  const markdown = noteBodyToMarkdown('第一段\n\n第二段')
  assert.match(markdown, /^## 原始想法/)
  assert.match(markdown, /第二段$/)
})

test('已有标题的笔记保持原有结构', () => {
  const markdown = noteBodyToMarkdown('# 我的做法\n\n- 一个概念一篇')
  assert.ok(!markdown.includes('原始想法'))
  assert.match(markdown, /^# 我的做法/)
})

test('升级草稿保留正文、追加推荐双链与待补充清单', () => {
  const draft = buildArticleDraft(
    { title: '花园与博客如何分工', content: '花园和博客不是二选一。' },
    [
      { id: 6, title: '我的花园使用手册' },
      { id: 2, title: '什么是数字花园' },
    ]
  )
  assert.equal(draft.title, '花园与博客如何分工')
  assert.match(draft.content, /花园和博客不是二选一/)
  assert.match(draft.content, /## 相关笔记/)
  assert.match(draft.content, /- \[\[我的花园使用手册\]\]/)
  assert.match(draft.content, /- \[\[什么是数字花园\]\]/)
  assert.match(draft.content, /## 待补充/)
  assert.ok(draft.content.endsWith('\n'))
})

test('不重复推荐自己或重复标题', () => {
  const draft = buildArticleDraft(
    { title: '花园', content: '正文' },
    [
      { id: 1, title: '花园' },
      { id: 2, title: '双链怎么写' },
      { id: 3, title: '双链怎么写' },
    ]
  )
  assert.equal((draft.content.match(/\[\[花园\]\]/g) || []).length, 0)
  assert.equal((draft.content.match(/\[\[双链怎么写\]\]/g) || []).length, 1)
})

test('推荐超过五条时只保留前五条，空正文也能生成骨架', () => {
  const links = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, title: `相关 ${index + 1}` }))
  const draft = buildArticleDraft({ title: '新文章', content: '' }, links)
  assert.equal((draft.content.match(/^- \[\[/gm) || []).length, 5)
  assert.match(draft.content, /## 待补充/)
})

test('标题超长时截断到 150 字', () => {
  const draft = buildArticleDraft({ title: '长'.repeat(200), content: 'x' }, [])
  assert.equal(draft.title.length, 150)
})
