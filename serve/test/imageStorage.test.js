const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const sharp = require('sharp')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const db = require(path.resolve(__dirname, '../model/db/dbnew.js'))
const uploadController = require(path.resolve(__dirname, '../controller/uploadController.js'))
const imageModel = require(path.resolve(__dirname, '../model/dbModel/image/index.js'))

function createRes() {
    return {
        statusCode: 0,
        body: null,
        headers: {},
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        },
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value
        },
        end(data) {
            this.statusCode ||= 200
            this.body = data ?? null
            return this
        }
    }
}

test('image migration creates the image table when it is missing', async () => {
    const calls = []
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })

        if (sql.includes('FROM information_schema.TABLES')) {
            return []
        }

        return []
    }

    await assert.doesNotReject(() => db.runMigrations(exec))
    assert(calls.some((call) => call.sql.includes('CREATE TABLE IF NOT EXISTS image')))
})

test('image metadata and binary can be stored and read back', async () => {
    const originalFind = imageModel.findActiveImageByFilename
    const data = Buffer.from('image-bytes')

    let modelCalled = false
    imageModel.findActiveImageByFilename = async (filename) => {
        modelCalled = true
        return [{
        filename,
        mime_type: 'image/png',
        size: data.length,
        data
        }]
    }

    try {
        const res = createRes()
        const result = uploadController.getImage({ params: { filename: 'test.png' } }, res)

        await result
        assert.equal(modelCalled, true)

        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['content-type'], 'image/png')
        assert.equal(res.headers['content-length'], data.length)
        assert.ok(res.body.equals(data))
    } finally {
        imageModel.findActiveImageByFilename = originalFind
    }
})

test('image variants are resized, converted to webp and reused from cache', async () => {
    const originalFind = imageModel.findActiveImageByFilename
    const data = await sharp({
        create: {
            width: 640,
            height: 384,
            channels: 3,
            background: { r: 28, g: 96, b: 120 }
        }
    }).png().toBuffer()
    let modelCalls = 0

    imageModel.findActiveImageByFilename = async (filename) => {
        modelCalls += 1
        return [{
            filename,
            mime_type: 'image/png',
            size: data.length,
            checksum: 'variant-checksum',
            data
        }]
    }

    try {
        const request = {
            params: { filename: 'variant.png' },
            query: { w: '320', format: 'webp' },
            headers: {}
        }
        const first = createRes()
        await uploadController.getImage(request, first)

        assert.equal(first.statusCode, 200)
        assert.equal(first.headers['content-type'], 'image/webp')
        assert.equal(modelCalls, 1)

        const metadata = await sharp(first.body).metadata()
        assert.equal(metadata.format, 'webp')
        assert.equal(metadata.width, 320)

        const second = createRes()
        await uploadController.getImage(request, second)

        assert.equal(second.statusCode, 200)
        assert.equal(second.headers['content-type'], 'image/webp')
        assert.equal(modelCalls, 1, '同尺寸缩略图应从内存缓存直接返回')
    } finally {
        imageModel.findActiveImageByFilename = originalFind
    }
})

test('image variants return 304 when the cached ETag still matches', async () => {
    const originalFind = imageModel.findActiveImageByFilename
    const data = await sharp({
        create: {
            width: 640,
            height: 384,
            channels: 3,
            background: { r: 80, g: 44, b: 120 }
        }
    }).png().toBuffer()

    imageModel.findActiveImageByFilename = async (filename) => [{
        filename,
        mime_type: 'image/png',
        size: data.length,
        checksum: 'etag-checksum',
        data
    }]

    try {
        const request = {
            params: { filename: 'etag-variant.png' },
            query: { w: '720', format: 'webp' },
            headers: {}
        }
        const first = createRes()
        await uploadController.getImage(request, first)

        assert.equal(first.statusCode, 200)
        assert.equal(first.headers['content-type'], 'image/webp')
        assert.ok(first.headers.etag)

        const second = createRes()
        await uploadController.getImage({
            ...request,
            headers: { 'if-none-match': first.headers.etag }
        }, second)

        assert.equal(second.statusCode, 304)
        assert.equal(second.body, null)
        assert.equal(second.headers.etag, first.headers.etag)
    } finally {
        imageModel.findActiveImageByFilename = originalFind
    }
})

test('invalid image filenames are rejected before querying the database', async () => {
    const originalFind = imageModel.findActiveImageByFilename
    let queried = false

    imageModel.findActiveImageByFilename = async () => {
        queried = true
        return []
    }

    try {
        const res = createRes()
        await uploadController.getImage({ params: { filename: '../secret.png' } }, res)

        assert.equal(res.statusCode, 400)
        assert.equal(res.body.code, 400)
        assert.equal(queried, false)
    } finally {
        imageModel.findActiveImageByFilename = originalFind
    }
})

test('unsupported image variant widths are rejected before querying the database', async () => {
    const originalFind = imageModel.findActiveImageByFilename
    let queried = false

    imageModel.findActiveImageByFilename = async () => {
        queried = true
        return []
    }

    try {
        const res = createRes()
        await uploadController.getImage({
            params: { filename: 'test.png' },
            query: { w: '99999', format: 'webp' },
            headers: {}
        }, res)

        assert.equal(res.statusCode, 400)
        assert.equal(res.body.code, 400)
        assert.equal(queried, false)
    } finally {
        imageModel.findActiveImageByFilename = originalFind
    }
})
