/**
 * 菜单 / 总览卡片用的图标组件表。
 *
 * utils/menu.ts 里存的是图标名字符串（如 'IconFileFill'），
 * 直接把字符串交给 <component :is> 在运行时无法解析，卡片就会没有图标。
 * 这里统一按名字映射到真正的组件，业务侧用 resolveMenuIcon(name) 取组件，
 * menu.ts 的配置数据保持不动。
 */
import { markRaw, type Component } from 'vue'
import {
    IconAvatarFill,
    IconFileFill,
    IconFillFill,
    IconFolderCloseFill,
    IconHomepageFill,
    IconImageFill,
    IconMailOutline,
    IconSecurityOutline,
    IconSettingsFill,
    IconStatisticsFill,
    IconWarningOutline,
} from '@yike-design/ui/es/components/svg-icon'

const iconMap: Record<string, Component> = {
    IconAvatarFill,
    IconFileFill,
    IconFillFill,
    IconFolderCloseFill,
    IconHomepageFill,
    IconImageFill,
    IconMailOutline,
    IconSecurityOutline,
    IconSettingsFill,
    IconStatisticsFill,
    IconWarningOutline,
}

// markRaw：图标组件不需要响应式代理，避免 Vue 对组件对象做无谓的深度代理
export const resolveMenuIcon = (name?: string): Component | '' => {
    if (!name) return ''
    return iconMap[name] ? markRaw(iconMap[name]) : ''
}
