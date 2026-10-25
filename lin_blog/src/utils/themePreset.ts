import { findPreset, defaultPresetId, type ThemePreset } from './themes'

const PRESET_STORAGE_KEY = 'LINBLOG_THEME_PRESET'
const MODE_STORAGE_KEY = 'YIKE_THEME'
const PRESET_ATTR = 'data-theme-preset'
const MODE_ATTR = 'data-theme'
const PRESET_CHANGE_EVENT = 'theme:preset-change'

export function getStoredPresetId(): string {
    return localStorage.getItem(PRESET_STORAGE_KEY) || defaultPresetId
}

// 应用主题预设：切换 data-theme-preset 变量层，并把明暗基调同步给 yike（顶栏图标随之联动）
export function applyThemePreset(presetId: string): ThemePreset {
    const preset = findPreset(presetId)
    const root = document.documentElement
    const previousMode = localStorage.getItem(MODE_STORAGE_KEY)

    root.setAttribute(PRESET_ATTR, preset.id)
    root.setAttribute(MODE_ATTR, preset.base)
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
