import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findPetAvoidancePosition,
  overlapArea,
  petBodyRect,
  totalOverlapArea,
  type PetAvoidanceBounds,
  type PetRect,
} from '../src/utils/desktopPetAvoidance.ts'

const WIDTH = 200
const HEIGHT = 112.5

const bounds: PetAvoidanceBounds = {
  left: 0,
  top: 0,
  right: 1920,
  bottom: 1080,
  maxX: 1720,
  maxY: 967.5,
}

const noOverlap = (position: { x: number; y: number }, obstacles: PetRect[]) =>
  totalOverlapArea(petBodyRect(position, WIDTH, HEIGHT), obstacles)

test('没有控件遮挡时不移动', () => {
  const result = findPetAvoidancePosition({
    position: { x: 1000, y: 700 },
    width: WIDTH,
    height: HEIGHT,
    obstacles: [{ left: 1000, top: 700, right: 1020, bottom: 715 }],
    bounds,
  })

  assert.equal(result.moved, false)
  assert.deepEqual({ x: result.x, y: result.y }, { x: 1000, y: 700 })
  assert.equal(result.overlapArea, 0)
})

test('控件压住身体时移动到最近的空位', () => {
  const position = { x: 1000, y: 700 }
  const obstacle = { left: 1050, top: 740, right: 1150, bottom: 780 }

  const result = findPetAvoidancePosition({
    position,
    width: WIDTH,
    height: HEIGHT,
    obstacles: [obstacle],
    bounds,
  })

  assert.equal(result.moved, true)
  assert.equal(noOverlap(result, [obstacle]), 0)
  assert.ok(Math.hypot(result.x - position.x, result.y - position.y) < 100)
})

test('靠边时不会越界，改为向另一侧避让', () => {
  const position = { x: 1000, y: 900 }
  const obstacle = { left: 1050, top: 930, right: 1150, bottom: 1010 }

  const result = findPetAvoidancePosition({
    position,
    width: WIDTH,
    height: HEIGHT,
    obstacles: [obstacle],
    bounds,
  })

  assert.equal(result.moved, true)
  assert.equal(noOverlap(result, [obstacle]), 0)
  assert.ok(result.y >= bounds.top)
  assert.ok(result.y + HEIGHT <= bounds.bottom)
})

test('多个相邻控件会一起避让', () => {
  const obstacles = [
    { left: 1050, top: 740, right: 1120, bottom: 780 },
    { left: 1130, top: 740, right: 1200, bottom: 780 },
  ]

  const result = findPetAvoidancePosition({
    position: { x: 1000, y: 700 },
    width: WIDTH,
    height: HEIGHT,
    obstacles,
    bounds,
  })

  assert.equal(result.moved, true)
  assert.equal(noOverlap(result, obstacles), 0)
})

test('空间被完全占满时保持原位，避免无意义抖动', () => {
  const obstacle = { left: 0, top: 0, right: 1920, bottom: 1080 }
  const position = { x: 600, y: 400 }

  const result = findPetAvoidancePosition({
    position,
    width: WIDTH,
    height: HEIGHT,
    obstacles: [obstacle],
    bounds,
    maxShift: 120,
  })

  assert.equal(result.moved, false)
  assert.deepEqual({ x: result.x, y: result.y }, position)
  assert.equal(result.overlapArea, overlapArea(petBodyRect(position, WIDTH, HEIGHT), obstacle))
})
