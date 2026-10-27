const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const fileController = require(path.resolve(__dirname, '../controller/fileController.js'))
const fileModel = require(path.resolve(__dirname, '../model/dbModel/file/index.js'))
const subsetModel = require(path.resolve(__dirname, '../model/dbModel/subset/index.js'))
const fileStorage = require(path.resolve(__dirname, '../utils/fileStorage.js'))
const defaultOffsite = require(path.resolve(__dirname, '../utils/fileOffsite.js')).defaultOffsite

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
        async findFilesByIds() { return [] },
        async softDeleteFiles() { return 0 }
    }, async () => {
        const res = createRes()
        await fileController.deleteFiles({ body: { fileIds: [404] }, params: {} }, res)
        assert.equal(res.statusCode, 404)
    })
})

test('deleteFiles moves local files to backup after soft deleting records', async () => {
    const backedUp = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [
                { id: 1, url: 'local-file.txt', status: 1 },
                { id: 2, url: 'https://example.test/remote.png', status: 1 }
            ]
        },
        async softDeleteFiles() { return 2 }
    }, async () => {
        await withOverrides(fileStorage, {
            async moveToBackup(name) {
                backedUp.push(name)
                return { moved: true, reason: null }
            }
        }, async () => {
            const res = createRes()
            await fileController.deleteFiles({ body: { fileIds: [1, 2] }, params: {}, user: { userId: 1 } }, res)

            assert.equal(res.body.code, 200)
            assert.equal(res.body.data.deletedCount, 2)
            assert.equal(res.body.data.backedUpCount, 1)
            assert.deepEqual(backedUp, ['local-file.txt'])
        })
    })
})

test('restoreFiles restores the disk file and database record', async () => {
    const restoredIds = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [{ id: 7, url: 'restore-me.txt', status: 0, backup_deleted_at: null }]
        },
        async restoreFile(id) {
            restoredIds.push(id)
            return 1
        }
    }, async () => {
        await withOverrides(fileStorage, {
            async restoreFromBackup() { return { restored: true, reason: null } }
        }, async () => {
            const res = createRes()
            await fileController.restoreFiles({ body: { fileIds: [7] }, user: { userId: 1 } }, res)

            assert.equal(res.body.code, 200)
            assert.equal(res.body.data.restoredCount, 1)
            assert.deepEqual(restoredIds, [7])
        })
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

test('getTrashFiles rejects invalid pagination and formats deleted rows', async () => {
    const invalid = createRes()
    await fileController.getTrashFiles({ query: { pageSize: '999' }, user: { userId: 1 } }, invalid)
    assert.equal(invalid.statusCode, 400)

    await withOverrides(fileModel, {
        async getDeletedFilesByPage() {
            return {
                total: 1,
                list: [{
                    id: 4,
                    file_name: '旧文件.txt',
                    format: 'txt',
                    size: 10,
                    url: 'old-file.txt',
                    subset_id: null,
                    created_at: '2026-10-20 10:00:00',
                    deleted_at: '2026-10-27 10:00:00'
                }]
            }
        }
    }, async () => {
        await withOverrides(fileStorage, {
            async backupExists() { return true }
        }, async () => {
            const res = createRes()
            await fileController.getTrashFiles({ query: {}, user: { userId: 1 } }, res)

            assert.equal(res.body.code, 200)
            assert.equal(res.body.data.total, 1)
            assert.equal(res.body.data.list[0].url, '/api/file/4/download')
            assert.equal(res.body.data.list[0].recoverable, true)
        })
    })
})

test('restoreFiles rejects empty selection and non-restorable files', async () => {
    const empty = createRes()
    await fileController.restoreFiles({ body: { fileIds: [] }, user: { userId: 1 } }, empty)
    assert.equal(empty.statusCode, 400)

    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [{ id: 3, url: 'purged.bin', status: 0, backup_deleted_at: '2026-10-27 10:00:00' }]
        }
    }, async () => {
        const res = createRes()
        await fileController.restoreFiles({ body: { fileIds: [3] }, user: { userId: 1 } }, res)
        assert.equal(res.statusCode, 404)
    })
})

test('restoreFiles rolls the disk file back when the record cannot be restored', async () => {
    const rolledBack = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [{ id: 5, url: 'race.txt', status: 0, backup_deleted_at: null }]
        },
        async restoreFile() { return 0 }
    }, async () => {
        await withOverrides(fileStorage, {
            async restoreFromBackup() { return { restored: true, reason: null } },
            async moveToBackup(name) { rolledBack.push(name); return { moved: true, reason: null } }
        }, async () => {
            const res = createRes()
            await fileController.restoreFiles({ body: { fileIds: [5] }, user: { userId: 1 } }, res)

            assert.equal(res.statusCode, 409)
            assert.equal(res.body.data.restoredCount, 0)
            assert.deepEqual(rolledBack, ['race.txt'])
        })
    })
})

test('cleanupFiles rejects non-admins and delegates to the lifecycle task', async () => {
    const forbidden = createRes()
    await fileController.cleanupFiles({ body: {}, user: { userId: 2, user_type: 'normal' } }, forbidden)
    assert.equal(forbidden.statusCode, 403)

    const unauthorized = createRes()
    await fileController.cleanupFiles({ body: {}, user: undefined }, unauthorized)
    assert.equal(unauthorized.statusCode, 403)

    // 清理实现在模块内直接引用模型与存储对象，替身打在对应模块上即可覆盖真实库访问
    await withOverrides(fileModel, {
        async findLocalFileReferences() { return [] },
        async findExpiredDeletedFiles() { return [] },
        async markBackupDeleted() { return 0 }
    }, async () => {
        await withOverrides(fileStorage, {
            async listActiveFiles() { return [] }
        }, async () => {
            const res = createRes()
            await fileController.cleanupFiles(
                { body: { dryRun: true }, user: { userId: 1, user_type: 'admin' }, ip: '127.0.0.1' },
                res
            )

            assert.equal(res.body.code, 200)
            assert.equal(res.body.data.dryRun, true)
        })
    })
})

test('purgeTrashFiles is admin-only and removes backup before marking the record', async () => {
    const forbidden = createRes()
    await fileController.purgeTrashFiles(
        { body: { fileIds: [9] }, user: { userId: 2, user_type: 'normal' } },
        forbidden
    )
    assert.equal(forbidden.statusCode, 403)

    const empty = createRes()
    await fileController.purgeTrashFiles(
        { body: { fileIds: [] }, user: { userId: 1, user_type: 'admin' } },
        empty
    )
    assert.equal(empty.statusCode, 400)

    const removed = []
    const offsiteRemoved = []
    const marked = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [
                { id: 9, url: 'purge-me.bin', status: 0, backup_deleted_at: null },
                { id: 10, url: 'https://example.test/remote.png', status: 0, backup_deleted_at: null },
                { id: 11, url: 'already-purged.bin', status: 0, backup_deleted_at: '2026-10-27 10:00:00' }
            ]
        },
        async markBackupDeleted(ids) { marked.push(...ids); return ids.length }
    }, async () => {
        await withOverrides(defaultOffsite, {
            async remove(name) {
                offsiteRemoved.push(name)
                return { removed: 0, failed: [] }
            }
        }, async () => {
            await withOverrides(fileStorage, {
                async removeBackup(name) { removed.push(name); return true }
            }, async () => {
                const res = createRes()
                await fileController.purgeTrashFiles(
                    { body: { fileIds: [9, 10, 11] }, user: { userId: 1, user_type: 'admin' }, ip: '127.0.0.1' },
                    res
                )

                assert.equal(res.body.code, 200)
                assert.equal(res.body.data.purgedCount, 2)
                assert.deepEqual(offsiteRemoved, ['purge-me.bin'])
                assert.deepEqual(removed, ['purge-me.bin'])
                assert.deepEqual(marked, [9, 10])
            })
        })
    })
})

test('purgeTrashFiles keeps local backup when offsite removal fails', async () => {
    const removed = []
    const marked = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [{ id: 31, url: 'offsite-locked.bin', status: 0, backup_deleted_at: null }]
        },
        async markBackupDeleted(ids) { marked.push(...ids); return ids.length }
    }, async () => {
        await withOverrides(defaultOffsite, {
            async remove() {
                return { removed: 0, failed: [{ type: 's3', reason: 'AccessDenied' }] }
            }
        }, async () => {
            await withOverrides(fileStorage, {
                async removeBackup(name) { removed.push(name); return true }
            }, async () => {
                const res = createRes()
                await fileController.purgeTrashFiles(
                    { body: { fileIds: [31] }, user: { userId: 1, user_type: 'admin' } },
                    res
                )

                assert.equal(res.statusCode, 409)
                assert.equal(res.body.data.purgedCount, 0)
                assert.equal(res.body.data.failed[0].reason, 'offsite_remove_failed')
                assert.deepEqual(removed, [])
                assert.deepEqual(marked, [])
            })
        })
    })
})

test('purgeTrashFiles keeps the record when backup removal fails', async () => {
    const marked = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [
                { id: 21, url: 'locked.bin', status: 0, backup_deleted_at: null },
                { id: 22, url: 'ok.bin', status: 0, backup_deleted_at: null }
            ]
        },
        async markBackupDeleted(ids) { marked.push(...ids); return ids.length }
    }, async () => {
        await withOverrides(fileStorage, {
            async removeBackup(name) {
                if (name === 'locked.bin') throw new Error('EBUSY')
                return true
            }
        }, async () => {
            const res = createRes()
            await fileController.purgeTrashFiles(
                { body: { fileIds: [21, 22] }, user: { userId: 1, user_type: 'admin' } },
                res
            )

            assert.equal(res.body.data.purgedCount, 1)
            assert.equal(res.body.data.failedCount, 1)
            assert.equal(res.body.data.failed[0].id, 21)
            assert.deepEqual(marked, [22])
        })
    })
})

test('getStorageStatus is admin-only and returns capacity plus offsite config', async () => {
    const forbidden = createRes()
    await fileController.getStorageStatus(
        { user: { userId: 2, user_type: 'editor' } },
        forbidden
    )
    assert.equal(forbidden.statusCode, 403)

    const res = createRes()
    await fileController.getStorageStatus(
        { user: { userId: 1, user_type: 'admin' } },
        res
    )
    assert.equal(res.body.code, 200)
    assert.ok(Number.isFinite(res.body.data.usedBytes))
    assert.ok(Number.isFinite(res.body.data.maxBytes))
    assert.ok(['ok', 'warning', 'critical'].includes(res.body.data.level))
})
