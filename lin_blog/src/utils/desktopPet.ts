import type { SiteSettings } from '../api/site'

const STORAGE_KEY = 'LINBLOG_DESKTOP_PET_SETTINGS'
const LEGACY_ENABLED_KEY = 'LINBLOG_DESKTOP_PET_ENABLED'
const CHANGE_EVENT = 'desktop-pet:settings-change'

export type DesktopPetSettings = SiteSettings

export const DEFAULT_DESKTOP_PET_SETTINGS: DesktopPetSettings = {
    desktopPetEnabled: true,
    petSize: 'medium',
    petScale: 100,
    petActivity: 'normal',
    petRoamingEnabled: true,
    petDragEnabled: true,
    petBubbleEnabled: true,
    petOpacity: 100,
    petAutoSleepEnabled: true,
    petHomeCorner: 'right',
    petScope: 'all'
}

const SIZE_VALUES: DesktopPetSettings['petSize'][] = ['small', 'medium', 'large']
const ACTIVITY_VALUES: DesktopPetSettings['petActivity'][] = ['quiet', 'normal', 'lively']
const HOME_CORNER_VALUES: DesktopPetSettings['petHomeCorner'][] = ['left', 'right']
const SCOPE_VALUES: DesktopPetSettings['petScope'][] = ['all', 'portal', 'admin']

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(Math.max(Math.round(number), min), max)
}

const pickEnum = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
    values.includes(value as T) ? (value as T) : fallback

const pickBoolean = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback

/** 服务端字段可能缺失（旧版本 / 部分响应），统一补全并纠正越界值 */
export function normalizeDesktopPetSettings(
    value?: Partial<DesktopPetSettings> | null
): DesktopPetSettings {
    const raw = value || {}
    return {
        desktopPetEnabled: pickBoolean(
            raw.desktopPetEnabled,
            DEFAULT_DESKTOP_PET_SETTINGS.desktopPetEnabled
        ),
        petSize: pickEnum(raw.petSize, SIZE_VALUES, DEFAULT_DESKTOP_PET_SETTINGS.petSize),
        petScale: clampInt(raw.petScale, 60, 200, DEFAULT_DESKTOP_PET_SETTINGS.petScale),
        petActivity: pickEnum(
            raw.petActivity,
            ACTIVITY_VALUES,
            DEFAULT_DESKTOP_PET_SETTINGS.petActivity
        ),
        petRoamingEnabled: pickBoolean(
            raw.petRoamingEnabled,
            DEFAULT_DESKTOP_PET_SETTINGS.petRoamingEnabled
        ),
        petDragEnabled: pickBoolean(
            raw.petDragEnabled,
            DEFAULT_DESKTOP_PET_SETTINGS.petDragEnabled
        ),
        petBubbleEnabled: pickBoolean(
            raw.petBubbleEnabled,
            DEFAULT_DESKTOP_PET_SETTINGS.petBubbleEnabled
        ),
        petOpacity: clampInt(raw.petOpacity, 40, 100, DEFAULT_DESKTOP_PET_SETTINGS.petOpacity),
        petAutoSleepEnabled: pickBoolean(
            raw.petAutoSleepEnabled,
            DEFAULT_DESKTOP_PET_SETTINGS.petAutoSleepEnabled
        ),
        petHomeCorner: pickEnum(
            raw.petHomeCorner,
            HOME_CORNER_VALUES,
            DEFAULT_DESKTOP_PET_SETTINGS.petHomeCorner
        ),
        petScope: pickEnum(raw.petScope, SCOPE_VALUES, DEFAULT_DESKTOP_PET_SETTINGS.petScope)
    }
}

/** 读本地缓存；未配置时回落到默认值（兼容旧版本只存开关的 key） */
export function getDesktopPetSettings(): DesktopPetSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            return normalizeDesktopPetSettings(
                JSON.parse(raw) as Partial<DesktopPetSettings>
            )
        }
        if (localStorage.getItem(LEGACY_ENABLED_KEY) === '0') {
            return { ...DEFAULT_DESKTOP_PET_SETTINGS, desktopPetEnabled: false }
        }
    } catch {
        // 读取失败用默认值
    }
    return { ...DEFAULT_DESKTOP_PET_SETTINGS }
}

/** 写缓存并广播：设置页保存成功后通知同一页面的桌宠立即应用 */
export function setDesktopPetSettings(settings: DesktopPetSettings): void {
    const normalized = normalizeDesktopPetSettings(settings)
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    } catch {
        // 隐私模式下写入失败只影响首屏缓存
    }
    broadcastDesktopPetSettings(normalized)
}

/** 只广播不落盘：设置页拖动滑块时让桌宠实时预览 */
export function broadcastDesktopPetSettings(settings: DesktopPetSettings): void {
    const detail = normalizeDesktopPetSettings(settings)
    window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail })
    )
}

/** 订阅设置变化；返回取消订阅函数 */
export function onDesktopPetSettingsChange(
    handler: (settings: DesktopPetSettings) => void
): () => void {
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<DesktopPetSettings>).detail
        handler(normalizeDesktopPetSettings(detail))
    }
    window.addEventListener(CHANGE_EVENT, listener)
    return () => window.removeEventListener(CHANGE_EVENT, listener)
}

export type DesktopPetCommand = 'home' | 'sleep' | 'wake' | 'speak' | 'homestead'

const COMMAND_EVENT = 'desktop-pet:command'

/** 设置页向桌宠发送一次性动作指令（不参与持久化） */
export function sendDesktopPetCommand(command: DesktopPetCommand): void {
    window.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail: command }))
}

/** 订阅设置页下发的动作指令；返回取消订阅函数 */
export function onDesktopPetCommand(
    handler: (command: DesktopPetCommand) => void
): () => void {
    const listener = (event: Event) => {
        const command = (event as CustomEvent<DesktopPetCommand>).detail
        if (command) handler(command)
    }
    window.addEventListener(COMMAND_EVENT, listener)
    return () => window.removeEventListener(COMMAND_EVENT, listener)
}
