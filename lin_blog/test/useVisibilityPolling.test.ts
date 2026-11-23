import assert from 'node:assert/strict'
import test from 'node:test'
import { isDocumentVisible } from '../src/utils/messageRealtime.ts'

// Node 环境没有 document，这里只锁定轮询依赖的可见性语义：
// composable 在浏览器里靠这个函数决定是否启动 interval。
test('无 document 时可见性视为 false，避免非浏览器环境误启动轮询', () => {
    assert.equal(isDocumentVisible(), false)
})
