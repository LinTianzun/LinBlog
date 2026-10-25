<template>
    <yk-space dir="vertical" size="xl">
        <top-title name="系统设置" :is-search="false" />

        <yk-space size="xl" style="width: 100%" align="flex-start">
            <yk-space dir="vertical" size="l" style="flex: 1;">

                <!-- 个人信息 -->
                <div class="setting-card">
                    <yk-title :level="4" style="margin: 0 0 16px">
                        个人信息
                    </yk-title>
                    <yk-space align="center" size="l">
                        <img class="setting-avatar" :src="avatarUrl" alt="头像" />
                        <yk-space dir="vertical" size="s">
                            <yk-text style="font-weight: 600">{{ profile?.username || '-' }}</yk-text>
                            <yk-text type="secondary">{{ profile?.mail || '-' }}</yk-text>
                        </yk-space>
                        <yk-tag v-if="roleName" type="info">{{ roleName }}</yk-tag>
                    </yk-space>
                </div>

                <!-- 修改密码 -->
                <div class="setting-card">
                    <yk-title :level="4" style="margin: 0 0 16px">
                        修改密码
                    </yk-title>
                    <yk-space dir="vertical" size="m" style="max-width: 360px">
                        <input class="setting-input" type="password" v-model="passwordForm.oldPassword"
                            placeholder="当前密码" autocomplete="current-password" />
                        <input class="setting-input" type="password" v-model="passwordForm.newPassword"
                            placeholder="新密码（至少 6 位）" autocomplete="new-password" />
                        <input class="setting-input" type="password" v-model="passwordForm.confirmPassword"
                            placeholder="确认新密码" autocomplete="new-password" />
                        <yk-text v-if="passwordMessage" :type="passwordSuccess ? 'success' : 'danger'">
                            {{ passwordMessage }}
                        </yk-text>
                        <yk-button type="primary" :loading="changingPassword" style="align-self: flex-start"
                            @click="submitPassword">
                            保存新密码
                        </yk-button>
                    </yk-space>
                </div>

                <!-- 关于系统 -->
                <div class="setting-card">
                    <yk-title :level="4" style="margin: 0 0 16px">
                        关于系统
                    </yk-title>
                    <yk-space dir="vertical" size="s">
                        <yk-space size="l">
                            <yk-text type="secondary" style="width: 88px">系统名称</yk-text>
                            <yk-text>LinBlog 个人博客系统</yk-text>
                        </yk-space>
                        <yk-space size="l">
                            <yk-text type="secondary" style="width: 88px">技术栈</yk-text>
                            <yk-text>Vue 3 + Yike Design / Express + MySQL</yk-text>
                        </yk-space>
                    </yk-space>
                </div>

            </yk-space>

            <!-- 管理员快捷入口 -->
            <div v-if="isAdmin" class="setting-card setting-aside">
                <yk-title :level="4" style="margin: 0 0 16px">
                    快捷入口
                </yk-title>
                <yk-space dir="vertical" size="m">
                    <yk-button type="secondary" style="justify-content: flex-start" @click="go('/userManagement')">
                        <IconAvatarFill />
                        用户管理
                    </yk-button>
                    <yk-button type="secondary" style="justify-content: flex-start" @click="go('/systemLog')">
                        <IconStatisticsFill />
                        系统日志
                    </yk-button>
                    <yk-button type="secondary" style="justify-content: flex-start" @click="go('/localfile')">
                        <IconFolderCloseFill />
                        本地文件
                    </yk-button>
                </yk-space>
            </div>
        </yk-space>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getUserInfo, changePassword, type UserInfo } from '../api/user'

const router = useRouter()

const profile = ref<UserInfo | null>(null)
const isAdmin = ref(false)

const passwordForm = reactive({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
})
const changingPassword = ref(false)
const passwordMessage = ref('')
const passwordSuccess = ref(false)

const avatarUrl = computed(() => profile.value?.imgurl || 'https://picsum.photos/id/64/200')

const roleMap: Record<string, string> = {
    admin: '管理员',
    editor: '编辑',
    normal: '普通用户',
    visitor: '游客'
}
const roleName = computed(() => roleMap[profile.value?.user_type ?? ''] || '')

const go = (path: string) => {
    router.push(path)
}

const loadProfile = async () => {
    try {
        const result = await getUserInfo()
        if (result.code === 200) {
            profile.value = result.data
            isAdmin.value = profile.value?.user_type === 'admin'
        }
    } catch (error) {
        console.error('获取用户信息失败：', error)
    }
}

const submitPassword = async () => {
    passwordMessage.value = ''
    passwordSuccess.value = false

    if (!passwordForm.oldPassword) {
        passwordMessage.value = '请输入当前密码'
        return
    }
    if (passwordForm.newPassword.length < 6) {
        passwordMessage.value = '新密码至少 6 位'
        return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        passwordMessage.value = '两次输入的新密码不一致'
        return
    }

    changingPassword.value = true
    try {
        const result = await changePassword(passwordForm.oldPassword, passwordForm.newPassword)
        if (result.code === 200) {
            passwordSuccess.value = true
            passwordMessage.value = '密码修改成功，即将跳转登录页...'
            // 密码已变更，强制重新登录
            setTimeout(() => {
                localStorage.removeItem('token')
                localStorage.removeItem('userInfo')
                router.replace('/loginRegister')
            }, 1500)
        } else {
            passwordMessage.value = result.message || '密码修改失败'
        }
    } catch (error: any) {
        passwordMessage.value = error.response?.data?.message || '密码修改失败，请稍后重试'
    } finally {
        changingPassword.value = false
    }
}

onMounted(loadProfile)
</script>

<style lang="less" scoped>
    .setting-card {
        width: 100%;
        padding: 24px 28px;
        border-radius: 12px;
        background: @bg-color-l;
        box-shadow: 0 4px 16px rgba(31, 56, 88, 0.05);
    }

    .setting-avatar {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        object-fit: cover;
    }

    .setting-input {
        width: 100%;
        max-width: 360px;
        height: 40px;
        padding: 0 12px;
        border: 1px solid #d8dee9;
        border-radius: 8px;
        outline: none;
        font-size: 14px;

        &:focus {
            border-color: #2b5aed;
            box-shadow: 0 0 0 3px rgba(43, 90, 237, 0.12);
        }
    }

    .setting-aside {
        width: 220px;
        flex-shrink: 0;

        .yk-button {
            width: 100%;
        }

        .yk-icon {
            margin-right: 8px;
        }
    }
</style>
