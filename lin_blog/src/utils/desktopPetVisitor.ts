export interface VisitorPetPreferences {
  hidden: boolean
  quietHoursEnabled: boolean
  quietStart: string
  quietEnd: string
}

export const DEFAULT_VISITOR_PET_PREFERENCES: VisitorPetPreferences = {
  hidden: false,
  quietHoursEnabled: false,
  quietStart: '23:00',
  quietEnd: '07:00'
}

const STORAGE_KEY = 'LINBLOG_DESKTOP_PET_VISITOR_PREFS'
const CHANGE_EVENT = 'linblog:pet-visitor-prefs-change'
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const normalizeTime = (value: unknown, fallback: string): string =>
  typeof value === 'string' && TIME_PATTERN.test(value) ? value : fallback

export function normalizeVisitorPetPreferences(
  value?: Partial<VisitorPetPreferences> | null
): VisitorPetPreferences {
  const raw = value || {}
  return {
    hidden:
      typeof raw.hidden === 'boolean'
        ? raw.hidden
        : DEFAULT_VISITOR_PET_PREFERENCES.hidden,
    quietHoursEnabled:
      typeof raw.quietHoursEnabled === 'boolean'
        ? raw.quietHoursEnabled
        : DEFAULT_VISITOR_PET_PREFERENCES.quietHoursEnabled,
    quietStart: normalizeTime(
      raw.quietStart,
      DEFAULT_VISITOR_PET_PREFERENCES.quietStart
    ),
    quietEnd: normalizeTime(
      raw.quietEnd,
      DEFAULT_VISITOR_PET_PREFERENCES.quietEnd
    )
  }
}

export function getVisitorPetPreferences(): VisitorPetPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return normalizeVisitorPetPreferences(
        JSON.parse(raw) as Partial<VisitorPetPreferences>
      )
    }
  } catch {
    // 读取失败使用默认值
  }
  return { ...DEFAULT_VISITOR_PET_PREFERENCES }
}

export function setVisitorPetPreferences(
  patch: Partial<VisitorPetPreferences>
): VisitorPetPreferences {
  const next = normalizeVisitorPetPreferences({
    ...getVisitorPetPreferences(),
    ...patch
  })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 隐私模式下写入失败只影响本机持久化
  }
  window.dispatchEvent(
    new CustomEvent<VisitorPetPreferences>(CHANGE_EVENT, { detail: next })
  )
  return next
}

export function onVisitorPetPreferencesChange(
  handler: (preferences: VisitorPetPreferences) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<VisitorPetPreferences>).detail
    handler(normalizeVisitorPetPreferences(detail))
  }
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

const toMinutes = (value: string): number => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

/** 支持跨零点区间，例如 23:00–07:00 */
export function isWithinQuietHours(
  preferences: VisitorPetPreferences,
  now = new Date()
): boolean {
  if (!preferences.quietHoursEnabled) return false
  const start = toMinutes(preferences.quietStart)
  const end = toMinutes(preferences.quietEnd)
  if (start === end) return false
  const current = now.getHours() * 60 + now.getMinutes()
  return start < end
    ? current >= start && current < end
    : current >= start || current < end
}

export function timeOfDayGreeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 6) return '夜深了'
  if (hour < 9) return '早上好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 22) return '晚上好'
  return '夜深了'
}

