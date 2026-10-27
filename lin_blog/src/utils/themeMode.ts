import { useDark } from '@vueuse/core'

/*
 * 全站统一的明暗状态入口。
 *
 * 背景：data-theme 由 themePreset.ts 负责写入（值只可能是 light / dark），
 * 但 yike 的 useDark 默认把浅色写成空字符串 ''，且默认存储键是
 * 'vueuse-color-scheme'（与 themePreset 用的 'YIKE_THEME' 无关）。
 * 两者同时存在时：
 *   1. 组件重新挂载会用 '' 覆盖 data-theme；
 *   2. themePreset 的 MutationObserver 把 '' 当成「手动切到浅色」，
 *      于是把深色预设回落到 default-light —— 表现为切换页面后主题被重置。
 *
 * 因此所有需要读取明暗的组件都走这里：共用 YIKE_THEME 存储键与
 * themePreset 保持一致，并把 light 显式写成 'light' 而不是 ''。
 */
export function useThemeDark() {
    return useDark({
        attribute: 'data-theme',
        selector: 'html',
        storageKey: 'YIKE_THEME',
        valueLight: 'light',
        valueDark: 'dark'
    })
}
