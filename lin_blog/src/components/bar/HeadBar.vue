<template>
    <div class="head-bar">
        <yk-space align="center" size="m" style="cursor: pointer;" @click="backHome">
            <img :src="swBg ?unity:unityW" class="logo" alt="">
            <span class="name">林知雨博客后台</span>
        </yk-space>
        <yk-space align="center" size="xl">
            <yk-badge is-dot>
                <IconMailOutline @click="changeActive(true)" style="font-size: 20px;" />
            </yk-badge>
            <!-- <yk-avatar img-url="/src/assets/img/xw11.jpg"></yk-avatar> -->
             <yk-avatar
    :img-url="userInfo?.imgurl || defaultAvatar"
></yk-avatar>

<span class="user-name">
    {{ userInfo?.username || '用户' }}
</span>
            <div>
                <yk-theme @click="switchBg" />
            </div>
            <yk-button @click="quit">退出</yk-button>
        </yk-space>

        <information :active="active" @close="changeActive(false)" />
    </div>

</template>

<script lang="ts" setup>
    import { ref, onMounted } from 'vue'
    import { useRouter } from 'vue-router'
    import unity from '../../assets/svg/unity.svg'
    import unityW from '../../assets/svg/unityWhite.svg'
    import { information } from '../reply/index.ts'

    let swBg = ref(true)

    const router = useRouter();

    //  切换背景
    const switchBg = () => {
        swBg.value = !swBg.value
    }

    //  返回总览
    const backHome = () => {
        router.push('/')
    }

    //  退出登录
    // const quit = () => {
    //     router.push('/loginRegister')
    // }
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
})

    //  打开私信
    const active = ref(false)

    const changeActive = (e) => {
        active.value = e
    }

    // onMounted(() => {
    //     swBg.value = true
    // })

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
    }
</style>