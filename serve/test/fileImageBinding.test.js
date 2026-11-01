// 内容图片（文章/图库/随笔上传）与「本地文件」的绑定：
// 上传后要出现在本地文件列表里，并且删除/恢复/彻底删除都能正确处理 image 表记录。
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const fileController = require(path.resolve(__dirname, '../controller/fileController.js'))
const fileModel = require(path.resolve(__dirname, '../model/dbModel/file/index.js'))
const imageModel = require(path.resolve(__dirname, '../model/dbModel/image/index.js'))
const uploadController = require(path.resolve(__dirname, '../controller/uploadController.js'))

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
            this.statusCode ||= 200
            return this
        },
        end(data) {
            this.statusCode ||= 200
            this.body = data ?? null
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

test('getFiles exposes content images with the uploads url and an image source tag', async () => {
    await withOverrides(fileModel, {
        async getFilesByPage() {
            return {
                total: 2,
                list: [
                    {
                        id: 31,
                        file_name: '1700000000-cover.jpg',
                        format: 'jpg',
                        size: 2048,
                        url: '',
                        subset_id: 2,
                        source_image_id: 9,
                        created_at: '2026-11-01 10:00:00'
                    },
                    {
                        id: 32,
                        file_name: '笔记.txt',
                        format: 'txt',
                        size: 12,
                        url: 'disk-note.txt',
                        subset_id: null,
                        source_image_id: null,
                        created_at: '2026-11-01 09:00:00'
                    }
                ]
            }
        }
    }, async () => {
        const res = createRes()
        await fileController.getFiles({ query: {}, user: { userId: 1, userType: 'admin' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.list[0].url, '/api/uploads/1700000000-cover.jpg')
        assert.equal(res.body.data.list[0].rawUrl, '/api/file/31/raw')
        assert.equal(res.body.data.list[0].source, 'image')
        assert.equal(res.body.data.list[1].url, '/api/file/32/download')
        assert.equal(res.body.data.list[1].source, 'file')
    })
})

test('getRawImage serves content images from the image table with the variant contract', async () => {
    const data = Buffer.from('content-image-bytes')
    await withOverrides(fileModel, {
        async findFileById() {
            return {
                id: 41,
                file_name: '1700000000-photo.png',
                format: 'png',
                url: '',
                source_image_id: 12,
                status: 1
            }
        }
    }, async () => {
        await withOverrides(imageModel, {
            async findImageById() {
                return {
                    id: 12,
                    filename: '1700000000-photo.png',
                    mime_type: 'image/png',
                    size: data.length,
                    checksum: 'content-checksum',
                    data,
                    status: 1
                }
            }
        }, async () => {
            const res = createRes()
            await fileController.getRawImage({ params: { id: '41' }, query: {}, headers: {} }, res)

            assert.equal(res.statusCode, 200)
            assert.equal(res.headers['Content-Type'], 'image/png')
            assert.ok(res.body.equals(data))
        })
    })
})

test('deleteFiles keeps referenced content images and deactivates the unreferenced ones', async () => {
    const deactivated = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [
                { id: 51, file_name: 'used.jpg', format: 'jpg', url: '', source_image_id: 21, status: 1 },
                { id: 52, file_name: 'free.jpg', format: 'jpg', url: '', source_image_id: 22, status: 1 }
            ]
        },
        async countFileReferences() { return 0 },
        async softDeleteFiles(ids) { return ids.length }
    }, async () => {
        await withOverrides(imageModel, {
            async countImageReferencesWithBinding(filename) {
                return filename === 'used.jpg' ? 1 : 0
            },
            async deactivateImageById(id) {
                deactivated.push(id)
                return { affectedRows: 1 }
            }
        }, async () => {
            const res = createRes()
            await fileController.deleteFiles({ body: { fileIds: [51, 52] }, params: {}, user: { userId: 1 } }, res)

            assert.equal(res.body.code, 200)
            assert.equal(res.body.data.referencedCount, 1)
            assert.equal(res.body.data.referenced[0].id, 51)
            assert.deepEqual(deactivated, [22])
        })
    })
})

test('restoreFiles reactivates the image row for content images', async () => {
    const restoredImages = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [{ id: 61, file_name: 'photo.jpg', format: 'jpg', url: '', source_image_id: 31, status: 0, backup_deleted_at: null }]
        },
        async restoreFile() { return 1 }
    }, async () => {
        await withOverrides(imageModel, {
            async restoreImageById(id) {
                restoredImages.push(id)
                return { affectedRows: 1 }
            }
        }, async () => {
            const res = createRes()
            await fileController.restoreFiles({ body: { fileIds: [61] }, user: { userId: 1 } }, res)

            assert.equal(res.body.code, 200)
            assert.equal(res.body.data.restoredCount, 1)
            assert.deepEqual(restoredImages, [31])
        })
    })
})

test('purgeTrashFiles removes the image binary for content images', async () => {
    const deletedImages = []
    await withOverrides(fileModel, {
        async findFilesByIds() {
            return [{ id: 71, file_name: 'photo.jpg', format: 'jpg', url: '', source_image_id: 41, status: 0, backup_deleted_at: null }]
        },
        async markBackupDeleted() { return 1 }
    }, async () => {
        await withOverrides(imageModel, {
            async countImageReferencesWithBinding() { return 0 },
            async deleteImageById(id) {
                deletedImages.push(id)
                return { affectedRows: 1 }
            }
        }, async () => {
            const res = createRes()
            await fileController.purgeTrashFiles({ body: { fileIds: [71] }, user: { userId: 1, user_type: 'admin' } }, res)

            assert.equal(res.body.code, 200)
            assert.equal(res.body.data.purgedCount, 1)
            assert.deepEqual(deletedImages, [41])
        })
    })
})

test('uploading an image also registers it in the local file module', async () => {
    const express = require('express')
    const app = express()
    app.post('/api/upload/image', (req, res) => uploadController.uploadImage(req, res))
    const server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))

    const bindings = []
    try {
        await withOverrides(imageModel, {
            async createImage() { return { imageId: 77 } }
        }, async () => {
            await withOverrides(fileModel, {
                async insertImageBinding(payload) {
                    bindings.push(payload)
                    return { fileId: 88 }
                }
            }, async () => {
                const form = new FormData()
                form.append('file', new Blob([Buffer.from('image-bytes')], { type: 'image/png' }), 'shot.png')
                const res = await fetch(`http://127.0.0.1:${server.address().port}/api/upload/image`, {
                    method: 'POST',
                    body: form
                })
                const body = await res.json()
                assert.equal(body.code, 200)
                assert.match(body.data.url, /^\/api\/uploads\//)
            })
        })
    } finally {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
    }

    assert.equal(bindings.length, 1)
    assert.equal(bindings[0].sourceImageId, 77)
    assert.equal(bindings[0].format, 'png')
})
