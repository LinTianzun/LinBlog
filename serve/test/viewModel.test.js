const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const viewModelPath = path.resolve(__dirname, '../model/dbModel/view/index.js')
const originalLoad = Module._load

// 用脚本化的 query 替身驱动 recordView，覆盖去重命中/未命中两条路径
let calls = []
let scriptedViews = 3
let recentRows = []

const fakeDb = {
    async query(sql, values = []) {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), values })

        if (sql.includes('SELECT id FROM view_log')) return recentRows
        if (sql.includes('AS views FROM')) return [{ views: scriptedViews }]
        if (sql.includes('INSERT INTO view_log')) return { insertId: 1 }
        if (sql.includes('UPDATE ')) return { affectedRows: 1 }
        if (sql.includes('DELETE FROM view_log')) return { affectedRows: 0 }
        return []
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === viewModelPath && request === '../../db/dbnew') {
        return fakeDb
    }
    return originalLoad.call(this, request, parent, isMain)
}

const viewModel = require(viewModelPath)
Module._load = originalLoad

test.beforeEach(() => {
    calls = []
    scriptedViews = 3
    recentRows = []
})

test('未知目标类型直接跳过，不查库', async () => {
    const result = await viewModel.recordView('file', 1, 'ip:1.1.1.1')

    assert.deepEqual(result, { counted: false, views: null })
    assert.equal(calls.length, 0)
})

test('gallery 归一化到 image 并落到 article 表', async () => {
    const result = await viewModel.recordView('gallery', 5, 'ip:1.1.1.1')

    assert.equal(result.counted, true)
    assert.equal(result.views, 3)
    // 去重查询仍用原始类型入参
    const first = calls[0]
    assert.equal(first.values[0], 'gallery')
    assert.equal(first.values[1], 5)
    assert.match(calls[1].sql, /INSERT INTO view_log/)
    assert.match(calls[2].sql, /UPDATE article SET views = views \+ 1 WHERE id = \?/)
})

test('首次浏览写入 view_log 并自增 article.views', async () => {
    const result = await viewModel.recordView('article', 5, 'u:7')

    assert.equal(result.counted, true)
    assert.match(calls[1].sql, /INSERT INTO view_log/)
    assert.deepEqual(calls[1].values, ['article', 5, 'u:7'])
    assert.match(calls[2].sql, /UPDATE article SET views = views \+ 1/)
})

test('diary 浏览自增 diary.views', async () => {
    const result = await viewModel.recordView('diary', 9, 'ip:1.1.1.1')

    assert.equal(result.counted, true)
    assert.match(calls[2].sql, /UPDATE diary SET views = views \+ 1/)
})

test('去重窗口命中时只回读浏览量，不自增', async () => {
    recentRows = [{ id: 11 }]
    const result = await viewModel.recordView('article', 5, 'u:7')

    assert.equal(result.counted, false)
    assert.equal(result.views, 3)
    assert.ok(!calls.some(call => call.sql.includes('INSERT INTO view_log')))
    assert.ok(!calls.some(call => call.sql.includes('UPDATE article')))
})

test('目标不存在时回读返回 null', async () => {
    const emptyDb = {
        async query(sql) {
            if (sql.includes('SELECT id FROM view_log')) return []
            if (sql.includes('AS views FROM')) return []
            return { insertId: 1, affectedRows: 1 }
        }
    }
    Module._load = function (request, parent, isMain) {
        if (parent && parent.filename === viewModelPath && request === '../../db/dbnew') {
            return emptyDb
        }
        return originalLoad.call(this, request, parent, isMain)
    }
    delete require.cache[viewModelPath]
    const freshModel = require(viewModelPath)
    delete require.cache[viewModelPath]
    Module._load = originalLoad

    const result = await freshModel.recordView('article', 999, 'ip:1.1.1.1')
    assert.equal(result.views, null)
})

test('计数后触发过期记录清理', async () => {
    await viewModel.recordView('article', 5, 'u:7')

    const pruneCall = calls.find(call => call.sql.includes('DELETE FROM view_log'))
    assert.ok(pruneCall, '应触发 view_log 清理')
    assert.ok(pruneCall.values[2] > 0)
})

test('清理失败不影响计数结果', async () => {
    const failDb = {
        async query(sql, values = []) {
            if (sql.includes('SELECT id FROM view_log')) return []
            if (sql.includes('AS views FROM')) return [{ views: 12 }]
            if (sql.includes('DELETE FROM view_log')) throw new Error('清理失败')
            return { insertId: 1, affectedRows: 1 }
        }
    }
    Module._load = function (request, parent, isMain) {
        if (parent && parent.filename === viewModelPath && request === '../../db/dbnew') {
            return failDb
        }
        return originalLoad.call(this, request, parent, isMain)
    }
    delete require.cache[viewModelPath]
    const freshModel = require(viewModelPath)
    delete require.cache[viewModelPath]
    Module._load = originalLoad

    const result = await freshModel.recordView('article', 5, 'u:7')
    assert.equal(result.counted, true)
    assert.equal(result.views, 12)
})
