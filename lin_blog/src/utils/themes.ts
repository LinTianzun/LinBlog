export type ThemeMode = 'light' | 'dark'

export interface ThemePreset {
    id: string
    name: string
    // 基于 light 或 dark 扩展；yike 组件仍按 data-theme 工作
    base: ThemeMode
    // 预览色：主题主色与页面底色
    primary: string
    background: string
    // CSS background 值；渐变主题用 linear-gradient，预览卡与横幅共用
    preview?: string
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
        id: 'aurora',
        name: '极光绿',
        base: 'light',
        primary: '#10a37f',
        background: '#eef7f4',
        preview: 'linear-gradient(135deg, #d9f8e3 0%, #a5f3d0 45%, #6ee7c8 100%)'
    },
    {
        id: 'sunset',
        name: '落日橙',
        base: 'light',
        primary: '#e8590c',
        background: '#fdf3ec',
        preview: 'linear-gradient(135deg, #ffedd5 0%, #ffc078 50%, #ff922b 100%)'
    },
    {
        id: 'nebula',
        name: '星云紫',
        base: 'dark',
        primary: '#a78bfa',
        background: '#171426',
        preview: 'linear-gradient(135deg, #2b2255 0%, #4c3a8f 50%, #a78bfa 100%)'
    },
    {
        id: 'obsidian',
        name: '黑曜石',
        base: 'dark',
        primary: '#22c3a6',
        background: '#101314',
        preview: 'linear-gradient(135deg, #0f1512 0%, #123f38 55%, #22c3a6 100%)'
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
    },
    {
        id: 'garnet',
        name: '暗夜绯',
        base: 'dark',
        primary: '#ee5a6f',
        background: '#1a1216',
        preview: 'linear-gradient(135deg, #2e1a20 0%, #6b2f3c 50%, #ee5a6f 100%)'
    }
]

export const defaultPresetId = 'default-light'

export function findPreset(id: string | null | undefined): ThemePreset {
    return themePresets.find(p => p.id === id) || themePresets[0]
}
