import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_DESKTOP_PET_SETTINGS,
  normalizeDesktopPetSettings,
} from '../src/utils/desktopPet.ts'

test('缺失字段回落到默认桌宠设置', () => {
  assert.deepEqual(normalizeDesktopPetSettings({}), DEFAULT_DESKTOP_PET_SETTINGS)
  assert.deepEqual(normalizeDesktopPetSettings(null), DEFAULT_DESKTOP_PET_SETTINGS)
})

test('越界的缩放与透明度会被钳制到合法区间', () => {
  const settings = normalizeDesktopPetSettings({
    petScale: 999,
    petOpacity: 1,
  })

  assert.equal(settings.petScale, 200)
  assert.equal(settings.petOpacity, 40)
})

test('非法枚举值回落到默认项，合法值原样保留', () => {
  const invalid = normalizeDesktopPetSettings({
    petSize: 'huge' as never,
    petActivity: 'crazy' as never,
    petHomeCorner: 'top' as never,
    petScope: 'somewhere' as never,
  })
  assert.equal(invalid.petSize, DEFAULT_DESKTOP_PET_SETTINGS.petSize)
  assert.equal(invalid.petActivity, DEFAULT_DESKTOP_PET_SETTINGS.petActivity)
  assert.equal(invalid.petHomeCorner, DEFAULT_DESKTOP_PET_SETTINGS.petHomeCorner)
  assert.equal(invalid.petScope, DEFAULT_DESKTOP_PET_SETTINGS.petScope)

  const valid = normalizeDesktopPetSettings({
    desktopPetEnabled: false,
    petSize: 'large',
    petScale: 175,
    petActivity: 'lively',
    petRoamingEnabled: false,
    petDragEnabled: false,
    petBubbleEnabled: false,
    petOpacity: 65,
    petAutoSleepEnabled: false,
    petHomeCorner: 'left',
    petScope: 'portal',
  })
  assert.deepEqual(valid, {
    desktopPetEnabled: false,
    petSize: 'large',
    petScale: 175,
    petActivity: 'lively',
    petRoamingEnabled: false,
    petDragEnabled: false,
    petBubbleEnabled: false,
    petOpacity: 65,
    petAutoSleepEnabled: false,
    petHomeCorner: 'left',
    petScope: 'portal',
  })
})
