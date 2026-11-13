export interface PetPrefetchProfile {
  isMobile?: boolean
  saveData?: boolean
  effectiveType?: string
  deviceMemory?: number
  hardwareConcurrency?: number
}

export function petPrefetchLimit(profile: PetPrefetchProfile = {}): number {
  if (profile.saveData) return 0

  const effectiveType = (profile.effectiveType || '').toLowerCase()
  if (/(^|-)2g$/.test(effectiveType)) return 0

  const constrained =
    Boolean(profile.isMobile) ||
    /(^|-)3g$/.test(effectiveType) ||
    (typeof profile.deviceMemory === 'number' &&
      profile.deviceMemory > 0 &&
      profile.deviceMemory <= 4) ||
    (typeof profile.hardwareConcurrency === 'number' &&
      profile.hardwareConcurrency > 0 &&
      profile.hardwareConcurrency <= 4)

  return constrained ? 3 : 6
}
