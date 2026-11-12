import request from '../utils/request'

export interface SiteSettings {
    desktopPetEnabled: boolean
    petSize: 'small' | 'medium' | 'large'
    /** 尺寸缩放百分比（60-200），在大小档位基础上叠加 */
    petScale: number
    petActivity: 'quiet' | 'normal' | 'lively'
    petRoamingEnabled: boolean
    petDragEnabled: boolean
    /** 是否显示气泡与随机碎碎念 */
    petBubbleEnabled: boolean
    /** 不透明度百分比（40-100） */
    petOpacity: number
    /** 无操作一段时间后是否自动入睡 */
    petAutoSleepEnabled: boolean
    /** 「回到原位」与首次出现时停靠的角落 */
    petHomeCorner: 'left' | 'right'
    /** 显示范围：全站 / 仅门户 / 仅后台 */
    petScope: 'all' | 'portal' | 'admin'
}

// 站点级展示设置：桌宠开关对所有访客一致，公开读取
export function getSiteSettings() {
    return request.get<{ code: number; message: string; data: SiteSettings }>(
        '/site/settings'
    )
}

// 仅拥有 permission.edit 的账号可修改
export function updateSiteSettings(payload: SiteSettings) {
    return request.put<{ code: number; message: string; data: SiteSettings }>(
        '/site/settings',
        payload
    )
}
