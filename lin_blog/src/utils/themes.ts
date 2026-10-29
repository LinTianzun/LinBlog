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
        name: '暖砂流光',
        base: 'light',
        kind: 'gradient',
        primary: '#f97362',
        background: '#fffaf5',
        preview: 'linear-gradient(135deg, #ffd2ad 0%, #fb9d76 45%, #f97362 100%)',
        gradient: 'linear-gradient(150deg, #fff6ec 0%, #ffe4d3 38%, #ffcdc6 100%)'
    },
    {
        id: 'honey-dawn',
        name: '蜜糖薄暮',
        base: 'light',
        kind: 'gradient',
        primary: '#cf9410',
        background: '#fffdf6',
        preview: 'linear-gradient(135deg, #fdeaa8 0%, #f0c04a 45%, #cf9410 100%)',
        gradient: 'linear-gradient(150deg, #fffbf0 0%, #fbeecd 38%, #f7e0ac 100%)'
    },
    {
        id: 'citrus-pop',
        name: '青柠气泡',
        base: 'light',
        kind: 'gradient',
        primary: '#7aa30f',
        background: '#fdfff6',
        preview: 'linear-gradient(135deg, #e4f5a0 0%, #b3d94a 45%, #7aa30f 100%)',
        gradient: 'linear-gradient(150deg, #fdfff2 0%, #f3fadc 38%, #e7f4c4 100%)'
    },
    {
        id: 'mint-breeze',
        name: '浅滩涟漪',
        base: 'light',
        kind: 'gradient',
        primary: '#0eb0c2',
        background: '#f7fdfd',
        preview: 'linear-gradient(135deg, #c4f2f4 0%, #62d6e3 45%, #0eb0c2 100%)',
        gradient: 'linear-gradient(150deg, #f2fdfd 0%, #dff4f7 38%, #c9eaf1 100%)'
    },
    {
        id: 'lavender-mist',
        name: '雨后蓝紫',
        base: 'light',
        kind: 'gradient',
        primary: '#6f76ee',
        background: '#fafbff',
        preview: 'linear-gradient(135deg, #d5d6fb 0%, #9895f4 45%, #6f76ee 100%)',
        gradient: 'linear-gradient(150deg, #f8f9ff 0%, #e8eafd 38%, #dbdef9 100%)'
    },
    {
        id: 'candy-pop',
        name: '晚樱初雪',
        base: 'light',
        kind: 'gradient',
        primary: '#c05fe0',
        background: '#fdfafd',
        preview: 'linear-gradient(135deg, #f5cff4 0%, #d98bf0 45%, #c05fe0 100%)',
        gradient: 'linear-gradient(150deg, #fdf8fd 0%, #f5e8fa 38%, #ebdcf7 100%)'
    },
    {
        id: 'aurora-boreal',
        name: '极夜微光',
        base: 'dark',
        kind: 'gradient',
        primary: '#5eead4',
        background: '#133036',
        preview: 'linear-gradient(135deg, #062a33 0%, #0d4a55 45%, #5eead4 100%)',
        gradient: 'linear-gradient(160deg, #05262b 0%, #0a3a3c 42%, #12304a 100%)'
    },
    {
        id: 'nebula-dream',
        name: '深空星尘',
        base: 'dark',
        kind: 'gradient',
        primary: '#c084fc',
        background: '#241539',
        preview: 'linear-gradient(135deg, #3b1173 0%, #7e22ce 50%, #c084fc 100%)',
        gradient: 'linear-gradient(155deg, #1a0b2b 0%, #2d1152 45%, #2a1a5e 100%)'
    },
    {
        id: 'ocean-deep',
        name: '幽蓝海沟',
        base: 'dark',
        kind: 'gradient',
        primary: '#38bdf8',
        background: '#132b3c',
        preview: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #38bdf8 100%)',
        gradient: 'linear-gradient(165deg, #04141f 0%, #0a2438 45%, #0d3348 100%)'
    },
    {
        id: 'sunset-glow',
        name: '炭火余烬',
        base: 'dark',
        kind: 'gradient',
        primary: '#fbbf24',
        background: '#33230f',
        preview: 'linear-gradient(135deg, #78350f 0%, #d97706 50%, #fbbf24 100%)',
        gradient: 'linear-gradient(160deg, #1c1006 0%, #33200e 45%, #3d1c1c 100%)'
    },
    {
        id: 'pine-shadow',
        name: '苔痕深林',
        base: 'dark',
        kind: 'gradient',
        primary: '#4ade80',
        background: '#14291c',
        preview: 'linear-gradient(135deg, #062012 0%, #14532d 48%, #4ade80 100%)',
        gradient: 'linear-gradient(160deg, #05170f 0%, #0d2b1a 45%, #0f2f2c 100%)'
    },
    {
        id: 'amber-ember',
        name: '秋叶沉塘',
        base: 'dark',
        kind: 'gradient',
        primary: '#e8975c',
        background: '#2b1d13',
        preview: 'linear-gradient(135deg, #3b2317 0%, #7c4a2d 48%, #e8975c 100%)',
        gradient: 'linear-gradient(160deg, #150e09 0%, #2a1a0e 45%, #382609 100%)'
    }
]

export const defaultPresetId = 'default-light'

export function findPreset(id: string | null | undefined): ThemePreset {
    return themePresets.find(p => p.id === id) || themePresets[0]
}
