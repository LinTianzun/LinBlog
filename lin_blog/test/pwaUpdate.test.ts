import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PWA_UPDATE_MESSAGE,
  isPwaUpdateMessage,
  shouldAnnouncePwaUpdate,
} from '../src/utils/pwaUpdate.ts'

test('PWA 更新提示消息按 type 识别', () => {
  assert.equal(isPwaUpdateMessage({ type: PWA_UPDATE_MESSAGE }), true)
  assert.equal(isPwaUpdateMessage({ type: 'CACHE_LOADED_RESOURCES' }), false)
  assert.equal(isPwaUpdateMessage(null), false)
})

test('首次安装不打扰用户，旧页面被新版本接管时提示刷新', () => {
  const update = { type: PWA_UPDATE_MESSAGE }
  assert.equal(shouldAnnouncePwaUpdate(false, update), false)
  assert.equal(shouldAnnouncePwaUpdate(true, update), true)
  assert.equal(shouldAnnouncePwaUpdate(true, { type: 'other' }), false)
})
