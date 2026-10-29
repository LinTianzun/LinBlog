export type ThemeMode = 'light' | 'dark'

// 主题类型：solid 为纯色底，gradient 为渐变底（--bgGradient 生效）
export type ThemeKind = 'solid' | 'gradient'

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
    // 主题类型，默认 solid；gradient 时才写入 --bgGradient
    kind?: ThemeKind
    // 页面背景的 CSS background 值（渐变主题用；不传时由 gradientFrom/To 合成）
    gradient?: string
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
    },

    // ── 渐变色系：--bgGradient 生效，页面底色为真实渐变 ──
    {
        id: 'aurora-dream',
        name: '晨曦微光',
        base: 'light',
        kind: 'gradient',
        primary: '#ff8a5c',
        background: '#fdf4ee',
        preview: 'linear-gradient(135deg, #ffd6a5 0%, #ff9a8b 45%, #ff6a88 100%)',
        gradient: 'linear-gradient(150deg, #fff1e2 0%, #ffe0d0 38%, #ffcbba 100%)'
    },
    {
        id: 'aurora-boreal',
        name: '极光之境',
        base: 'dark',
        kind: 'gradient',
        primary: '#5eead4',
        background: '#0d1b1e',
        preview: 'linear-gradient(135deg, #0f2027 0%, #134e4a 45%, #5eead4 100%)',
        gradient: 'linear-gradient(160deg, #0b1a1d 0%, #10312f 42%, #173d38 100%)'
    },
    {
        id: 'nebula-dream',
        name: '星云迷梦',
        base: 'dark',
        kind: 'gradient',
        primary: '#c084fc',
        background: '#170f24',
        preview: 'linear-gradient(135deg, #2e1065 0%, #7e22ce 50%, #c084fc 100%)',
        gradient: 'linear-gradient(155deg, #150e22 0%, #241539 45%, #331b4f 100%)'
    },
    {
        id: 'ocean-deep',
        name: '深海幽蓝',
        base: 'dark',
        kind: 'gradient',
        primary: '#38bdf8',
        background: '#0b1622',
        preview: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #38bdf8 100%)',
        gradient: 'linear-gradient(165deg, #08131f 0%, #0d2436 45%, #12303f 100%)'
    },
    {
        id: 'candy-pop',
        name: '糖果梦境',
        base: 'light',
        kind: 'gradient',
        primary: '#f472b6',
        background: '#fef4f9',
        preview: 'linear-gradient(135deg, #fce7f3 0%, #f9a8d4 50%, #c084fc 100%)',
        gradient: 'linear-gradient(150deg, #fef6fb 0%, #fdeaf4 40%, #fadcec 100%)'
    },
    {
        id: 'sunset-glow',
        name: '暮色流金',
        base: 'dark',
        kind: 'gradient',
        primary: '#fbbf24',
        background: '#1f1508',
        preview: 'linear-gradient(135deg, #78350f 0%, #d97706 50%, #fbbf24 100%)',
        gradient: 'linear-gradient(160deg, #1a1206 0%, #2a1c0a 45%, #382512 100%)'
    },
    {
        id: 'mint-breeze',
        name: '薄荷微风',
        base: 'light',
        kind: 'gradient',
        primary: '#2dd4bf',
        background: '#f0fbfa',
        preview: 'linear-gradient(135deg, #d4fbf1 0%, #7fe7d2 48%, #3fc9b0 100%)',
        gradient: 'linear-gradient(150deg, #f2fdfa 0%, #dcf6ef 40%, #c3ece2 100%)'
    },
    {
        id: 'lavender-mist',
        name: '薰衣草雾',
        base: 'light',
        kind: 'gradient',
        primary: '#8b7cf6',
        background: '#f6f4fe',
        preview: 'linear-gradient(135deg, #e5dcff 0%, #b9a8f7 48%, #8b7cf6 100%)',
        gradient: 'linear-gradient(150deg, #f8f6ff 0%, #ece7fb 40%, #ded7f7 100%)'
    },
    {
        id: 'pine-shadow',
        name: '墨影深林',
        base: 'dark',
        kind: 'gradient',
        primary: '#4ade80',
        background: '#0c1810',
        preview: 'linear-gradient(135deg, #062012 0%, #14532d 48%, #4ade80 100%)',
        gradient: 'linear-gradient(160deg, #071a10 0%, #0f2c1c 44%, #173925 100%)'
    },
    {
        id: 'amber-ember',
        name: '暖褐余烬',
        base: 'dark',
        kind: 'gradient',
        primary: '#e8975c',
        background: '#1c1410',
        preview: 'linear-gradient(135deg, #3b2317 0%, #7c4a2d 48%, #e8975c 100%)',
        gradient: 'linear-gradient(160deg, #150e09 0%, #241811 44%, #322217 100%)'
    }
]

export const defaultPresetId = 'default-light'

export function findPreset(id: string | null | undefined): ThemePreset {
    return themePresets.find(p => p.id === id) || themePresets[0]
}
