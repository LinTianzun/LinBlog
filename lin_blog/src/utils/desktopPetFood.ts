export type PetFoodId = 'rice' | 'fish' | 'icecream' | 'cake' | 'salad'

export interface PetFood {
    id: PetFoodId
    name: string
    icon: string
    tag: string
    description: string
    satiety: number
    mood: number
    intimacy: number
}

export const DEFAULT_PET_FOOD_ID: PetFoodId = 'rice'

/** 零食只影响本次投喂的数值，不额外增加冷却种类，避免连续投喂过载 */
export const PET_FOODS: readonly PetFood[] = [
    {
        id: 'rice',
        name: '白米饭',
        icon: '🍚',
        tag: '主食',
        description: '最扛饿的日常口粮，稳稳补满肚子。',
        satiety: 30,
        mood: 12,
        intimacy: 2,
    },
    {
        id: 'fish',
        name: '小鱼干',
        icon: '🐟',
        tag: '心头好',
        description: '香得它原地转圈，心情涨得比肚子快。',
        satiety: 18,
        mood: 16,
        intimacy: 3,
    },
    {
        id: 'icecream',
        name: '冰淇淋',
        icon: '🍦',
        tag: '甜点',
        description: '开心值拉满，但不太顶饱，适合哄心情。',
        satiety: 12,
        mood: 20,
        intimacy: 2,
    },
    {
        id: 'cake',
        name: '抹茶蛋糕',
        icon: '🍰',
        tag: '限定',
        description: '值得慢慢品的小奢侈，亲密度加成最高。',
        satiety: 22,
        mood: 18,
        intimacy: 4,
    },
    {
        id: 'salad',
        name: '蔬菜沙拉',
        icon: '🥗',
        tag: '轻食',
        description: '清爽又健康，饱腹不错但心情只小幅提升。',
        satiety: 26,
        mood: 6,
        intimacy: 1,
    },
]

const FOOD_STORAGE_KEY = 'LINBLOG_DESKTOP_PET_FOOD'
const FOOD_CHANGE_EVENT = 'desktop-pet:food-change'
const FOOD_IDS = PET_FOODS.map((food) => food.id)

export function isPetFoodId(value: unknown): value is PetFoodId {
    return typeof value === 'string' && FOOD_IDS.includes(value as PetFoodId)
}

export function getPetFood(id: unknown): PetFood {
    return PET_FOODS.find((food) => food.id === id) || PET_FOODS[0]
}

export function getSelectedPetFoodId(): PetFoodId {
    try {
        const raw =
            typeof localStorage === 'undefined'
                ? null
                : localStorage.getItem(FOOD_STORAGE_KEY)
        return isPetFoodId(raw) ? raw : DEFAULT_PET_FOOD_ID
    } catch {
        return DEFAULT_PET_FOOD_ID
    }
}

export function setSelectedPetFoodId(id: unknown): PetFoodId {
    const next = getPetFood(id).id
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(FOOD_STORAGE_KEY, next)
        }
    } catch {
        // 隐私模式下写入失败只影响下次打开时的默认零食
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent<PetFoodId>(FOOD_CHANGE_EVENT, { detail: next })
        )
    }
    return next
}

export function getSelectedPetFood(): PetFood {
    return getPetFood(getSelectedPetFoodId())
}

export function onSelectedPetFoodChange(
    handler: (id: PetFoodId) => void
): () => void {
    const listener = (event: Event) => {
        handler((event as CustomEvent<PetFoodId>).detail)
    }
    window.addEventListener(FOOD_CHANGE_EVENT, listener)
    return () => window.removeEventListener(FOOD_CHANGE_EVENT, listener)
}
