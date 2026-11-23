<template>
    <aside class="menu-bar" aria-label="后台主导航">
        <div class="menu-bar-brand">
            <span class="menu-bar-brand-mark" aria-hidden="true">林</span>
            <span class="menu-bar-brand-copy">
                <strong>创作后台</strong>
                <small>内容与系统管理</small>
            </span>
        </div>

        <div class="menu-bar-scroll">
            <nav class="menu-bar-nav-list">
                <section v-for="group in menuGroups" :key="group.label" class="menu-bar-group">
                    <p class="menu-bar-group-label">{{ group.label }}</p>
                    <router-link class="menu-bar-nav" :to="item.path" v-for="item in group.items" :key="item.path"
                        :aria-current="isActive(item.path) ? 'page' : undefined">
                        <span class="menu-bar-icon">
                            <component :is="item.icon" />
                        </span>
                        <span class="menu-bar-name">{{ item.name }}</span>
                        <button v-if="item.path === '/notes' && noLinkCount > 0" type="button"
                            class="menu-bar-badge is-warn"
                            :aria-label="`${noLinkCount} 篇笔记还没有双链，打开待整理清单`"
                            :title="`${noLinkCount} 篇笔记还没有双链`" @click.stop="goNoteTidy">
                            {{ noLinkCount > 99 ? '99+' : noLinkCount }}
                        </button>
                        <span v-if="item.path === '/reportedComments' && pendingReportCount > 0"
                            class="menu-bar-badge" :aria-label="`${pendingReportCount} 条待处理举报`">
                            {{ pendingReportBadge }}
                        </span>
                    </router-link>
                </section>
            </nav>
        </div>

        <div class="menu-bar-foot">
            <span class="menu-bar-status-dot" aria-hidden="true" />
            <span>工作区已连接</span>
        </div>
    </aside>
</template>


<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    navLinks
} from '../../utils/menu'
import { resolveMenuIcon } from '../../utils/menuIcons'
import { useSessionStore } from '../../store/session'
import { getCommentReports } from '../../api/commentReport'
import { getNotes } from '../../api/note'
import { REPORT_STATE_EVENT } from '../../utils/commentReportWorkbench'
import { hasMenuPermission } from '../../utils/menuPermissions'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const pendingReportCount = ref(0)
// 花园待整理：已发布但没有任何出发/反向链接的笔记数
const noLinkCount = ref(0)

const isActive = (path: string): boolean => {
    const target = path.startsWith('/') ? path : `/${path}`
    return route.path === target || route.path.startsWith(`${target}/`)
}

const pendingReportBadge = computed(() =>
    pendingReportCount.value > 99 ? '99+' : String(pendingReportCount.value)
)

// 徽标不能嵌套在 <router-link>（<a> 不允许嵌套 <a>），改成按钮后手动导航
const goNoteTidy = (): void => {
    void router.push('/notes/tidy')
}

// 菜单权限映射见 utils/menuPermissions.ts（模块级常量，避免 setup 时序问题）
const hasMenuAccess = (path: string): boolean => {
    return hasMenuPermission(path, session.can)
}

const visibleLinks = computed(() => {
            // 无权限声明或命中任一权限才显示；系统设置保持登录即可见
    return navLinks.filter(item => hasMenuAccess(item.path))
})

const menuGroups = computed(() => {
    const links = visibleLinks.value
    const groupConfig = [
        {
            label: '运营',
            // 权限管理紧跟用户管理：同一入口组，超级管理员改完矩阵能立刻回用户列表看成员
            paths: ['/overView', '/contentHealth', '/siteInsights', '/userManagement', '/permissionManagement', '/reportedComments', '/messages', '/systemLog', '/aiManage', '/aiPrompt'],
        },
        {
            label: '内容',
            paths: ['/localfile', '/article', '/draftBox', '/collectionManage', '/scheduledPublish', '/gallery', '/diary', '/notes'],
        },
        {
            label: '系统',
            paths: ['/petManage', '/setting'],
        },
    ]

    return groupConfig
        .map(group => ({
            label: group.label,
            items: links
                .filter(item => group.paths.includes(item.path))
                .map(item => ({
                    ...item,
                    // 图标名字符串换成组件，侧栏才能渲染出图标
                    icon: resolveMenuIcon(item.icon),
                })),
        }))
        .filter(group => group.items.length > 0)
})

const refreshPendingReports = async (): Promise<void> => {
    if (!session.can('comment.moderate')) {
        pendingReportCount.value = 0
        return
    }

    try {
        const result = await getCommentReports({ page: 1, pageSize: 1, status: 0 })
        if (result.code === 200 && result.data) {
            pendingReportCount.value = Math.max(0, Number(result.data.summary.pending) || 0)
        }
    } catch {
        // 角标失败不影响侧栏导航，下一次路由变化或举报状态更新会重试
    }
}

const refreshNoLinkNotes = async (): Promise<void> => {
    // 后台侧栏只对登录用户渲染；请求失败静默忽略，不阻塞导航
    try {
        const result = await getNotes({ page: 1, pageSize: 50, state: 'published' })
        if (result.code === 200 && result.data) {
            noLinkCount.value = result.data.list
                .filter(note => note.outgoingLinks === 0 && note.incomingLinks === 0)
                .length
        }
    } catch {
        // 花园提示失败不影响主导航
    }
}

const handleReportStateChange = (): void => {
    void refreshPendingReports()
}

onMounted(() => {
    window.addEventListener(REPORT_STATE_EVENT, handleReportStateChange)
    void refreshPendingReports()
    void refreshNoLinkNotes()
})

onBeforeUnmount(() => {
    window.removeEventListener(REPORT_STATE_EVENT, handleReportStateChange)
})

watch(
    () => [route.path, session.permissions.join('|'), session.isSuperAdmin],
    () => {
        void refreshPendingReports()
        void refreshNoLinkNotes()
    }
)
</script>

<style lang="less" scoped>
    .menu-bar {
        box-sizing: border-box;
        width: var(--admin-sidebar-width, 224px);
        height: calc(100vh - 88px);
        padding: 12px;
        position: fixed;
        top: 76px;
        left: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        border: 1px solid var(--admin-line, var(--gray1));
        border-radius: 20px;
        background:
            linear-gradient(180deg, var(--pcolor1), transparent 170px),
            color-mix(in srgb, var(--bgColor1) 92%, var(--bgColor2));
        box-shadow: var(--admin-shadow-sm);

        &-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 8px 12px;
            border-bottom: 1px solid var(--admin-line, var(--gray1));
        }

        &-brand-mark {
            display: grid;
            width: 34px;
            height: 34px;
            flex: none;
            place-items: center;
            border-radius: 11px;
            color: #fff;
            background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
            box-shadow: 0 7px 18px var(--pcolor3);
            font-size: 15px;
            font-weight: 750;
        }

        &-brand-copy {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;

            strong {
                color: var(--gray);
                font-size: 14px;
                font-weight: 700;
            }

            small {
                overflow: hidden;
                color: var(--gray6);
                font-size: 11px;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        }

        &-scroll {
            min-height: 0;
            flex: 1;
            overflow-y: auto;
            scrollbar-width: thin;
        }

        &-nav-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        &-group {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        &-group-label {
            margin: 0;
            padding: 0 10px 5px;
            color: var(--gray6);
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.08em;
        }

        &-nav {
            display: flex;
            width: 100%;
            height: 38px;
            box-sizing: border-box;
            border: 1px solid transparent;
            border-radius: 11px;
            padding: 0 10px;
            align-items: center;
            gap: 10px;
            color: var(--gray8);
            text-decoration: none;
            user-select: none;
            transition: color 160ms ease, background 160ms ease, border-color 160ms ease;

            .menu-bar-icon {
                display: grid;
                width: 26px;
                height: 26px;
                flex: none;
                place-items: center;
                border-radius: 8px;
                color: var(--gray6);
                background: transparent;
                box-shadow: none;
                transition: color 160ms ease, background 160ms ease;

                .yk-icon {
                    width: 15px;
                    height: 15px;
                }
            }

            .menu-bar-name {
                overflow: hidden;
                flex: 1;
                font-size: 13px;
                font-weight: 550;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            &:hover {
                border-color: var(--pcolor3);
                color: var(--pcolor);
                background: var(--pcolor1);

                .menu-bar-icon {
                    color: var(--pcolor);
                    background: var(--pcolor2);
                }
            }
        }

        .router-link-active {
            border-color: var(--pcolor3);
            background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
            color: #fff;
            box-shadow: none;

            .menu-bar-icon {
                color: #fff;
                background: rgba(255, 255, 255, 0.15);
                box-shadow: none;
            }

            .menu-bar-name {
                font-weight: 700;
            }

            .menu-bar-badge {
                border-color: rgba(255, 255, 255, 0.24);
                background: rgba(255, 255, 255, 0.18);
                color: #fff;
            }

            &:hover {
                border-color: transparent;
                color: #fff;
                background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
            }
        }

        &-badge {
            display: inline-grid;
            min-width: 20px;
            height: 20px;
            box-sizing: border-box;
            flex: none;
            margin: 0;
            place-items: center;
            padding: 0 6px;
            border: 1px solid color-mix(in srgb, @ecolor 24%, transparent);
            border-radius: 999px;
            background: color-mix(in srgb, @ecolor 10%, transparent);
            color: @ecolor;
            font-family: inherit;
            font-size: 10px;
            font-weight: 750;
            font-variant-numeric: tabular-nums;
            line-height: 1;
            cursor: pointer;

        &.is-warn {
            border-color: color-mix(in srgb, var(--wcolor, #ffaa1a) 28%, transparent);
            background: color-mix(in srgb, var(--wcolor, #ffaa1a) 12%, transparent);
            color: var(--wcolor, #ffaa1a);
        }
        }

        &-foot {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 8px 2px;
            border-top: 1px solid var(--admin-line, var(--gray1));
            color: var(--gray6);
            font-size: 11px;
        }

        &-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--scolor, #1fb4a2);
            box-shadow: 0 0 0 4px color-mix(in srgb, var(--scolor, #1fb4a2) 14%, transparent);
        }
    }

    @media (max-width: 900px) {
        .menu-bar {
            top: 72px;
            right: 12px;
            left: 12px;
            width: auto;
            height: auto;
            padding: 8px;
            border-radius: 14px;

            &-brand,
            &-foot,
            &-group-label {
                display: none;
            }

            &-scroll {
                overflow-x: auto;
                overflow-y: hidden;
                scrollbar-width: none;

                &::-webkit-scrollbar {
                    display: none;
                }
            }

            &-nav-list {
                flex-direction: row;
                gap: 4px;
            }

            &-group {
                flex-direction: row;
                gap: 4px;
            }

            &-nav {
                width: auto;
                height: 34px;
                flex: none;
                padding: 0 10px;

                .menu-bar-icon {
                    width: 22px;
                    height: 22px;
                }
            }
        }
    }
</style>
