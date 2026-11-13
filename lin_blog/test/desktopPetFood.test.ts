import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PET_FOOD_ID,
  PET_FOODS,
  getPetFood,
  getSelectedPetFoodId,
  setSelectedPetFoodId,
} from '../src/utils/desktopPetFood.ts'
import {
  DEFAULT_PET_VITALS,
  applyFeeding,
} from '../src/utils/desktopPetVitals.ts'

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

const storage = new MemoryStorage()
;(globalThis as { localStorage?: Storage }).localStorage =
  storage as unknown as Storage

test('零食目录的 ID 唯一且数值在合理范围内', () => {
  assert.equal(PET_FOODS.length, 5)
  assert.equal(new Set(PET_FOODS.map((food) => food.id)).size, PET_FOODS.length)

  for (const food of PET_FOODS) {
    assert.ok(food.name.length > 0)
    assert.ok(food.icon.length > 0)
    assert.ok(food.description.length > 0)
    assert.ok(food.satiety > 0 && food.satiety <= 30)
    assert.ok(food.mood > 0 && food.mood <= 20)
    assert.ok(food.intimacy > 0 && food.intimacy <= 4)
  }
})

test('未知零食回落到默认主食', () => {
  assert.equal(getPetFood('unknown').id, DEFAULT_PET_FOOD_ID)
  assert.equal(getPetFood(null).id, DEFAULT_PET_FOOD_ID)
})

test('不同零食提供不同的饱腹、心情与亲密度加成', () => {
  const now = new Date('2026-11-13T12:00:00').getTime()
  const base = {
    ...DEFAULT_PET_VITALS,
    satiety: 40,
    mood: 50,
    intimacy: 10,
    lastFedAt: 0,
    updatedAt: now,
  }

  const icecream = applyFeeding(base, now, 'icecream')
  assert.equal(icecream.effect, 'ok')
  assert.equal(icecream.food.id, 'icecream')
  assert.equal(icecream.vitals.satiety, 52)
  assert.equal(icecream.vitals.mood, 70)
  assert.equal(icecream.vitals.intimacy, 12)

  const fish = applyFeeding(base, now, 'fish')
  assert.equal(fish.vitals.satiety, 58)
  assert.equal(fish.vitals.mood, 66)
  assert.equal(fish.vitals.intimacy, 13)

  const salad = applyFeeding(base, now, 'salad')
  assert.equal(salad.vitals.satiety, 66)
  assert.equal(salad.vitals.mood, 56)
  assert.equal(salad.vitals.intimacy, 11)
})

test('冷却与吃饱时仍返回本次选择的零食', () => {
  const now = new Date('2026-11-13T12:00:00').getTime()
  const cooling = applyFeeding(
    { ...DEFAULT_PET_VITALS, lastFedAt: now - 30_000, updatedAt: now },
    now,
    'fish'
  )
  assert.equal(cooling.effect, 'cooldown')
  assert.equal(cooling.food.id, 'fish')

  const full = applyFeeding(
    { ...DEFAULT_PET_VITALS, satiety: 96, lastFedAt: 0, updatedAt: now },
    now,
    'cake'
  )
  assert.equal(full.effect, 'full')
  assert.equal(full.food.id, 'cake')
  assert.equal(full.vitals.satiety, 96)
})

test('当前零食选择会写入本机并纠正非法值', () => {
  storage.clear()
  assert.equal(getSelectedPetFoodId(), DEFAULT_PET_FOOD_ID)

  assert.equal(setSelectedPetFoodId('icecream'), 'icecream')
  assert.equal(getSelectedPetFoodId(), 'icecream')
  assert.equal(storage.getItem('LINBLOG_DESKTOP_PET_FOOD'), 'icecream')

  assert.equal(setSelectedPetFoodId('not-a-food'), DEFAULT_PET_FOOD_ID)
  assert.equal(getSelectedPetFoodId(), DEFAULT_PET_FOOD_ID)
})
