import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_VISITOR_PET_PREFERENCES,
  isWithinQuietHours,
  normalizeVisitorPetPreferences,
  timeOfDayGreeting,
} from '../src/utils/desktopPetVisitor.ts'

const at = (hour: number, minute = 0) => {
  const date = new Date(2026, 10, 12, hour, minute)
  return date
}

const quiet = {
  ...DEFAULT_VISITOR_PET_PREFERENCES,
  quietHoursEnabled: true,
  quietStart: '23:00',
  quietEnd: '07:00',
}

test('安静时段支持跨零点区间', () => {
  assert.equal(isWithinQuietHours(quiet, at(23, 30)), true)
  assert.equal(isWithinQuietHours(quiet, at(0, 0)), true)
  assert.equal(isWithinQuietHours(quiet, at(6, 59)), true)
  assert.equal(isWithinQuietHours(quiet, at(7, 0)), false)
  assert.equal(isWithinQuietHours(quiet, at(22, 59)), false)
})

test('普通时段与关闭状态不触发安静模式', () => {
  const daytime = { ...quiet, quietStart: '13:00', quietEnd: '14:30' }
  assert.equal(isWithinQuietHours(daytime, at(13, 15)), true)
  assert.equal(isWithinQuietHours(daytime, at(14, 30)), false)
  assert.equal(
    isWithinQuietHours({ ...quiet, quietHoursEnabled: false }, at(23, 30)),
    false
  )
  assert.equal(isWithinQuietHours({ ...quiet, quietEnd: '23:00' }, at(23, 30)), false)
})

test('本机偏好归一化会修正非法时间与类型', () => {
  const normalized = normalizeVisitorPetPreferences({
    hidden: true,
    staticMode: 'yes' as unknown as boolean,
    quietStart: '25:99',
    quietEnd: '07:30',
    quietHoursEnabled: 'yes' as unknown as boolean,
  })
  assert.equal(normalized.hidden, true)
  assert.equal(normalized.staticMode, false)
  assert.equal(normalized.quietStart, DEFAULT_VISITOR_PET_PREFERENCES.quietStart)
  assert.equal(normalized.quietEnd, '07:30')
  assert.equal(normalized.quietHoursEnabled, false)
})

test('静态模式是合法的本机偏好', () => {
  const normalized = normalizeVisitorPetPreferences({ staticMode: true })
  assert.equal(normalized.staticMode, true)
  assert.equal(
    normalizeVisitorPetPreferences({ staticMode: false }).staticMode,
    false
  )
})

test('时段问候随时钟变化', () => {
  assert.equal(timeOfDayGreeting(at(5, 30)), '夜深了')
  assert.equal(timeOfDayGreeting(at(8)), '早上好')
  assert.equal(timeOfDayGreeting(at(13)), '中午好')
  assert.equal(timeOfDayGreeting(at(19)), '晚上好')
})
