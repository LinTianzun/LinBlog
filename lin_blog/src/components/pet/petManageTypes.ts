export const PET_HOME_TABS = [
    {
        id: 'home',
        label: '小屋',
        icon: '🏠',
        note: '它的小屋 · 可以在这里休息',
    },
    {
        id: 'grow',
        label: '种植',
        icon: '🌱',
        note: '种植区 · 播种、浇水、收获',
    },
    {
        id: 'raise',
        label: '养殖',
        icon: '🐔',
        note: '养殖区 · 鸡舍、奶牛和牧场',
    },
    {
        id: 'fish',
        label: '钓鱼',
        icon: '🎣',
        note: '钓鱼区 · 等鱼上钩',
    },
] as const

export type PetHomeTab = (typeof PET_HOME_TABS)[number]['id']

export interface PetHomeTabDefinition {
    readonly id: PetHomeTab
    readonly label: string
    readonly icon: string
    readonly note: string
}

export interface PetHomePlotView {
    index: number
    cropId: string | null
    ripe: boolean
    watered: boolean
    visualClass: Record<string, boolean>
    label: string
}

export interface PetHomeChickenView {
    eggReady: boolean
    manureReady: boolean
}

export interface PetHomeCowView {
    milkReady: boolean
    manureReady: boolean
}

export interface PetHomeDecorationView {
    id: string
    name: string
}

export interface PetHomesteadInventoryChip {
    id: string
    name: string
    icon: string
    count: number
}
