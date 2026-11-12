const assert = require('node:assert/strict')
const test = require('node:test')

const loginGuard = require('../utils/loginGuard')

test.beforeEach(() => {
    loginGuard.reset()
    process.env.LINBLOG_LOGIN_MAX_FAILURES = '3'
    process.env.LINBLOG_LOGIN_LOCK_MINUTES = '5'
})

test.afterEach(() => {
    loginGuard.reset()
    delete process.env.LINBLOG_LOGIN_MAX_FAILURES
    delete process.env.LINBLOG_LOGIN_LOCK_MINUTES
})

test('login locks after consecutive failures and reports remaining time', () => {
    assert.equal(loginGuard.isLocked('User@Example.com').locked, false)
    loginGuard.recordFailure('User@Example.com')
    loginGuard.recordFailure(' user@example.com ')
    assert.equal(loginGuard.isLocked('USER@example.com').locked, false)

    const failure = loginGuard.recordFailure('user@example.com')
    assert.equal(failure.failures, 3)
    assert.equal(failure.locked, true)

    const lock = loginGuard.isLocked('USER@example.com', Date.now() + 60 * 1000)
    assert.equal(lock.locked, true)
    assert.equal(lock.failures, 3)
    assert.equal(lock.maxFailures, 3)
    assert.equal(lock.remainingSeconds, 4 * 60)
})

test('successful login clears failures and expired locks unlock automatically', () => {
    loginGuard.recordFailure('locked-user')
    loginGuard.recordFailure('locked-user')
    loginGuard.recordFailure('locked-user')
    assert.equal(loginGuard.isLocked('locked-user', Date.now() + 5 * 60 * 1000 + 1000).locked, false)

    loginGuard.recordFailure('success-user')
    loginGuard.recordSuccess('SUCCESS-user')
    assert.equal(loginGuard.isLocked('success-user').locked, false)
})
