export interface PetOnboardingStep {
  id: string
  icon: string
  title: string
  body: string
}

export const PET_ONBOARDING_STEPS: readonly PetOnboardingStep[] = [
  {
    id: 'grow',
    icon: '🌱',
    title: '先种一块地',
    body: '在种子栏选好作物，再点空地播种；成熟后点击菜地收获。浇水能缩短 20% 生长时间，攒到肥料还能再快一点。'
  },
  {
    id: 'weather',
    icon: '🌦️',
    title: '留意天气和时段',
    body: '小院每天都有稳定天气，顶部会显示天气加成：晴天作物快、阴天动物快、雨天作物更快、刮风时钓鱼冷却更短。夜晚宠物会放慢脚步，小院也会暗下来。'
  },
  {
    id: 'raise',
    icon: '🐔',
    title: '顺手照顾养殖和钓鱼',
    body: '去养殖区收鸡蛋、牛奶和肥料，去钓鱼区等鱼上钩；底部的「一键照料」会帮你把成熟作物、动物产物和鱼塘一次收好。'
  },
  {
    id: 'business',
    icon: '🪙',
    title: '用订单扩建小院',
    body: '完成每日订单换金币，在商店买种子、肥料和装饰；金币够了还能把菜地扩建到 12 块，让小院越来越热闹。'
  }
]

const ONBOARDING_STORAGE_KEY = 'LINBLOG_DESKTOP_PET_ONBOARDING'

const readStorage = (key: string): string | null => {
  try {
    return typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: string): void => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // 忽略持久化失败
  }
}

const readCurrentUserId = (): number => {
  if (!readStorage('token')) return 0
  try {
    const raw = readStorage('userInfo')
    if (!raw) return 0
    const id = Number((JSON.parse(raw) as { id?: number }).id)
    return Number.isSafeInteger(id) && id > 0 ? id : 0
  } catch {
    return 0
  }
}

export function petOnboardingStorageKey(): string {
  const userId = readCurrentUserId()
  return userId
    ? `${ONBOARDING_STORAGE_KEY}:u${userId}`
    : ONBOARDING_STORAGE_KEY
}

export function isPetOnboardingCompleted(): boolean {
  return readStorage(petOnboardingStorageKey()) === '1'
}

export function markPetOnboardingCompleted(): void {
  writeStorage(petOnboardingStorageKey(), '1')
}

export function clearPetOnboardingCompleted(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(petOnboardingStorageKey())
    }
  } catch {
    // 忽略持久化失败
  }
}
