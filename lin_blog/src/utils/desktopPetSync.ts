import { getPetState, savePetState } from '../api/pet'
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

/** 读取远端状态并与本机合并；离线或接口异常时保留本机状态 */
export async function mergeRemotePetVitals(
  local: PetVitals
): Promise<PetVitals> {
  if (!canSyncPetVitals()) return local
  try {
    const result = await getPetState()
    if (result.code === 200 && result.data) {
      return mergePetVitals(local, result.data)
    }
  } catch {
    // 离线时继续用本机状态
  }
  return local
}

export async function syncPetVitalsToServer(
  vitals: PetVitals
): Promise<boolean> {
  if (!canSyncPetVitals()) return false
  try {
    const result = await savePetState(normalizePetVitals(vitals))
    return result.code === 200
  } catch {
    return false
  }
}
