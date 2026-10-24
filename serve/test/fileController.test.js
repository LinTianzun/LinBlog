const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const fileController = require(path.resolve(__dirname, '../controller/fileController.js'))
const fileModel = require(path.resolve(__dirname, '../model/dbModel/file/index.js'))
const subsetModel = require(path.resolve(__dirname, '../model/dbModel/subset/index.js'))

function createRes() {
    return {
        statusCode: 0,
        body: null,
        headers: {},
        redirectedTo: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        },
        setHeader(key, value) {
            this.headers[key] = value
        },
        redirect(_code, url) {
            this.redirectedTo = url
            return this
        }
    }
}

function withOverrides(target, overrides, run) {
    const originals = {}
    for (const key of Object.keys(overrides)) {
        originals[key] = target[key]
        target[key] = overrides[key]
    }

    return run().finally(() => {
        for (const key of Object.keys(overrides)) {
            target[key] = originals[key]
        }
    })
}

test('getFiles maps local urls to download route and keeps remote urls', async () => {
    await withOverrides(fileModel, {
        async getFilesByPage() {
            return {
                total: 2,
                list: [
                    { id: 5, file_name: '笔记.txt', format: 'txt', size: 47, url: '1700000000-uuid.txt', subset_id: 6, created_at: '2026-10-24 10:00:00' },
                    { id: 2, file_name: '风景图.jpg', format: 'jpg', size: 100, url: 'https://picsum.photos/id/21/400', subset_id: null, created_at: '2026-10-23 10:00:00' }
                ]
            }
        }
    }, async () => {
        const res = createRes()
        await fileController.getFiles({ query: { page: '1', pageSize: '8' }, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.total, 2)
        assert.equal(res.body.data.list[0].url, '/api/file/5/download')
        assert.equal(res.body.data.list[1].url, 'https://picsum.photos/id/21/400')
        assert.equal(res.body.data.list[0].subsetId, 6)
    })
})

test('getFiles rejects invalid pagination', async () => {
    const res = createRes()
    await fileController.getFiles({ query: { pageSize: '999' }, user: { userId: 1, userType: 'admin' } }, res)

    assert.equal(res.statusCode, 400)
})

test('downloadFile redirects remote urls and 404s missing content', async () => {
    await withOverrides(fileModel, {
        async findFileById(id) {
            if (id === 2) {
                return { id: 2, file_name: 'a.jpg', format: 'jpg', url: 'https://picsum.photos/id/21/400', status: 1 }
            }
            if (id === 3) {
                return { id: 3, file_name: 'b.txt', format: 'txt', url: '..\\..\\config\\default.js', status: 1 }
            }
            return null
        }
    }, async () => {
        const remote = createRes()
        await fileController.downloadFile({ params: { id: '2' }, query: {} }, remote)
        assert.equal(remote.redirectedTo, 'https://picsum.photos/id/21/400')

        // 路径穿越被 basename 归一化后磁盘上不存在，返回 404 而不是逃出目录
        const traversal = createRes()
        await fileController.downloadFile({ params: { id: '3' }, query: {} }, traversal)
        assert.equal(traversal.statusCode, 404)

        const missing = createRes()
        await fileController.downloadFile({ params: { id: '999' }, query: {} }, missing)
        assert.equal(missing.statusCode, 404)

        const invalid = createRes()
        await fileController.downloadFile({ params: { id: 'abc' }, query: {} }, invalid)
        assert.equal(invalid.statusCode, 400)
    })
})

test('moveFiles validates target subset and file existence', async () => {
    await withOverrides(fileModel, {
        async findExistingFileIds(ids) { return ids },
        async updateFileSubset() { return 1 }
    }, async () => {
        await withOverrides(subsetModel, {
            async findSubsetById() { return null }
        }, async () => {
            const res = createRes()
            await fileController.moveFiles({ body: { fileIds: [1], subsetId: 99 } }, res)
            assert.equal(res.statusCode, 400)
        })

        const emptyRes = createRes()
        await fileController.moveFiles({ body: { fileIds: [] } }, emptyRes)
        assert.equal(emptyRes.statusCode, 400)
    })
})

test('moveFiles to uncategorized passes null subset id', async () => {
    const updated = []
    await withOverrides(fileModel, {
        async findExistingFileIds() { return [11, 12] },
        async updateFileSubset(id, subsetId) {
            updated.push([id, subsetId])
            return 1
        }
    }, async () => {
        const res = createRes()
        await fileController.moveFiles({ body: { fileIds: '11,12' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.movedCount, 2)
        assert.deepEqual(updated, [[11, null], [12, null]])
    })
})

test('deleteFiles reports 404 when nothing was deleted', async () => {
    await withOverrides(fileModel, {
        async softDeleteFiles() { return 0 }
    }, async () => {
        const res = createRes()
        await fileController.deleteFiles({ body: { fileIds: [404] }, params: {} }, res)
        assert.equal(res.statusCode, 404)
    })
})

test('getFileSummary returns all, uncategorized and subset counts', async () => {
    await withOverrides(fileModel, {
        async countFilesSummary() { return { total: 22, uncategorized: 4 } },
        async getSubsetCounts() {
            return [
                { id: 6, name: '软件工具', classify: 'resource', sort: 10, moment: '2026-10-23', value: 9 },
                { id: 7, name: '学习资料', classify: 'resource', sort: 9, moment: '2026-10-23', value: 9 }
            ]
        }
    }, async () => {
        const res = createRes()
        await fileController.getFileSummary({ query: {}, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.all, 22)
        assert.equal(res.body.data.uncategorized, 4)
        assert.equal(res.body.data.subsets.length, 2)
    })
})
