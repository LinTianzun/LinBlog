const assert = require('node:assert/strict')
const test = require('node:test')

const { groupBacklinks, groupOutgoing, groupUpgrades, hasArticleLink } = require('../utils/noteLinkIndex')

test('按目标笔记聚合入链，并保留标题与 slug', () => {
    const index = groupBacklinks([
        { toNoteId: 2, id: 10, title: 'A', slug: 'a' },
        { toNoteId: 2, id: 11, title: 'B', slug: 'b' },
        { toNoteId: 3, id: 10, title: 'A', slug: 'a' },
    ])
    assert.deepEqual(index.get(2), [
        { id: 10, title: 'A', slug: 'a' },
        { id: 11, title: 'B', slug: 'b' },
    ])
    assert.equal(index.get(3).length, 1)
    assert.equal(index.get(1), undefined)
})

test('同一来源重复引用同一目标只保留一条', () => {
    const index = groupBacklinks([
        { toNoteId: 2, id: 10, title: 'A', slug: 'a' },
        { toNoteId: 2, id: 10, title: 'A', slug: 'a' },
    ])
    assert.equal(index.get(2).length, 1)
})

test('兼容下划线字段名，并忽略非法行', () => {
    const index = groupBacklinks([
        { to_note_id: 5, id: 3, title: 'X' },
        { toNoteId: 0, id: 4, title: 'bad' },
        { toNoteId: 6, id: 0, title: 'bad' },
        { title: 'no target' },
    ])
    assert.deepEqual(index.get(5), [{ id: 3, title: 'X', slug: '' }])
    assert.equal(index.size, 1)
})

test('空输入返回空索引', () => {
    assert.equal(groupBacklinks(undefined).size, 0)
    assert.equal(groupBacklinks([]).size, 0)
})

test('出发链接按来源笔记分组，自引用与重复目标被忽略', () => {
    const index = groupOutgoing([
        { fromNoteId: 1, id: 2, title: 'B', slug: 'b' },
        { fromNoteId: 1, id: 2, title: 'B', slug: 'b' },
        { fromNoteId: 1, id: 3, title: 'C', slug: 'c' },
        { fromNoteId: 1, id: 1, title: 'self', slug: 'self' },
        { fromNoteId: 2, id: 3, title: 'C', slug: 'c' },
    ])
    assert.deepEqual(index.get(1), [
        { id: 2, title: 'B', slug: 'b' },
        { id: 3, title: 'C', slug: 'c' },
    ])
    assert.deepEqual(index.get(2), [{ id: 3, title: 'C', slug: 'c' }])
    assert.equal(groupOutgoing(undefined).size, 0)
})

test('升级关系聚合：每篇笔记只保留最新文章，断链判定按文章地址匹配', () => {
    const rows = [
        { noteId: 7, id: 21, title: '用花园整理技术笔记', state: 'published' },
        { noteId: 7, id: 20, title: '用花园整理技术笔记（旧稿）', state: 'draft' },
        { noteId: 8, id: 22, title: '另一篇', state: 'draft' },
    ]
    const index = groupUpgrades(rows)
    assert.equal(index.get(7).id, 21)
    assert.equal(index.get(8).state, 'draft')
    assert.equal(hasArticleLink('看这里 /portal/articles?open=21', 21), true)
    assert.equal(hasArticleLink('看这里 /portal/articles?open=210', 21), false)
    assert.equal(hasArticleLink('', 21), false)
})
