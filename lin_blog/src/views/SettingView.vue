 <template>
    <yk-space dir="vertical" size="xl" class="admin-page setting-page">
        <top-title name="系统设置" description="账号安全、主题与系统信息" :is-search="false" />

        <div class="setting-layout">
            <div class="setting-main">

                <!-- 第一行：个人信息 -->
                <div class="setting-card profile-card">
                    <div class="profile-cover">
                        <yk-title :level="4" class="profile-card-title">个人信息</yk-title>
                    </div>
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
                                <yk-tag v-if="profile?.status === 1" type="success">正常</yk-tag>
                                <yk-tag v-else type="danger">已禁用</yk-tag>
                            </yk-space>
                            <div class="profile-detail">
                                <div class="profile-detail-item">
                                    <span class="profile-label">邮箱</span>
                                    <span class="profile-value">{{ profile?.mail || '-' }}</span>
                                </div>
                                <div class="profile-detail-item">
                                    <span class="profile-label">用户ID</span>
                                    <span class="profile-value">{{ profile?.id ?? '-' }}</span>
                                </div>
                                <div class="profile-detail-item">
                                    <span class="profile-label">注册时间</span>
                                    <span class="profile-value">{{ formatDate(profile?.created_at) }}</span>
                                </div>
                                <div class="profile-detail-item">
                                    <span class="profile-label">最后登录</span>
                                    <span class="profile-value">{{ formatDate(profile?.last_login_at) }}</span>
                                </div>
                            </div>
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
            <div class="feature-section">
                <yk-text type="secondary">主题风格</yk-text>
                <div class="theme-grid">
                    <button v-for="preset in themePresets" :key="preset.id" type="button" class="theme-card"
                        :class="{ 'theme-card-active': preset.id === activePresetId }" @click="selectTheme(preset.id)">
                        <span class="theme-preview" :style="{ background: preset.preview || preset.background }">
                            <span class="theme-preview-dot" :style="{ background: preset.primary }"></span>
                        </span>
                        <span class="theme-name">{{ preset.name }}</span>
                        <IconTickOutline v-if="preset.id === activePresetId" class="theme-check" />
                    </button>
                </div>
            </div>
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
import { computed, getCurrentInstance, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getUserInfo, changePassword, updateUserAvatar, type UserInfo } from '../api/user'
import { themePresets } from '../utils/themes'
import { applyThemePreset, getStoredPresetId } from '../utils/themePreset'
import { buildImageUploadUrl } from '../utils/uploadUrl.ts'

const router = useRouter()
const proxy = getCurrentInstance()?.proxy

const activePresetId = ref(getStoredPresetId())

// 顶栏快捷明暗切换会回落到默认主题，这里同步卡片选中态
const onPresetChange = (event: Event) => {
    const presetId = (event as CustomEvent<{ presetId: string }>).detail?.presetId
    if (presetId) activePresetId.value = presetId
}

// 切换主题预设：同时更新 data-theme（yike 明暗）与 data-theme-preset（品牌变量层）
const selectTheme = (presetId: string) => {
    if (presetId === activePresetId.value) return
    applyThemePreset(presetId)
    activePresetId.value = presetId
}

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
// 上传地址改用短期票据：yk-upload 只能把凭证拼在 URL 上，
// 用按次消费的短期票据代替长期 JWT，避免凭证进入访问日志与浏览器历史
const uploadUrl = ref('')
const ticketBusy = ref(false)

const refreshUploadUrl = async (): Promise<void> => {
    if (ticketBusy.value) return
    ticketBusy.value = true
    try {
        uploadUrl.value = await buildImageUploadUrl()
    } catch {
        avatarMessage.value = '上传凭证获取失败，请重新登录后再试'
    } finally {
        ticketBusy.value = false
    }
}

// 广播头像变更，顶栏等已挂载组件实时同步
const broadcastAvatarChange = (imgurl: string | null) => {
    window.dispatchEvent(new CustomEvent('user:avatar-change', { detail: { imgurl } }))
}

// 更新本地缓存的头像字段
const updateCachedUserInfo = (imgurl: string | null) => {
    try {
        const saved = localStorage.getItem('userInfo')
        if (saved) {
            const info = JSON.parse(saved)
            if (imgurl === null) delete info.imgurl
            else info.imgurl = imgurl
            localStorage.setItem('userInfo', JSON.stringify(info))
        }
    } catch {
        // 缓存解析失败不影响头像已保存的结果
    }
}

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
            updateCachedUserInfo(url)
            broadcastAvatarChange(url)
            proxy?.$message?.({ type: 'success', message: '头像更新成功' })
            void refreshUploadUrl()
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

// 删除头像：同步清掉数据库中的 imgurl，而不只是前端列表
const handleAvatarDelete = async (): Promise<void> => {
    avatarFileList.value = []
    try {
        const result = await updateUserAvatar(null)
        if (result.code === 200) {
            avatarSuccess.value = true
            avatarMessage.value = '头像已删除'
            profile.value = profile.value ? { ...profile.value, imgurl: null } : null
            syncAvatarFileList()
            updateCachedUserInfo(null)
            broadcastAvatarChange(null)
            proxy?.$message?.({ type: 'success', message: '头像已删除' })
            void refreshUploadUrl()
        } else {
            avatarSuccess.value = false
            avatarMessage.value = result.message || '头像删除失败'
            syncAvatarFileList()
        }
    } catch (error: any) {
        avatarSuccess.value = false
        avatarMessage.value = error.response?.data?.message || '头像删除失败，请稍后重试'
        syncAvatarFileList()
    }
}

const roleMap: Record<string, string> = {
    admin: '管理员',
    editor: '编辑',
    normal: '普通用户',
    visitor: '游客'
}
const roleName = computed(() => roleMap[profile.value?.user_type ?? ''] || '')

// 数据库时间为 UTC 字符串，转为本地时间展示
const formatDate = (value?: string | null) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    })
}

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

onMounted(() => window.addEventListener('theme:preset-change', onPresetChange))
onUnmounted(() => window.removeEventListener('theme:preset-change', onPresetChange))
onMounted(() => void refreshUploadUrl())
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
        border-radius: var(--admin-radius, 18px);
        background: var(--admin-surface, var(--bgColor1));
        box-shadow: var(--admin-shadow-sm, @shadow-s);
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
            padding: 0 28px;
            box-sizing: border-box;
            background:
                radial-gradient(circle at 84% 0%, rgba(255, 255, 255, 0.2), transparent 42%),
                linear-gradient(120deg, var(--pcolor) 0%, var(--pcolor8) 58%, var(--scolor) 100%);

            .profile-card-title {
                margin: 0;
                color: #ffffff;
                line-height: 72px;
            }
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

        .profile-detail {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: @space-s @space-l;
        }

        .profile-detail-item {
            min-width: 0;
            display: flex;
            align-items: baseline;
            gap: @space-s;
        }

        .profile-label {
            flex-shrink: 0;
            font-size: @size-s;
            color: var(--gray6);
        }

        .profile-value {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: @size-s;
            color: @font-color-l;
        }
    }

    .setting-input {
        width: 100%;
        height: 40px;
        padding: 0 12px;
        border: 1px solid var(--admin-line);
        border-radius: 8px;
        outline: none;
        font-size: 14px;
        box-sizing: border-box;
        background: var(--bgColor1);
        color: var(--gray);

        &:focus {
            border-color: var(--pcolor);
            box-shadow: 0 0 0 3px var(--pcolor2);
        }
    }

    /* 第二行：其它功能 */
    .feature-section {
        display: flex;
        flex-direction: column;
        gap: @space-m;
        margin-bottom: @space-l;
    }

    .theme-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: @space-m;
    }

    .theme-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: @space-s;
        padding: @space-m;
        border: 2px solid transparent;
        border-radius: 10px;
        background: var(--bgColor2);
        cursor: pointer;
        transition: transform @animatb, border-color @animatb;

        &:hover {
            transform: translateY(-2px);
        }

        &-active {
            border-color: var(--pcolor);
        }
    }

    .theme-preview {
        display: block;
        height: 48px;
        border-radius: 6px;
        border: 1px solid @line-color-s;
        position: relative;
        overflow: hidden;

        .theme-preview-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 18px;
            height: 18px;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.35);
        }
    }

    .theme-name {
        font-size: @size-s;
        color: var(--gray);
        text-align: center;
    }

    .theme-check {
        position: absolute;
        top: 8px;
        right: 8px;
        color: var(--pcolor);
    }

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
        background: var(--bgColor2);
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
