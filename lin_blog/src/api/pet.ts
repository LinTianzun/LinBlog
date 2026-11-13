import request from '../utils/request'
import type { HomesteadState } from '../utils/desktopPetHomestead'
import type { PetVitals } from '../utils/desktopPetVitals'

export interface ApiResult<T> {
  code: number
  message: string
  data?: T
}

export function getPetState() {
  return request.get<ApiResult<PetVitals | null>>('/pet/state')
}

export function savePetState(vitals: PetVitals) {
  return request.put<ApiResult<PetVitals>>('/pet/state', vitals)
}

export function getPetHomestead() {
  return request.get<ApiResult<HomesteadState | null>>('/pet/homestead')
}

export function savePetHomestead(state: HomesteadState) {
  return request.put<ApiResult<HomesteadState>>('/pet/homestead', state)
}
