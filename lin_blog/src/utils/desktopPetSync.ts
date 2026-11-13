import {
  getPetHomestead,
  getPetState,
  savePetHomestead,
  savePetState
} from '../api/pet'
import {
  mergeHomesteads,
  normalizeHomestead,
  type HomesteadState
} from './desktopPetHomestead'
import {
  mergePetVitals,
  normalizePetVitals,
  type PetVitals
} from './desktopPetVitals'

/** 只有登录用户才做跨设备同步；匿名访客完全使用本机状态 */
export const canSyncPetVitals = (): boolean => {
  if (typeof localStorage === 'undefined') return false
  return Boolean(localStorage.getItem('token'))
}

export type PetSyncState = 'local' | 'syncing' | 'synced' | 'pending'

export interface PetSyncStatus {
  state: PetSyncState
  /** 最近一次成功同步的时间，仅用于本机展示 */
  lastSyncedAt: number | null
  /** 第一次进入待重试的时间，用于展示等待时长 */
  pendingSince: number | null
  lastError: string | null
}

const SYNC_STATUS_EVENT = 'desktop-pet:sync-status'
const RETRY_BASE_MS = 3_000
const RETRY_MAX_MS = 60_000

let status: PetSyncStatus = {
  state: 'local',
  lastSyncedAt: null,
  pendingSince: null,
  lastError: null,
}
let pendingVitals: PetVitals | null = null
let readRetryNeeded = false
let pendingHomestead: HomesteadState | null = null
let homesteadReadRetryNeeded = false
let flushing = false
let retryTimer: number | undefined
let retryAttempt = 0
let listenersBound = false

export const getPetSyncStatus = (): PetSyncStatus => {
  if (!canSyncPetVitals()) {
    return {
      state: 'local',
      lastSyncedAt: status.lastSyncedAt,
      pendingSince: null,
      lastError: null,
    }
  }
  return { ...status }
}

export const onPetSyncStatusChange = (
  handler: (next: PetSyncStatus) => void
): (() => void) => {
  const listener = (event: Event) => {
    handler((event as CustomEvent<PetSyncStatus>).detail)
  }
  window.addEventListener(SYNC_STATUS_EVENT, listener)
  return () => window.removeEventListener(SYNC_STATUS_EVENT, listener)
}

const emitStatus = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<PetSyncStatus>(SYNC_STATUS_EVENT, {
      detail: getPetSyncStatus(),
    })
  )
}

const setStatus = (patch: Partial<PetSyncStatus>) => {
  status = { ...status, ...patch }
  emitStatus()
}

const clearRetryTimer = () => {
  if (retryTimer === undefined || typeof window === 'undefined') return
  window.clearTimeout(retryTimer)
  retryTimer = undefined
}

const hasPendingSync = (): boolean =>
  Boolean(pendingVitals || pendingHomestead)

const hasReadRetry = (): boolean =>
  readRetryNeeded || homesteadReadRetryNeeded

const markSynced = () => {
  pendingVitals = null
  pendingHomestead = null
  readRetryNeeded = false
  homesteadReadRetryNeeded = false
  retryAttempt = 0
  clearRetryTimer()
  setStatus({
    state: 'synced',
    lastSyncedAt: Date.now(),
    pendingSince: null,
    lastError: null,
  })
}

const markPending = (error: string) => {
  setStatus({
    state: 'pending',
    pendingSince: status.pendingSince ?? Date.now(),
    lastError: error,
  })
}

const markLocal = () => {
  pendingVitals = null
  pendingHomestead = null
  readRetryNeeded = false
  homesteadReadRetryNeeded = false
  retryAttempt = 0
  clearRetryTimer()
  setStatus({
    state: 'local',
    lastSyncedAt: null,
    pendingSince: null,
    lastError: null,
  })
}

const scheduleRetry = () => {
  if (typeof window === 'undefined' || retryTimer !== undefined) return
  retryAttempt = Math.min(retryAttempt + 1, 6)
  const delay = Math.min(
    RETRY_MAX_MS,
    RETRY_BASE_MS * 2 ** Math.max(0, retryAttempt - 1)
  )
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined
    void flushPetSyncQueue()
  }, delay)
}

const bindSyncListeners = () => {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true

  window.addEventListener('online', () => {
    retryAttempt = 0
    clearRetryTimer()
    void flushPetSyncQueue()
  })

  window.addEventListener('offline', () => {
    if (hasPendingSync() && canSyncPetVitals()) {
      markPending('当前处于离线状态')
    }
  })

  // 其他标签页登录 / 退出时同步重置状态，避免把上一个账号的队列带过去
  window.addEventListener('storage', (event) => {
    if (event.key !== 'token') return
    if (!canSyncPetVitals()) {
      markLocal()
      return
    }
    if (hasPendingSync()) {
      retryAttempt = 0
      clearRetryTimer()
      void flushPetSyncQueue()
    }
  })
}

const refreshRemoteSyncStatus = async (): Promise<boolean> => {
  try {
    const result = await getPetState()
    if (result.code !== 200) {
      throw new Error(result.message || '读取云端进度失败')
    }
    readRetryNeeded = false
    // 读取期间若又产生了新的本地修改，先补传，不能被这次读取清掉
    if (hasPendingSync()) {
      void flushPetSyncQueue()
      return true
    }
    if (homesteadReadRetryNeeded) {
      return refreshRemoteHomesteadSyncStatus()
    }
    markSynced()
    return true
  } catch {
    readRetryNeeded = true
    markPending('读取云端进度失败，稍后会自动重试')
    scheduleRetry()
    return false
  }
}

const refreshRemoteHomesteadSyncStatus = async (): Promise<boolean> => {
  try {
    const result = await getPetHomestead()
    if (result.code !== 200) {
      throw new Error(result.message || '读取云端小院失败')
    }
    homesteadReadRetryNeeded = false
    if (hasPendingSync()) {
      void flushPetSyncQueue()
      return true
    }
    if (readRetryNeeded) return refreshRemoteSyncStatus()
    markSynced()
    return true
  } catch {
    homesteadReadRetryNeeded = true
    markPending('读取云端小院失败，稍后会自动重试')
    scheduleRetry()
    return false
  }
}

/**
 * 上传队列里最新的养成状态。
 * 同一时间只发一个请求；上传期间产生的新状态会在成功后继续补传。
 */
export async function flushPetSyncQueue(): Promise<boolean> {
  bindSyncListeners()
  if (!canSyncPetVitals()) {
    markLocal()
    return false
  }
  if (flushing) return false
  if (!pendingVitals && !pendingHomestead) {
    if (readRetryNeeded) return refreshRemoteSyncStatus()
    if (homesteadReadRetryNeeded) return refreshRemoteHomesteadSyncStatus()
    if (status.state === 'pending') markSynced()
    return true
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    markPending('当前处于离线状态')
    scheduleRetry()
    return false
  }

  flushing = true
  const vitalsBatch = pendingVitals
  const homesteadBatch = pendingHomestead
  let ok = false
  setStatus({ state: 'syncing', lastError: null })
  try {
    const result = vitalsBatch
      ? await savePetState(normalizePetVitals(vitalsBatch))
      : await savePetHomestead(normalizeHomestead(homesteadBatch))
    if (result.code !== 200) {
      throw new Error(result.message || '同步失败')
    }
    ok = true
    if (vitalsBatch && pendingVitals === vitalsBatch) pendingVitals = null
    if (homesteadBatch && pendingHomestead === homesteadBatch) {
      pendingHomestead = null
    }
    if (!hasPendingSync() && !hasReadRetry()) markSynced()
  } catch {
    markPending('这次同步没有成功，稍后会自动重试')
    scheduleRetry()
  } finally {
    flushing = false
  }

  if (ok && (pendingVitals || pendingHomestead)) return flushPetSyncQueue()
  return ok
}

/** 重新检查登录态，供页面挂载时刷新状态徽标 */
export function refreshPetSyncStatus(): PetSyncStatus {
  bindSyncListeners()
  if (!canSyncPetVitals()) {
    markLocal()
  }
  return getPetSyncStatus()
}

/** 读取远端状态并与本机合并；离线或接口异常时保留本机状态 */
export async function mergeRemotePetVitals(
  local: PetVitals
): Promise<PetVitals> {
  bindSyncListeners()
  if (!canSyncPetVitals()) {
    markLocal()
    return local
  }

  const hadPending = hasPendingSync()
  if (!hadPending) setStatus({ state: 'syncing', lastError: null })
  try {
    const result = await getPetState()
    if (result.code !== 200) {
      throw new Error(result.message || '读取云端进度失败')
    }
    readRetryNeeded = false
    const merged = result.data
      ? mergePetVitals(local, result.data)
      : normalizePetVitals(local)
    if (hasPendingSync() || hasReadRetry()) void flushPetSyncQueue()
    else markSynced()
    return merged
  } catch {
    if (!hasPendingSync()) {
      readRetryNeeded = true
      markPending('读取云端进度失败，稍后会自动重试')
      scheduleRetry()
    }
    return local
  }
}

/** 写入失败或离线时保留最新快照，恢复网络后自动补传 */
export async function syncPetVitalsToServer(
  vitals: PetVitals
): Promise<boolean> {
  bindSyncListeners()
  if (!canSyncPetVitals()) {
    markLocal()
    return false
  }

  pendingVitals = normalizePetVitals(vitals)
  readRetryNeeded = false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    markPending('当前处于离线状态')
    scheduleRetry()
    return false
  }
  return flushPetSyncQueue()
}

const isHomesteadSnapshot = (
  value: unknown
): value is Partial<HomesteadState> =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (Array.isArray((value as Partial<HomesteadState>).plots) ||
        (value as Partial<HomesteadState>).inventory ||
        (value as Partial<HomesteadState>).animals ||
        (value as Partial<HomesteadState>).stateVersion !== undefined)
  )

/** 读取远端小院并与本机合并；无云端存档时保留当前设备进度 */
export async function mergeRemoteHomestead(
  local: HomesteadState
): Promise<HomesteadState> {
  bindSyncListeners()
  if (!canSyncPetVitals()) {
    markLocal()
    return local
  }

  const hadPending = hasPendingSync()
  if (!hadPending) setStatus({ state: 'syncing', lastError: null })
  try {
    const result = await getPetHomestead()
    if (result.code !== 200) {
      throw new Error(result.message || '读取云端小院失败')
    }
    homesteadReadRetryNeeded = false
    const merged = isHomesteadSnapshot(result.data)
      ? mergeHomesteads(local, result.data)
      : normalizeHomestead(local)
    if (hasPendingSync() || hasReadRetry()) void flushPetSyncQueue()
    else markSynced()
    return merged
  } catch {
    if (!hasPendingSync()) {
      homesteadReadRetryNeeded = true
      markPending('读取云端小院失败，稍后会自动重试')
      scheduleRetry()
    }
    return local
  }
}

/** 写入失败或离线时保留最新小院快照，恢复网络后自动补传 */
export async function syncHomesteadToServer(
  state: HomesteadState
): Promise<boolean> {
  bindSyncListeners()
  if (!canSyncPetVitals()) {
    markLocal()
    return false
  }

  pendingHomestead = normalizeHomestead(state)
  homesteadReadRetryNeeded = false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    markPending('当前处于离线状态')
    scheduleRetry()
    return false
  }
  return flushPetSyncQueue()
}
