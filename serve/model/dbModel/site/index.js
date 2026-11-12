const { query } = require('../../db/dbnew')

// 站点级展示设置：单行表（id = 1），只存所有访客共享的开关。
// 读取失败或未初始化时按产品默认值返回，避免前端因为空表直接隐藏宠物。

const SIZE_VALUES = ['small', 'medium', 'large']
const ACTIVITY_VALUES = ['quiet', 'normal', 'lively']
const SCOPE_VALUES = ['all', 'portal', 'admin']
const CORNER_VALUES = ['left', 'right']
const SCALE_MIN = 60
const SCALE_MAX = 200
const OPACITY_MIN = 40
const OPACITY_MAX = 100

const DEFAULT_SETTINGS = {
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

const clampInt = (value, min, max, fallback) => {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(Math.max(Math.round(number), min), max)
}

async function getSettings() {
    const rows = await query('SELECT * FROM site_setting WHERE id = 1 LIMIT 1')
    const row = rows?.[0]
    if (!row) return { ...DEFAULT_SETTINGS }
    return {
        desktopPetEnabled: Number(row.desktop_pet_enabled) === 1,
        petSize: SIZE_VALUES.includes(row.pet_size) ? row.pet_size : DEFAULT_SETTINGS.petSize,
        petScale: clampInt(row.pet_scale, SCALE_MIN, SCALE_MAX, DEFAULT_SETTINGS.petScale),
        petActivity: ACTIVITY_VALUES.includes(row.pet_activity)
            ? row.pet_activity
            : DEFAULT_SETTINGS.petActivity,
        petRoamingEnabled: Number(row.pet_roaming_enabled) === 1,
        petDragEnabled: Number(row.pet_drag_enabled) === 1,
        petBubbleEnabled: Number(row.pet_bubble_enabled) === 1,
        petOpacity: clampInt(row.pet_opacity, OPACITY_MIN, OPACITY_MAX, DEFAULT_SETTINGS.petOpacity),
        petAutoSleepEnabled: Number(row.pet_auto_sleep_enabled) === 1,
        petHomeCorner: CORNER_VALUES.includes(row.pet_home_corner)
            ? row.pet_home_corner
            : DEFAULT_SETTINGS.petHomeCorner,
        petScope: SCOPE_VALUES.includes(row.pet_scope) ? row.pet_scope : DEFAULT_SETTINGS.petScope
    }
}

async function updateSettings(payload) {
    // 合并写入：未传的字段保持库里的值，避免只改一个开关时其他配置被重置
    const current = await getSettings()
    const next = {
        desktopPetEnabled: typeof payload.desktopPetEnabled === 'boolean'
            ? payload.desktopPetEnabled
            : current.desktopPetEnabled,
        petSize: SIZE_VALUES.includes(payload.petSize) ? payload.petSize : current.petSize,
        petScale: clampInt(payload.petScale, SCALE_MIN, SCALE_MAX, current.petScale),
        petActivity: ACTIVITY_VALUES.includes(payload.petActivity)
            ? payload.petActivity
            : current.petActivity,
        petRoamingEnabled: typeof payload.petRoamingEnabled === 'boolean'
            ? payload.petRoamingEnabled
            : current.petRoamingEnabled,
        petDragEnabled: typeof payload.petDragEnabled === 'boolean'
            ? payload.petDragEnabled
            : current.petDragEnabled,
        petBubbleEnabled: typeof payload.petBubbleEnabled === 'boolean'
            ? payload.petBubbleEnabled
            : current.petBubbleEnabled,
        petOpacity: clampInt(payload.petOpacity, OPACITY_MIN, OPACITY_MAX, current.petOpacity),
        petAutoSleepEnabled: typeof payload.petAutoSleepEnabled === 'boolean'
            ? payload.petAutoSleepEnabled
            : current.petAutoSleepEnabled,
        petHomeCorner: CORNER_VALUES.includes(payload.petHomeCorner)
            ? payload.petHomeCorner
            : current.petHomeCorner,
        petScope: SCOPE_VALUES.includes(payload.petScope) ? payload.petScope : current.petScope
    }

    await query(
        `INSERT INTO site_setting
            (id, desktop_pet_enabled, pet_size, pet_scale, pet_activity,
             pet_roaming_enabled, pet_drag_enabled, pet_bubble_enabled, pet_opacity,
             pet_auto_sleep_enabled, pet_home_corner, pet_scope)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            desktop_pet_enabled = VALUES(desktop_pet_enabled),
            pet_size = VALUES(pet_size),
            pet_scale = VALUES(pet_scale),
            pet_activity = VALUES(pet_activity),
            pet_roaming_enabled = VALUES(pet_roaming_enabled),
            pet_drag_enabled = VALUES(pet_drag_enabled),
            pet_bubble_enabled = VALUES(pet_bubble_enabled),
            pet_opacity = VALUES(pet_opacity),
            pet_auto_sleep_enabled = VALUES(pet_auto_sleep_enabled),
            pet_home_corner = VALUES(pet_home_corner),
            pet_scope = VALUES(pet_scope)`,
        [
            next.desktopPetEnabled ? 1 : 0,
            next.petSize,
            next.petScale,
            next.petActivity,
            next.petRoamingEnabled ? 1 : 0,
            next.petDragEnabled ? 1 : 0,
            next.petBubbleEnabled ? 1 : 0,
            next.petOpacity,
            next.petAutoSleepEnabled ? 1 : 0,
            next.petHomeCorner,
            next.petScope
        ]
    )
    return getSettings()
}

module.exports = { getSettings, updateSettings, DEFAULT_SETTINGS }
