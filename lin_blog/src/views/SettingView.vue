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
                    <div class="profile-layout">
                        <div class="profile-avatar-box">
                            <img v-if="avatarUrl" class="setting-avatar" :src="avatarUrl" alt="头像" />
                            <yk-empty v-else description="暂无头像" style="padding: 24px 0" />
                            <yk-upload class="avatar-upload" :file-list="avatarFileList" :upload-url="uploadUrl"
                                :limit="1" :multiple="false" accept="image/jpeg,image/png,image/webp,image/gif"
                                :max-size="8 * 1024 * 1024" desc="上传头像"
                                @handle-success="handleAvatarSuccess" @handle-error="handleAvatarError"
                                @handle-delete="handleAvatarDelete" />
                        </div>
                        <yk-space dir="vertical" size="s" align="flex-start">
                            <yk-space size="m">
                                <yk-text style="font-weight: 600">{{ profile?.username || '-' }}</yk-text>
                                <yk-tag v-if="roleName" type="info">{{ roleName }}</yk-tag>
                            </yk-space>
                            <yk-text type="secondary">{{ profile?.mail || '-' }}</yk-text>
                            <yk-text v-if="avatarMessage" :type="avatarSuccess ? 'success' : 'danger'">
                                {{ avatarMessage }}
                            </yk-text>
                        </yk-space>
                    </div>
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
import { computed, getCurrentInstance, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getUserInfo, changePassword, updateUserAvatar, type UserInfo } from '../api/user'

const router = useRouter()
const proxy = getCurrentInstance()?.proxy

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

// 仅把站内上传图片作为头像；历史 picsum 头像不再回显到上传组件
const avatarUrl = computed(() => profile.value?.imgurl || '')
const avatarFileList = ref<{ name: string; url: string }[]>([])
const avatarMessage = ref('')
const avatarSuccess = ref(false)
const uploadUrl = computed(() => {
    const token = (localStorage.getItem('token') || '').trim()
    return `/api/upload/image?token=${encodeURIComponent(token)}`
})

const syncAvatarFileList = () => {
    avatarFileList.value = avatarUrl.value
        ? [{ name: '头像', url: avatarUrl.value }]
        : []
}

const handleAvatarSuccess = async (response: unknown): Promise<void> => {
    const result = response as { data?: { url?: string }; url?: string }
    const url = result.data?.url || result.url
    if (!url) return

    try {
        const saveResult = await updateUserAvatar(url)
        if (saveResult.code === 200) {
            avatarSuccess.value = true
            avatarMessage.value = '头像更新成功'
            profile.value = profile.value ? { ...profile.value, imgurl: url } : null
            syncAvatarFileList()
            // 顶栏与本地缓存的头像同步更新
            try {
                const saved = localStorage.getItem('userInfo')
                if (saved) {
                    const info = JSON.parse(saved)
                    info.imgurl = url
                    localStorage.setItem('userInfo', JSON.stringify(info))
                }
            } catch {
                // 缓存解析失败不影响头像已保存的结果
            }
            proxy?.$message?.({ type: 'success', message: '头像更新成功' })
        } else {
            avatarSuccess.value = false
            avatarMessage.value = saveResult.message || '头像保存失败'
        }
    } catch (error: any) {
        avatarSuccess.value = false
        avatarMessage.value = error.response?.data?.message || '头像保存失败，请稍后重试'
    }
}

const handleAvatarError = (error: unknown): void => {
    let message = '头像上传失败，请确认后端服务已启动并重新登录后再试'
    if (typeof error === 'string' && error.trim()) {
        message = error
    } else if (typeof error === 'object' && error !== null) {
        const err = error as { error?: unknown; message?: unknown }
        const responseMessage = err.error || err.message
        if (typeof responseMessage === 'string' && responseMessage.trim()) {
            message = responseMessage
        }
    }
    avatarSuccess.value = false
    avatarMessage.value = message
}

const handleAvatarDelete = (): void => {
    avatarMessage.value = ''
    avatarFileList.value = []
}

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
            syncAvatarFileList()
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
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    }

    .setting-avatar {
        width: 96px;
        height: 96px;
        border-radius: 12px;
        object-fit: cover;
    }

    .profile-layout {
        display: flex;
        align-items: center;
        gap: @space-xl;
    }

    .profile-avatar-box {
        display: flex;
        flex-direction: column;
        gap: @space-s;
        flex-shrink: 0;

        .avatar-upload :deep(.yk-upload__picture),
        .avatar-upload :deep(.yk-upload-picture),
        .avatar-upload :deep(.yk-upload__picture-button) {
            width: 96px;
            height: 96px;
        }
    }

    .setting-input {
        width: 100%;
        max-width: 360px;
        height: 40px;
        padding: 0 12px;
        border: 1px solid @line-color-m;
        border-radius: 8px;
        outline: none;
        font-size: 14px;
        background: @bg-color-l;
        color: @font-color-l;

        &:focus {
            border-color: @pcolor;
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
