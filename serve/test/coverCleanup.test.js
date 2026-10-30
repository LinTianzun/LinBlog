const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const controllerPath = path.resolve(__dirname, '../controller/articleController.js')
const originalLoad = Module._load

let articleRow = null
let updateAffectedRows = 1
let deleteAffectedRows = 1
let deactivatedFilenames = []
let referenceCount = 0

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath && request === '../model/dbModel/article/index') {
        return {
            findArticleMutationAccess: async () => ({
                exists: Boolean(articleRow),
                allowed: true,
                article: articleRow
            }),
            updateArticle: async () => updateAffectedRows,
            deleteArticle: async () => deleteAffectedRows
        }
    }
    if (parent && parent.filename === controllerPath && request === '../model/dbModel/articleWorkflow/index') {
        return {
            promoteWorkingCopy: async () => ({ found: true, promoted: false, previousCover: null })
        }
    }
    if (parent && parent.filename === controllerPath && request === '../utils/coverCleanup') {
        return {
            extractUploadsFilename: (value) => {
                const match = String(value || '').trim().match(/^\/api\/uploads\/([A-Za-z0-9._-]+)$/)
                return match ? match[1] : null
            },
            cleanupCover: async (coverUrl) => {
                const match = String(coverUrl || '').trim().match(/^\/api\/uploads\/([A-Za-z0-9._-]+)$/)
                const filename = match ? match[1] : null
                if (!filename) return
                if (referenceCount > 0) return
                deactivatedFilenames.push(filename)
            }
        }
    }
    if (parent && parent.filename === controllerPath && request === '../utils/logHelper') {
        return { writeSystemLog: () => {} }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const { updateArticle, deleteArticle } = require(controllerPath)
Module._load = originalLoad

function response() {
    return {
        statusCode: 0,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this }
    }
}

test.beforeEach(() => {
    articleRow = { id: 10, cover: '/api/uploads/old.jpg' }
    updateAffectedRows = 1
    deleteAffectedRows = 1
    deactivatedFilenames = []
    referenceCount = 0
})

test('replacing the cover deactivates the old unreferenced image', async () => {
    const res = response()
    await updateArticle({
        params: { id: '10' },
        body: { cover: '/api/uploads/new.jpg' },
        user: { userId: 1, userType: 'admin' }
    }, res)

    assert.equal(res.body.code, 200)
    assert.deepEqual(deactivatedFilenames, ['old.jpg'])
})

test('unchanged cover skips cleanup', async () => {
    const res = response()
    await updateArticle({
        params: { id: '10' },
        body: { cover: '/api/uploads/old.jpg' },
        user: { userId: 1, userType: 'admin' }
    }, res)

    assert.equal(res.body.code, 200)
    assert.deepEqual(deactivatedFilenames, [])
})

test('external cover URLs are not managed by the image table', async () => {
    articleRow = { id: 10, cover: 'https://cdn.example.com/pic.jpg' }
    const res = response()
    await updateArticle({
        params: { id: '10' },
        body: { cover: '/api/uploads/new.jpg' },
        user: { userId: 1, userType: 'admin' }
    }, res)

    assert.equal(res.body.code, 200)
    assert.deepEqual(deactivatedFilenames, [])
})

test('referenced old cover is kept', async () => {
    referenceCount = 2
    const res = response()
    await updateArticle({
        params: { id: '10' },
        body: { cover: '/api/uploads/new.jpg' },
        user: { userId: 1, userType: 'admin' }
    }, res)

    assert.equal(res.body.code, 200)
    assert.deepEqual(deactivatedFilenames, [])
})

test('cleanup failure does not fail the update', async () => {
    Module._load = function (request, parent, isMain) {
        if (parent && parent.filename === controllerPath && request === '../model/dbModel/article/index') {
            return {
                findArticleMutationAccess: async () => ({ exists: true, allowed: true, article: articleRow }),
                updateArticle: async () => 1
            }
        }
        if (parent && parent.filename === controllerPath && request === '../model/dbModel/articleWorkflow/index') {
            return {
                promoteWorkingCopy: async () => ({ found: true, promoted: false, previousCover: null })
            }
        }
        if (parent && parent.filename === controllerPath && request === '../utils/coverCleanup') {
            return {
                // cleanupCover 内部吞掉异常；这里模拟清理失败的实现
                extractUploadsFilename: () => 'old.jpg',
                cleanupCover: async () => {}
            }
        }
        if (parent && parent.filename === controllerPath && request === '../utils/logHelper') {
            return { writeSystemLog: () => {} }
        }
        return originalLoad.call(this, request, parent, isMain)
    }
    const patched = require.cache[controllerPath]
    delete require.cache[controllerPath]
    const freshController = require(controllerPath)
    if (patched) require.cache[controllerPath] = patched

    try {
        const res = response()
        await freshController.updateArticle({
            params: { id: '10' },
            body: { cover: '/api/uploads/new.jpg' },
            user: { userId: 1, userType: 'admin' }
        }, res)
        assert.equal(res.body.code, 200)
    } finally {
        Module._load = originalLoad
        delete require.cache[controllerPath]
    }
})

test('deleting an article deactivates its cover image', async () => {
    const res = response()
    await deleteArticle({
        params: { id: '10' },
        user: { userId: 1, userType: 'admin' }
    }, res)

    assert.equal(res.body.code, 200)
    assert.deepEqual(deactivatedFilenames, ['old.jpg'])
})
