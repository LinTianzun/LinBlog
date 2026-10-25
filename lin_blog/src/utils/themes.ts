export type ThemeMode = 'light' | 'dark'

export interface ThemePreset {
    id: string
    name: string
    // 基于 light 或 dark 扩展；yike 组件仍按 data-theme 工作
    base: ThemeMode
    // 预览色：主题主色与页面底色
    primary: string
    background: string
}

/*
 * 主题体系：data-theme（light/dark）决定 yike 组件明暗；
 * data-theme-preset 在其上叠加品牌色/背景的自定义变量。
 */
export const themePresets: ThemePreset[] = [
    {
        id: 'default-light',
        name: '默认浅色',
        base: 'light',
        primary: '#2b5aed',
        background: '#f6f6f6'
    },
    {
        id: 'default-dark',
        name: '默认深色',
        base: 'dark',
        primary: '#3575f6',
        background: '#1e2025'
    },
    {
        id: 'ocean',
        name: '海洋蓝',
        base: 'light',
        primary: '#0e7bd6',
        background: '#eef6fb'
    },
    {
        id: 'forest',
        name: '森林绿',
        base: 'light',
        primary: '#1f9d63',
        background: '#eff7f2'
    },
    {
        id: 'sakura',
        name: '樱花粉',
        base: 'light',
        primary: '#d6558a',
        background: '#fdf0f5'
    },
    {
        id: 'midnight',
        name: '午夜蓝',
        base: 'dark',
        primary: '#5b8cff',
        background: '#141a2e'
    },
    {
        id: 'coffee',
        name: '摩卡棕',
        base: 'dark',
        primary: '#c8956c',
        background: '#201914'
    }
]

export const defaultPresetId = 'default-light'

export function findPreset(id: string | null | undefined): ThemePreset {
    return themePresets.find(p => p.id === id) || themePresets[0]
}
