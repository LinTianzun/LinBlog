const assert = require('node:assert/strict')
const test = require('node:test')

const {
    issueUploadTicket,
    consumeUploadTicket,
    TICKET_TTL_MS,
    DEFAULT_USES,
    MAX_TICKETS,
    _reset,
    _size
} = require('../utils/uploadTicket')

test.beforeEach(() => { _reset() })

const USER_ID = 7

test('签发的票据可被消费一次，并带回用户身份', () => {
    const { ticket } = issueUploadTicket(USER_ID)
    const result = consumeUploadTicket(ticket)
    assert.equal(result.valid, true)
    assert.equal(result.userId, USER_ID, '票据必须自带身份，否则服务端收不到 JWT')
})

test('同一批多选文件共用一张票据时可连续消费', () => {
    // yk-upload 多选用同一个 uploadUrl 逐个发请求，票据必须支持多次消费
    const { ticket } = issueUploadTicket(USER_ID)
    for (let i = 0; i < DEFAULT_USES; i++) {
        assert.equal(consumeUploadTicket(ticket).valid, true, `第 ${i + 1} 次上传应通过`)
    }
    assert.equal(consumeUploadTicket(ticket).valid, false, '超出次数后应失效')
})

test('票据用尽后从池中移除', () => {
    const { ticket } = issueUploadTicket(USER_ID)
    for (let i = 0; i < DEFAULT_USES; i++) consumeUploadTicket(ticket)
    assert.equal(_size(), 0)
})

test('未知或空票据一律拒绝', () => {
    assert.equal(consumeUploadTicket('').valid, false)
    assert.equal(consumeUploadTicket(undefined).valid, false)
    assert.equal(consumeUploadTicket('not-a-real-ticket').valid, false)
})

test('未登录用户拿不到票据', () => {
    for (const bad of [null, undefined, 0, -1, '7', 1.5]) {
        const issued = issueUploadTicket(bad)
        assert.ok(issued.error, `userId=${bad} 应被拒绝`)
    }
})

test('票据绑定来源 IP，换来源使用视为泄漏', () => {
    const { ticket } = issueUploadTicket(USER_ID, { ip: '::ffff:127.0.0.1' })
    const leak = consumeUploadTicket(ticket, { ip: '203.0.113.9' })
    assert.equal(leak.valid, false)
    assert.match(leak.reason, /来源异常/)
    assert.equal(_size(), 0, '疑似泄漏的票据应立即作废')
})

test('票据过期后失效', () => {
    const { ticket } = issueUploadTicket(USER_ID)
    const realNow = Date.now
    try {
        // 把时间推到 TTL 之后，再触发一次消费（会先清理过期票据）
        Date.now = () => realNow() + TICKET_TTL_MS + 1
        const result = consumeUploadTicket(ticket)
        assert.equal(result.valid, false)
        assert.match(result.reason, /过期|无效/)
    } finally {
        Date.now = realNow
    }
})

test('票据签发次数上限受控，文件数不会无限放大', () => {
    const issued = issueUploadTicket(USER_ID, { uses: 9999 })
    assert.ok(issued.uses <= DEFAULT_USES, '单次票据的可用次数应被夹紧')
})

test('票据池满时拒绝继续签发', () => {
    let count = 0
    while (count < MAX_TICKETS + 100 && issueUploadTicket(USER_ID).ticket) count++
    assert.ok(count <= MAX_TICKETS, '票据池不应超过上限')
    _reset()
})
