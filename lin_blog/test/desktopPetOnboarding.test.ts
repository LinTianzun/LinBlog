import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearPetOnboardingCompleted,
  isPetOnboardingCompleted,
  markPetOnboardingCompleted,
  petOnboardingStorageKey,
} from '../src/utils/desktopPetOnboarding.ts'

class MemoryStorage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

const storage = new MemoryStorage()
;(globalThis as { localStorage?: Storage }).localStorage =
  storage as unknown as Storage

test('宠物新手引导按用户独立记录', () => {
  storage.setItem('token', 'token-user')
  storage.setItem('userInfo', JSON.stringify({ id: 42 }))
  const key = petOnboardingStorageKey()
  assert.equal(key.endsWith(':u42'), true)
  clearPetOnboardingCompleted()
  assert.equal(isPetOnboardingCompleted(), false)
  markPetOnboardingCompleted()
  assert.equal(isPetOnboardingCompleted(), true)
  clearPetOnboardingCompleted()
  assert.equal(isPetOnboardingCompleted(), false)
})
