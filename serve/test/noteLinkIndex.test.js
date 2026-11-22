const assert = require('node:assert/strict')
const test = require('node:test')

const { groupBacklinks, groupOutgoing } = require('../utils/noteLinkIndex')

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
