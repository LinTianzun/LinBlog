import { findPreset, defaultPresetId, type ThemePreset } from './themes'

const PRESET_STORAGE_KEY = 'LINBLOG_THEME_PRESET'
const MODE_STORAGE_KEY = 'YIKE_THEME'
const EDGE_STORAGE_KEY = 'LINBLOG_THEME_EDGE'
const PRESET_ATTR = 'data-theme-preset'
const MODE_ATTR = 'data-theme'
const KIND_ATTR = 'data-theme-kind'
const EDGE_ATTR = 'data-theme-edge'
const PRESET_CHANGE_EVENT = 'theme:preset-change'

// 卡片渐变描边的强度：0 = 关闭（纯色主题默认行为），1~3 逐级加强
export type EdgeLevel = 0 | 1 | 2 | 3
export const EDGE_LEVELS: EdgeLevel[] = [0, 1, 2, 3]
export const EDGE_LEVEL_LABELS: Record<EdgeLevel, string> = {
    0: '关闭',
    1: '微弱',
    2: '标准',
    3: '明显'
}

const EDGE_ALPHAS: Record<EdgeLevel, string> = { 0: '0', 1: '0.55', 2: '0.85', 3: '1' }

export function getStoredEdgeLevel(): EdgeLevel {
    const raw = Number(localStorage.getItem(EDGE_STORAGE_KEY))
    return (EDGE_LEVELS as number[]).includes(raw) ? (raw as EdgeLevel) : 2
}

export function getStoredPresetId(): string {
    return localStorage.getItem(PRESET_STORAGE_KEY) || defaultPresetId
}

// 描边强度只由 CSS 消费：宽度与浓度一起写进属性，样式层无需再判等级
export function applyEdgeLevel(level: EdgeLevel): EdgeLevel {
    const root = document.documentElement
    root.setAttribute(EDGE_ATTR, String(level))
    localStorage.setItem(EDGE_STORAGE_KEY, String(level))
    return level
}

// 应用主题预设：切换 data-theme-preset 变量层，并把明暗基调同步给 yike（顶栏图标随之联动）
export function applyThemePreset(presetId: string): ThemePreset {
    const preset = findPreset(presetId)
    const root = document.documentElement
    const previousMode = localStorage.getItem(MODE_STORAGE_KEY)

    root.setAttribute(PRESET_ATTR, preset.id)
    root.setAttribute(MODE_ATTR, preset.base)
    // 主题类型写进属性，样式层用 :root[data-theme-kind='gradient'] 就能统一开启渐变专属装饰
    root.setAttribute(KIND_ATTR, preset.kind || 'solid')
    // 描边浓度单独存变量，宽度仍由强度等级控制：两者相乘才决定是否可见
    root.style.setProperty('--lin-edge-alpha', EDGE_ALPHAS[getStoredEdgeLevel()])
    localStorage.setItem(PRESET_STORAGE_KEY, preset.id)
    localStorage.setItem(MODE_STORAGE_KEY, preset.base)

    // VueUse 的 useStorage 只监听 storage 事件；手动派发让顶栏 yk-theme 图标同页同步
    window.dispatchEvent(new StorageEvent('storage', {
        key: MODE_STORAGE_KEY,
        oldValue: previousMode,
        newValue: preset.base,
        storageArea: localStorage
    }))
    window.dispatchEvent(new CustomEvent(PRESET_CHANGE_EVENT, { detail: { presetId: preset.id } }))

    return preset
}

export function initThemePreset(): ThemePreset {
    const preset = applyThemePreset(getStoredPresetId())
    applyEdgeLevel(getStoredEdgeLevel())
    watchManualModeToggle()
    return preset
}

// 顶栏快捷明暗切换只表达 light/dark 两种基调；与当前预设基调冲突时回落到默认主题，
// 避免出现「组件浅色 + 深色预设背景」的混搭状态
function watchManualModeToggle(): void {
    const observer = new MutationObserver(() => {
        const currentMode = document.documentElement.getAttribute(MODE_ATTR) === 'dark' ? 'dark' : 'light'
        const activePreset = findPreset(getStoredPresetId())
        if (activePreset.base !== currentMode) {
            applyThemePreset(currentMode === 'dark' ? 'default-dark' : 'default-light')
        }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [MODE_ATTR] })
}
