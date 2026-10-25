 <template>
    <yk-space dir="vertical" size="xl">
        <top-title name="系统设置" :is-search="false" />

        <div class="setting-layout">
            <div class="setting-main">

                <!-- 第一行：个人信息 -->
                <div class="setting-card profile-card">
                    <div class="profile-cover"></div>
                    <div class="profile-body">
                        <!-- avatar 模式由 yk-upload 渲染圆形头像（悬停编辑/删除，上传前裁剪）；外层占位 div 负责定位 -->
                        <div class="avatar-box">
                            <yk-upload avatar shape="circle" :file-list="avatarFileList" :upload-url="uploadUrl"
                                :limit="1" :multiple="false" accept="image/jpeg,image/png,image/webp,image/gif"
                                :max-size="8 * 1024 * 1024" desc="更换头像"
                                @handle-success="handleAvatarSuccess" @handle-error="handleAvatarError"
                                @handle-delete="handleAvatarDelete" />
                        </div>
                        <div class="profile-info">
                            <yk-space size="m" wrap>
                                <yk-title :level="3" style="margin: 0">
                                    {{ profile?.username || '-' }}
                                </yk-title>
                                <yk-tag v-if="roleName" type="info">{{ roleName }}</yk-tag>
                            </yk-space>
                            <yk-text type="secondary">{{ profile?.mail || '-' }}</yk-text>
                            <yk-text v-if="avatarMessage" :type="avatarSuccess ? 'success' : 'danger'">
                                {{ avatarMessage }}
                            </yk-text>
                        </div>
                    </div>
                </div>

                <!-- 第一行：修改密码 -->
                <div class="setting-card">
                    <yk-title :level="4" class="card-title">
                        修改密码
                    </yk-title>
                    <yk-space dir="vertical" size="m" style="width: 100%">
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

            </div>

            <!-- 右侧：管理员快捷入口（位置不变） -->
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
        </div>

        <!-- 第二行：其它功能（关于系统等内容置于此行） -->
        <div class="setting-card">
            <yk-title :level="4" class="card-title">
                其它功能
            </yk-title>
            <div class="about-grid">
                <div class="about-item">
                    <yk-text type="secondary">系统名称</yk-text>
                    <yk-text>LinBlog 个人博客系统</yk-text>
                </div>
                <div class="about-item">
                    <yk-text type="secondary">技术栈</yk-text>
                    <yk-text>Vue 3 + Yike Design / Express + MySQL</yk-text>
                </div>
                <div class="about-item">
                    <yk-text type="secondary">当前角色</yk-text>
                    <yk-text>{{ roleName || '-' }}</yk-text>
                </div>
            </div>
        </div>
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
    .setting-layout {
        display: flex;
        align-items: stretch;
        gap: @space-xl;
        width: 100%;
    }

    .setting-main {
        flex: 1;
        min-width: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: @space-xl;
        align-items: stretch;
    }

    .setting-card {
        width: 100%;
        padding: 24px 28px;
        border-radius: 12px;
        background: @bg-color-l;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        box-sizing: border-box;
    }

    .card-title {
        margin: 0 0 16px;
    }

    /* 个人信息卡：渐变横幅 + 大头像压边 */
    .profile-card {
        padding: 0;
        overflow: hidden;
        position: relative;

        .profile-cover {
            height: 72px;
            background: linear-gradient(120deg, #2b5aed 0%, #4d86f7 55%, #19b89b 100%);
        }

        // 头像独立定位压在横幅与内容区交界；占位 div 承担定位，内部组件 100% 宽度不再影响布局
        .avatar-box {
            position: absolute;
            top: 40px;
            left: 28px;
            z-index: 1;
            width: 96px;

            :deep(.yk-upload-picture) {
                width: 96px;
                height: 96px;
                border: 3px solid @bg-color-l;
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
            }

            :deep(.yk-upload-picture img) {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
        }

        .profile-body {
            // 左侧为头像预留空间：left 28px + 头像 96px + 间距 24px
            padding: 16px 28px 24px 148px;
            min-height: 136px;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
        }

        .profile-info {
            flex: 1;
            min-width: 0;
            padding-bottom: 4px;
            display: flex;
            flex-direction: column;
            gap: @space-s;
            align-items: flex-start;
        }
    }

    .setting-input {
        width: 100%;
        height: 40px;
        padding: 0 12px;
        border: 1px solid @line-color-m;
        border-radius: 8px;
        outline: none;
        font-size: 14px;
        box-sizing: border-box;
        background: @bg-color-l;
        color: @font-color-l;

        &:focus {
            border-color: @pcolor;
            box-shadow: 0 0 0 3px rgba(43, 90, 237, 0.12);
        }
    }

    /* 第二行：其它功能 */
    .about-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: @space-l;
    }

    .about-item {
        display: flex;
        flex-direction: column;
        gap: @space-ss;
        padding: @space-l;
        border-radius: 8px;
        background: @bg-color-m;
    }

    .setting-aside {
        width: 220px;
        flex-shrink: 0;
        align-self: stretch;

        .yk-button {
            width: 100%;
        }

        .yk-icon {
            margin-right: 8px;
        }
    }

    @media (max-width: 1100px) {
        .setting-layout {
            flex-direction: column;
        }

        .setting-aside {
            width: 100%;
            align-self: auto;
        }
    }

    @media (max-width: 900px) {
        .setting-main {
            grid-template-columns: 1fr;
        }
    }
</style>
