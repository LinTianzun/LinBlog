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

            <!-- yk-theme 自带 width:100%，需要固定尺寸容器，否则会撑满并把用户名挤没 -->
            <div class="theme-switch">
                <yk-theme />
            </div>
            
            <yk-button type="secondary" @click="goPortal">我的博客</yk-button>
            <yk-button @click="quit">退出</yk-button>
        </yk-space>

        <information :active="active" @close="changeActive(false)" @read="fetchUnread" />
    </div>

</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import unity from '../../assets/svg/unity.svg'
import unityW from '../../assets/svg/unityWhite.svg'
import { information } from '../reply/index.ts'
import { getUnreadCount } from '../../api/message'
import { useThemeDark } from '../../utils/themeMode'

const isDark = useThemeDark()

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
})

onUnmounted(() => {
    window.removeEventListener('user:avatar-change', onAvatarChange)
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

    .theme-switch {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
}
</style>
