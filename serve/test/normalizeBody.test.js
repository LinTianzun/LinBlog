const assert = require('node:assert/strict')
const test = require('node:test')

const { normalizeJsonBody } = require('../middleware/normalizeBody')

test('missing or non-object JSON bodies receive an empty object', () => {
    const bodies = [undefined, null, [], 'text', 42, true]
    let nextCalled = false

    for (const body of bodies) {
        const req = { body }

        normalizeJsonBody(req, {}, () => {
            nextCalled = true
        })

        assert.deepEqual(req.body, {})
    }

    assert.equal(nextCalled, true)
})

test('existing request bodies are preserved', () => {
    const req = { body: { account: 'admin' } }

    normalizeJsonBody(req, {}, () => {})

    assert.deepEqual(req.body, { account: 'admin' })
})
