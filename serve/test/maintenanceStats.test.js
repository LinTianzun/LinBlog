const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const fileController = require(path.resolve(__dirname, '../controller/fileController.js'))
const fileModel = require(path.resolve(__dirname, '../model/dbModel/file/index.js'))
const imageVariants = require(path.resolve(__dirname, '../utils/imageVariants.js'))

function createRes() {
    return {
        statusCode: 0,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
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

test('variant cache tracks hits, misses and clear operations', () => {
    const before = imageVariants.variantCacheInfo()
    const key = `test-${Date.now()}-${Math.random()}`

    imageVariants.writeVariantCache(key, { data: Buffer.from('a'.repeat(64)), version: 'v1' })
    assert.equal(imageVariants.readVariantCache(key)?.data.length, 64)
    assert.equal(imageVariants.readVariantCache('missing-key'), null)

    const info = imageVariants.variantCacheInfo()
    assert.equal(info.hits, before.hits + 1)
    assert.equal(info.misses, before.misses + 1)
    assert.ok(info.hitRate !== null && info.hitRate > 0)

    const cleared = imageVariants.clearVariantCache()
    assert.equal(cleared.entries, 0)
    assert.equal(cleared.bytes, 0)
    assert.equal(cleared.clears, before.clears + 1)
    // 统计累计值保留，清缓存不会重置命中数
    assert.equal(cleared.hits, info.hits)
})

test('getMaintenanceStats exposes cache info and storage distribution', async () => {
    await withOverrides(fileModel, {
        async getStorageDistribution() {
            return {
                disk: { count: 3, bytes: 1024 },
                image: { count: 5, bytes: 2048 },
                trashDisk: { count: 1, bytes: 128 },
                trashImage: { count: 0, bytes: 0 }
            }
        }
    }, async () => {
        const res = createRes()
        await fileController.getMaintenanceStats(
            { user: { userId: 1, permissions: ['file.purge'] } },
            res
        )

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.storage.image.count, 5)
        assert.equal(res.body.data.storage.disk.bytes, 1024)
        assert.equal(typeof res.body.data.cache.entries, 'number')
        assert.equal(typeof res.body.data.cache.maxBytes, 'number')
    })
})

test('maintenance stats require the file.purge permission', async () => {
    const res = createRes()
    await fileController.getMaintenanceStats(
        { user: { userId: 2, permissions: ['file.view'] } },
        res
    )

    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 403)
})

test('clearVariantCacheAction clears the cache and writes a system log', async () => {
    const key = `clear-${Date.now()}`
    imageVariants.writeVariantCache(key, { data: Buffer.from('b'), version: 'v2' })
    assert.ok(imageVariants.variantCacheInfo().entries >= 1)

    const res = createRes()
    await fileController.clearVariantCacheAction(
        { user: { userId: 1, permissions: ['file.purge'] }, ip: '127.0.0.1' },
        res
    )

    assert.equal(res.body.code, 200)
    assert.equal(res.body.data.cache.entries, 0)
    assert.equal(imageVariants.readVariantCache(key), null)
})
