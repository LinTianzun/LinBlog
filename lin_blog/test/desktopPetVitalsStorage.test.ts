import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PET_VITALS,
  getPetVitals,
  setPetVitals,
} from '../src/utils/desktopPetVitals.ts'

class MemoryStorage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

const storage = new MemoryStorage()
;(globalThis as { localStorage?: Storage }).localStorage =
  storage as unknown as Storage

const login = (id: number): void => {
  storage.setItem('token', `token-${id}`)
  storage.setItem('userInfo', JSON.stringify({ id }))
}

test('登录账号的养成状态按用户隔离', () => {
  storage.clear()
  login(1)
  setPetVitals({ ...DEFAULT_PET_VITALS, mood: 88, updatedAt: Date.now() })
  assert.match(
    storage.getItem('LINBLOG_DESKTOP_PET_VITALS:u1') || '',
    /"mood":88/
  )

  login(2)
  assert.equal(getPetVitals().mood, DEFAULT_PET_VITALS.mood)

  login(1)
  assert.equal(getPetVitals().mood, 88)
})

test('旧版本全局存档只迁移给第一个登录账号', () => {
  storage.clear()
  setPetVitals({ ...DEFAULT_PET_VITALS, mood: 77, updatedAt: Date.now() })

  login(7)
  assert.equal(getPetVitals().mood, 77)
  assert.ok(storage.getItem('LINBLOG_DESKTOP_PET_VITALS:u7'))
  assert.equal(storage.getItem('LINBLOG_DESKTOP_PET_VITALS:legacy-owner'), '7')

  login(8)
  assert.equal(getPetVitals().mood, DEFAULT_PET_VITALS.mood)
})

test('退出登录后回到匿名本机状态', () => {
  storage.clear()
  login(3)
  setPetVitals({ ...DEFAULT_PET_VITALS, mood: 90, updatedAt: Date.now() })

  storage.removeItem('token')
  storage.removeItem('userInfo')
  assert.equal(getPetVitals().mood, DEFAULT_PET_VITALS.mood)
})
