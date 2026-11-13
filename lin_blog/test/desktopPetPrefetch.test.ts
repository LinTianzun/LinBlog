import assert from 'node:assert/strict'
import test from 'node:test'
import { petPrefetchLimit } from '../src/utils/desktopPetPrefetch.ts'

test('省流和 2G 网络不预取桌宠动画', () => {
  assert.equal(petPrefetchLimit({ saveData: true }), 0)
  assert.equal(petPrefetchLimit({ effectiveType: 'slow-2g' }), 0)
  assert.equal(petPrefetchLimit({ effectiveType: '2g' }), 0)
})

test('移动端、3G 与低配设备只预取三段高频动画', () => {
  assert.equal(petPrefetchLimit({ isMobile: true }), 3)
  assert.equal(petPrefetchLimit({ effectiveType: '3g' }), 3)
  assert.equal(petPrefetchLimit({ deviceMemory: 4 }), 3)
  assert.equal(petPrefetchLimit({ hardwareConcurrency: 4 }), 3)
})

test('桌面高速设备预取六段动画，避免一次拉满动画库', () => {
  assert.equal(
    petPrefetchLimit({
      isMobile: false,
      effectiveType: '4g',
      deviceMemory: 8,
      hardwareConcurrency: 8,
    }),
    6
  )
})
