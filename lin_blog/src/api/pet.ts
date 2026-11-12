import request from '../utils/request'
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
