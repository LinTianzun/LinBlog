const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const utilPath = path.resolve(__dirname, '../utils/coverCleanup.js')
const originalLoad = Module._load
let deactivated = []
let shouldThrow = false

Module._load = function (request, parent, isMain) {
    if (parent?.filename === utilPath && request === '../model/dbModel/image/index') {
        return {
            deactivateImageIfUnreferenced: async (filename) => {
                if (shouldThrow) throw new Error('db down')
                deactivated.push(filename)
                return { deactivated: true, referenceCount: 0 }
            }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const { cleanupCover, extractUploadsFilename } = require(utilPath)
Module._load = originalLoad

test.beforeEach(() => {
    deactivated = []
    shouldThrow = false
})

test('extractUploadsFilename only accepts managed upload URLs', () => {
    assert.equal(extractUploadsFilename('/api/uploads/cover.jpg'), 'cover.jpg')
    assert.equal(extractUploadsFilename(' /api/uploads/cover.jpg '), 'cover.jpg')
    assert.equal(extractUploadsFilename('/api/uploads/../etc/passwd'), null)
    assert.equal(extractUploadsFilename('https://cdn.example.com/pic.jpg'), null)
    assert.equal(extractUploadsFilename(null), null)
})

test('cleanupCover deactivates unreferenced uploads and ignores external URLs', async () => {
    await cleanupCover('/api/uploads/old.jpg')
    await cleanupCover('https://cdn.example.com/pic.jpg')
    assert.deepEqual(deactivated, ['old.jpg'])
})

test('cleanupCover swallows cleanup failures so writes still succeed', async () => {
    shouldThrow = true
    await cleanupCover('/api/uploads/old.jpg')
    assert.deepEqual(deactivated, [])
})
