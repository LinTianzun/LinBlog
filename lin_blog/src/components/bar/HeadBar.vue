<template>
    <div class="head-bar">
        <yk-space align="center" size="m" style="cursor: pointer;" @click="backHome">
            <img :src="isDark ? unityW : unity" class="logo" alt="">
            <span class="name">林知雨博客后台</span>
        </yk-space>
        <yk-space align="center" size="xl">
            <yk-badge :is-dot="hasUnread">
                <IconMailOutline @click="openInbox" style="font-size: 20px;" />
            </yk-badge>

            <yk-avatar :size="32" :img-url="userInfo?.imgurl || defaultAvatar" class="user-avatar"
                style="cursor: pointer;" @click="goSetting" />

            <span class="user-name">
                {{ userInfo?.username || '用户' }}
            </span>

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
                                    <span class="option-tick" aria-hidden="true">
                                        <IconTickOutline />
                                    </span>
                                </button>
                            </li>
                        </ul>
                    </div>
                </Transition>
            </div>
            
            <yk-button type="secondary" @click="goPortal">我的博客</yk-button>
            <yk-button @click="quit">退出</yk-button>
        </yk-space>

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

const isDark = useThemeDark()

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

    // 跳转到登录页
    router.push('/loginRegister')
}

const userInfo = ref<Record<string, any>>({})

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
    if (!localStorage.getItem('token')) {
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
    background: @bg-color-l;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 @space-xl;


    .logo {
        width: 38px;
        height: 24px;

    }

    .name {
        font-size: 20px;
        font-weight: 600;
    }

    .user-avatar {
        flex-shrink: 0;
    }

    .user-name {
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: @size-m;
        font-weight: 500;
        color: @font-color-l;
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
        height: 32px;
        min-width: 32px;
        padding: @space-l;
        border: 1px solid transparent;
        border-radius: @radius-s;
        background: @gray-1;
        color: @font-color-l;
        font-size: @size-s;
        font-family: inherit;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color @animatb, color @animatb, box-shadow @animatb;

        &:hover {
            background: @gray-2;
        }

        &:active {
            background: @gray-3;
        }

        &:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px @pcolor-2;
        }

        &.open {
            background: @gray-3;
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
        width: 12px;
        height: 12px;
        border-radius: 50%;
        box-shadow: inset 0 0 0 1px @line-color-s, inset 0 1px 2px rgba(0, 0, 0, 0.12);
        transition: background 250ms ease;
    }

    .theme-name {
        max-width: 96px;
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
        background: @bg-color-l;
        border: 1px solid @line-color-s;
        border-radius: @radius-l;
        box-shadow: @shadow-m;
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
}
</style>
