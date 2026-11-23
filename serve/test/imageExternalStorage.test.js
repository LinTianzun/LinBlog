const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_IMAGE_EXTERNAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'linblog-image-external-'))

process.env.LINBLOG_JWT_SECRET = process.env.LINBLOG_JWT_SECRET || 'image-external-test-secret-at-least-32-chars'

const imageModel = require(path.resolve(__dirname, '../model/dbModel/image/index.js'))
const {
    EXTERNAL_STORAGE_DIR,
    externalKey,
    externalPath,
    readImageBytes,
    writeExternalFile,
    markImageExternal,
} = require(path.resolve(__dirname, '../utils/imageStorage.js'))

function makeImage({ id = 1, checksum = 'a'.repeat(64), data = Buffer.from('demo') }) {
    return { id, checksum, data, storage_backend: 'db', storage_key: null }
}

test('external storage keys are deterministic and path-safe', () => {
    const image = makeImage({ checksum: 'ab' + 'c'.repeat(62) })
    const key = externalKey(image)
    assert.equal(key, 'ab/abcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.bin')
    assert.equal(
        externalPath(key),
        path.resolve(EXTERNAL_STORAGE_DIR, key)
    )
    assert.throws(() => externalKey(makeImage({ checksum: 'nothash' })))
    assert.throws(() => externalPath('../../etc/passwd'))
})

test('readImageBytes prefers disk when storage_backend is disk', async () => {
    const data = Buffer.from('disk-bytes')
    const image = makeImage({ checksum: 'cd' + 'd'.repeat(62), data })
    image.storage_backend = 'disk'
    image.storage_key = externalKey({ checksum: image.checksum })
    const target = externalPath(image.storage_key)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, data)

    assert.ok((await readImageBytes(image)).equals(data))
    await assert.rejects(() => readImageBytes({ storage_backend: 'disk', storage_key: 'bad' }))
})

test('writeExternalFile is idempotent and markImageExternal only clears matching rows', async () => {
    const data = Buffer.from('external-bytes')
    const image = makeImage({ id: 42, checksum: 'ef' + 'f'.repeat(62), data })
    const key = await writeExternalFile(image)
    const filepath = externalPath(key)

    assert.ok(fs.existsSync(filepath))
    const before = fs.statSync(filepath).mtimeMs
    await writeExternalFile(image)
    assert.equal(fs.statSync(filepath).mtimeMs, before)

    const exec = async (sql, values) => {
        assert.match(sql, /SET data = NULL/)
        assert.match(sql, /storage_backend = 'disk'/)
        assert.match(sql, /AND data IS NOT NULL/)
        assert.deepEqual(values, [key, 42, image.checksum])
        return { affectedRows: 1 }
    }
    assert.equal(await markImageExternal(image, exec), true)

    const skippingExec = async () => ({ affectedRows: 0 })
    assert.equal(await markImageExternal(image, skippingExec), false)
})
