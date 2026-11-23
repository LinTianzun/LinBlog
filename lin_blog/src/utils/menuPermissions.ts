/**
 * 侧栏入口与权限的映射表。
 *
 * 必须放在独立模块（模块顶层常量），不能写在 MenuBar.vue 的 <script setup> 里：
 * setup 内的 const 会被编译成每个实例化时重新赋值的局部绑定，
 * 在 devtools inspector / HMR 等渲染时机可能读到未初始化的值，
 * 一旦 `MENU_PERMISSIONS[path]` 抛错，computed 渲染失败会让侧栏
 * 退化为「全部入口可见」，权限隔离形同虚设（已由 E2E 权限用例锁定）。
 */

// 入口是否出现完全由权限矩阵决定，不再按角色挑选候选集。
// 总览是全站统计，按 overview.viewAll 收窄；系统设置对所有登录用户开放（空数组）。
const MENU_PERMISSIONS: Record<string, string[]> = {
    overView: ['overview.viewAll'],
    contentHealth: ['contentHealth.view'],
    siteInsights: ['siteInsights.view'],
    userManagement: ['user.view'],
    permissionManagement: ['permission.view'],
    systemLog: ['systemLog.view'],
    aiManage: ['ai.manage'],
    aiPrompt: ['ai.manage'],
    reportedComments: ['comment.moderate'],
    messages: ['message.private'],
    localfile: ['file.view'],
    article: ['article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll'],
    collectionManage: ['collection.view', 'collection.manage'],
    scheduledPublish: ['schedule.manage'],
    draftBox: [
        'article.viewAll', 'article.create', 'article.manageOwn', 'article.manageAll',
        'gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll',
    ],
    gallery: ['gallery.viewAll', 'gallery.create', 'gallery.manageOwn', 'gallery.manageAll'],
    diary: ['diary.viewAll', 'diary.create', 'diary.manageOwn', 'diary.manageAll'],
    notes: [],
    petManage: ['pet.manage'],
    setting: [],
}

export function hasMenuPermission(path: string, can: (key: string) => boolean): boolean {
    const key = path.replace(/^\//, '')
    const required = MENU_PERMISSIONS[key]
    return !required || required.length === 0 || required.some(item => can(item))
}
