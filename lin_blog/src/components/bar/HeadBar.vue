<template>
    <div class="head-bar">
        <button type="button" class="brand" title="返回系统总览" @click="backHome">
            <span class="logo-wrap">
                <img :src="isDark ? unityW : unity" class="logo" alt="">
            </span>
            <span class="brand-copy">
                <strong class="name">林知雨博客后台</strong>
                <small>内容与运营控制台</small>
            </span>
        </button>

        <div class="head-actions">
            <button v-if="canUseMessages" type="button" class="icon-button inbox-button" title="私信" aria-label="打开私信"
                @click="openInbox">
                <yk-badge :is-dot="hasUnread">
                    <IconMailOutline />
                </yk-badge>
            </button>

            <button type="button" class="user-chip" title="打开个人信息" @click="goSetting">
                <yk-avatar :size="32" :img-url="userInfo?.imgurl || defaultAvatar" class="user-avatar" />
                <span class="user-copy">
                    <strong class="user-name">{{ userInfo?.username || '用户' }}</strong>
                    <small>{{ roleLabel }}</small>
                </span>
            </button>

            <!-- 主题切换：与前台门户同款自研下拉，复用同一套预设与 applyThemePreset -->
            <div ref="pickerRef" class="theme-picker">
                <button type="button" class="theme-trigger" :class="{ open: themeOpen }"
                    :title="`当前主题：${activePresetName}`" aria-haspopup="listbox"
                    :aria-expanded="themeOpen" @click="toggleThemePanel"
                    @keydown.down.prevent="openThemePanel" @keydown.up.prevent="openThemePanel">
                    <span class="theme-dot" :style="{ background: activePresetPrimary }" aria-hidden="true" />
                    <span class="theme-name">{{ activePresetName }}</span>
                    <span class="theme-caret" aria-hidden="true">
                        <IconDownOutline />
                    </span>
                </button>

                <Transition name="theme-panel">
                    <div v-if="themeOpen" class="theme-panel" role="listbox" aria-label="选择主题">
                        <div class="theme-panel-head">
                            <span>主题</span>
                            <span class="theme-panel-hint">{{ themePresets.length }} 套</span>
                        </div>
                        <ul class="theme-options">
                            <li v-for="(preset, index) in themePresets" :key="preset.id">
                                <button type="button" class="theme-option" role="option"
                                    :class="{ active: preset.id === activePresetId }"
                                    :aria-selected="preset.id === activePresetId"
                                    :style="{ animationDelay: `${Math.min(index, 10) * 24}ms` }"
                                    @click="selectPreset(preset.id)">
                                    <span class="option-swatch"
                                        :style="{ background: preset.preview || `linear-gradient(135deg, ${preset.primary}, ${preset.background})` }"
                                        aria-hidden="true" />
                                    <span class="option-name">{{ preset.name }}</span>
                                    <span v-if="preset.kind === 'gradient'" class="option-kind">渐变</span>
                                    <span class="option-tick" aria-hidden="true">
                                        <IconTickOutline />
                                    </span>
                                </button>
                            </li>
                        </ul>
                    </div>
                </Transition>
            </div>

            <yk-button class="portal-button" type="secondary" @click="goPortal">
                <IconAppOutline />
                我的博客
            </yk-button>
            <yk-button class="exit-button" @click="quit">退出</yk-button>
        </div>

        <information :active="active" @close="changeActive(false)" @read="fetchUnread" />
    </div>

</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import unity from '../../assets/svg/unity.svg'
import unityW from '../../assets/svg/unityWhite.svg'
import { information } from '../reply/index.ts'
import { getUnreadCount } from '../../api/message'
import { useThemeDark } from '../../utils/themeMode'
import { onClickOutside } from '@vueuse/core'
import { themePresets, findPreset } from '../../utils/themes'
import { applyThemePreset, getStoredPresetId } from '../../utils/themePreset'
import { useSessionStore } from '../../store/session'

const isDark = useThemeDark()
const session = useSessionStore()

// 主题预设下拉：与门户同一套数据与切换逻辑
const activePresetId = ref(getStoredPresetId())
const activePresetName = computed(() => findPreset(activePresetId.value).name)
const activePresetPrimary = computed(() => findPreset(activePresetId.value).primary)
const pickerRef = ref<HTMLElement | null>(null)
const themeOpen = ref(false)
const toggleThemePanel = () => { themeOpen.value = !themeOpen.value }
const openThemePanel = () => { themeOpen.value = true }
const selectPreset = (presetId: string) => {
    activePresetId.value = presetId
    applyThemePreset(presetId)
    themeOpen.value = false
}
onClickOutside(pickerRef, () => { themeOpen.value = false })
const onGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') themeOpen.value = false
}
const onPresetChange = (event: Event) => {
    const presetId = (event as CustomEvent<{ presetId: string }>).detail?.presetId
    if (presetId) activePresetId.value = presetId
}

const router = useRouter();

//  返回总览
const backHome = () => {
    router.push('/')
}

// 头像直达系统设置页的个人信息卡
const goSetting = () => {
    router.push('/setting')
}

// 后台一键直达访客门户
const goPortal = () => {
    router.push('/portal')
}

// 退出登录
const quit = () => {
    // 清除本地登录信息
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    // 同步清空权限快照，避免下一次登录前残留旧权限
    session.clear()

    // 跳转到登录页
    router.push('/loginRegister')
}

const userInfo = ref<Record<string, any>>({})

// 角色只用于展示；是否可用私信等能力由权限矩阵决定
const roleLabel = computed(() => {
    if (session.isSuperAdmin) return '超级管理员'
    const labels: Record<string, string> = {
        admin: '管理员',
        editor: '编辑',
        normal: '普通用户',
        visitor: '游客',
    }
    return labels[userInfo.value?.user_type] || '游客'
})

const canUseMessages = computed(() => session.can('message.private'))

const defaultAvatar = '/src/assets/img/xw11.jpg'

//  打开私信
const active = ref(false)

const changeActive = (e: any) => {
    active.value = e
    // 抽屉关闭时可能已读完/删掉未读消息，刷新红点状态
    if (!e) {
        void fetchUnread()
    }
}

//  未读私信数：0 时不显示红点
const hasUnread = ref(false)

const fetchUnread = async () => {
    // 匿名访问门户等公开页时不请求未读数，避免 401 触发登录跳转
    if (!localStorage.getItem('token') || !session.can('message.private')) {
        hasUnread.value = false
        return
    }
    try {
        const result = await getUnreadCount('private')
        if (result.code === 200 && result.data) {
            hasUnread.value = Number(result.data.unreadCount) > 0
        }
    } catch {
        // 查询失败时保持现状，不打扰用户
    }
}

const openInbox = () => {
    changeActive(true)
}

// 设置页更新/删除头像后实时同步顶栏，无需刷新页面
const onAvatarChange = (event: Event) => {
    const detail = (event as CustomEvent<{ imgurl: string | null }>).detail
    if (detail?.imgurl === null || detail?.imgurl === undefined) {
        delete userInfo.value.imgurl
    } else if (typeof detail?.imgurl === 'string') {
        userInfo.value.imgurl = detail.imgurl
    }
}

onMounted(() => {
    const savedUserInfo = localStorage.getItem('userInfo')

    if (savedUserInfo) {
        try {
            userInfo.value = JSON.parse(savedUserInfo)
        } catch (error) {
            console.error('读取用户信息失败：', error)
            userInfo.value = {}
        }
    }

    void fetchUnread()

    window.addEventListener('user:avatar-change', onAvatarChange)
    window.addEventListener('theme:preset-change', onPresetChange)
    window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
    window.removeEventListener('user:avatar-change', onAvatarChange)
    window.removeEventListener('theme:preset-change', onPresetChange)
    window.removeEventListener('keydown', onGlobalKeydown)
})



</script>

<style lang="less" scoped>
.head-bar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 64px;
    box-sizing: border-box;
    border-bottom: 1px solid color-mix(in srgb, var(--bgColor4) 62%, transparent);
    background: color-mix(in srgb, var(--bgColor1) 88%, transparent);
    backdrop-filter: blur(18px) saturate(1.3);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 clamp(16px, 2.2vw, 34px);

    .brand {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 11px;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
    }

    .logo-wrap {
        display: grid;
        width: 38px;
        height: 38px;
        flex: none;
        place-items: center;
        border: 1px solid var(--pcolor3);
        border-radius: 12px;
        background:
            linear-gradient(135deg, var(--pcolor1), transparent),
            var(--bgColor1);
        box-shadow: 0 5px 16px var(--pcolor1);
    }

    .logo {
        width: 30px;
        height: 20px;
    }

    .brand-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .name {
        overflow: hidden;
        color: var(--gray);
        font-size: 16px;
        font-weight: 750;
        letter-spacing: -0.02em;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .brand-copy small {
        color: var(--gray6);
        font-size: 10px;
        white-space: nowrap;
    }

    .head-actions {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 10px;
    }

    .icon-button {
        display: grid;
        width: 34px;
        height: 34px;
        flex: none;
        place-items: center;
        padding: 0;
        border: 1px solid var(--gray1);
        border-radius: 10px;
        background: var(--gray1);
        color: var(--gray8);
        font-size: 19px;
        cursor: pointer;
        transition: color 160ms ease, border-color 160ms ease, background 160ms ease;

        &:hover {
            border-color: var(--pcolor3);
            background: var(--pcolor1);
            color: var(--pcolor);
        }
    }

    .user-chip {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 9px;
        padding: 4px 8px 4px 4px;
        border: 1px solid transparent;
        border-radius: 12px;
        background: transparent;
        color: inherit;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        transition: border-color 160ms ease, background 160ms ease;

        &:hover {
            border-color: var(--gray1);
            background: var(--gray1);
        }
    }

    .user-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .user-avatar {
        flex-shrink: 0;
    }

    .user-name {
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 650;
        color: var(--gray);
    }

    .user-copy small {
        color: var(--gray6);
        font-size: 10px;
    }

    // 主题下拉：与旁边的 yk-button 等高、同风格（secondary 按钮）
    .theme-picker {
        position: relative;
        display: inline-flex;
        align-items: center;
    }

    .theme-trigger {
        display: inline-flex;
        align-items: center;
        gap: @space-s;
        // 与旁边的「我的博客 / 退出」yk-button 对齐：等高 36px、同圆角、同内边距
        height: 36px;
        min-width: 36px;
        padding: 0 16px;
        border: 1px solid var(--gray1);
        border-radius: 8px;
        background: var(--gray1);
        color: var(--gray8);
        font-size: 14px;
        font-family: inherit;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color @animatb, color @animatb, box-shadow @animatb;

        &:hover {
            border-color: var(--pcolor3);
            background: var(--pcolor1);
            color: var(--pcolor);
        }

        &:active {
            background: var(--pcolor2);
        }

        &:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px @pcolor-2;
        }

        &.open {
            border-color: var(--pcolor3);
            background: var(--pcolor1);
            color: var(--pcolor);
        }

        .theme-caret {
            display: inline-flex;
            align-items: center;
            flex-shrink: 0;
            font-size: 12px;
            opacity: 0.6;
            transition: transform @animatb, opacity @animatb;
        }

        &.open .theme-caret {
            opacity: 1;
            transform: rotate(180deg);
        }
    }

    .theme-dot {
        flex-shrink: 0;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        box-shadow: inset 0 0 0 1px @line-color-s, inset 0 1px 2px rgba(0, 0, 0, 0.12);
        transition: background 250ms ease;
    }

    .theme-name {
        max-width: 84px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .theme-panel {
        position: absolute;
        top: calc(100% + @space-s);
        right: 0;
        z-index: 40;
        width: 248px;
        padding: 10px;
        background: color-mix(in srgb, var(--bgColor1) 96%, transparent);
        border: 1px solid var(--gray1);
        border-radius: @radius-l;
        box-shadow: var(--admin-shadow-md, @shadow-m);
        backdrop-filter: blur(18px);
        transform-origin: top right;
    }

    .theme-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 8px 8px;
        font-size: @size-ss;
        color: @font-color-s;

        .theme-panel-hint {
            padding: 1px 8px;
            border-radius: @radius-r;
            background: @pcolor-1;
            color: @pcolor;
            font-size: 11px;
        }
    }

    .theme-options {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 340px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: @pcolor-3 transparent;

        &::-webkit-scrollbar { width: 6px; }
        &::-webkit-scrollbar-track { background: transparent; }
        &::-webkit-scrollbar-thumb {
            border-radius: @radius-r;
            background: @font-color-s;
            opacity: 0.3;
        }
    }

    .theme-option {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        background: transparent;
        border-radius: @radius-m;
        color: @font-color-l;
        font-size: @size-s;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        transition: background @animatb, color @animatb;
        animation: theme-option-in 250ms cubic-bezier(0.22, 1, 0.36, 1) both;

        &:hover, &:focus-visible {
            background: @gray-1;
            outline: none;
        }

        &.active {
            color: @pcolor;
            font-weight: 600;

            .option-tick { opacity: 1; }
        }
    }

    .option-swatch {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        border-radius: @radius-m;
        box-shadow: inset 0 0 0 1px @line-color-s;
    }

    .option-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    // 渐变主题的类型标记，与纯色主题区分
    .option-kind {
        flex-shrink: 0;
        padding: 0 5px;
        border-radius: 999px;
        background: var(--pcolor2);
        color: var(--pcolor);
        font-size: 11px;
        line-height: 16px;
    }

    .option-tick {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        font-size: 14px;
        color: @pcolor;
        opacity: 0;
        transition: opacity @animatb;
    }

    .theme-panel-enter-active,
    .theme-panel-leave-active {
        transition: opacity @animatb, transform @animatb;
    }
    .theme-panel-enter-from,
    .theme-panel-leave-to {
        opacity: 0;
        transform: translateY(-6px) scale(0.96);
    }

    @keyframes theme-option-in {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .portal-button,
    .exit-button {
        flex: none;
    }

    @media (max-width: 1180px) {
        .brand-copy small,
        .user-copy {
            display: none;
        }

        .user-chip {
            padding: 2px;
        }

        .theme-name {
            display: none;
        }

        .theme-trigger {
            // 窄屏收成方形图标按钮时，仍与图标按钮同高
            width: 36px;
            height: 36px;
            min-width: 36px;
            justify-content: center;
            padding: 0;
        }

        .theme-trigger .theme-caret {
            display: none;
        }
    }

    @media (max-width: 760px) {
        padding: 0 14px;

        .brand-copy,
        .portal-button {
            display: none;
        }

        .head-actions {
            gap: 6px;
        }
    }
}
</style>
