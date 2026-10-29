<template>
    <yk-space dir="vertical" size="xl" class="admin-page setting-page">
        <top-title name="系统设置" description="账号资料、安全、外观与系统信息" :is-search="false" />

        <div class="set-shell">
            <!-- 左：分区导航 -->
            <nav class="set-nav" aria-label="设置分区">
                <button v-for="section in sections" :key="section.key" type="button" class="set-nav-item"
                    :class="{ 'is-active': activeSection === section.key }"
                    @click="scrollToSection(section.key)">
                    <component :is="section.icon" class="set-nav-icon" />
                    <span class="set-nav-copy">
                        <strong>{{ section.name }}</strong>
                        <small>{{ section.hint }}</small>
                    </span>
                </button>
            </nav>

            <!-- 右：分区内容 -->
            <div class="set-content">
                <!-- ── 账号资料 ── -->
                <section id="set-profile" class="set-section">
                    <div class="set-card set-profile">
                        <div class="set-profile-banner">
                            <span class="set-profile-banner-glow" aria-hidden="true" />
                            <span class="set-profile-banner-text">个人资料</span>
                            <span class="set-profile-banner-note">
                                头像支持 JPG / PNG / WebP / GIF，单张不超过 8MB
                            </span>
                        </div>

                        <div class="set-profile-body">
                            <!-- yk-upload avatar 模式渲染圆形头像（悬停可更换/删除） -->
                            <div class="set-avatar-box">
                                <yk-upload avatar shape="circle" :file-list="avatarFileList" :upload-url="uploadUrl"
                                    :limit="1" :multiple="false"
                                    accept="image/jpeg,image/png,image/webp,image/gif" :max-size="8 * 1024 * 1024"
                                    desc="更换头像" @handle-success="handleAvatarSuccess"
                                    @handle-error="handleAvatarError" @handle-delete="handleAvatarDelete" />
                            </div>

                            <div class="set-profile-info">
                                <div class="set-profile-head">
                                    <yk-title :level="3" style="margin: 0">
                                        {{ profile?.username || '-' }}
                                    </yk-title>
                                    <yk-tag v-if="roleName" type="info">{{ roleName }}</yk-tag>
                                    <yk-tag v-if="isSuperAdmin" type="danger">超级管理员</yk-tag>
                                    <yk-tag v-if="profile?.status === 1" type="success">正常</yk-tag>
                                    <yk-tag v-else type="danger">已禁用</yk-tag>
                                </div>

                                <dl class="set-facts">
                                    <div class="set-fact">
                                        <dt>邮箱</dt>
                                        <dd>{{ profile?.mail || '-' }}</dd>
                                    </div>
                                    <div class="set-fact">
                                        <dt>用户 ID</dt>
                                        <dd>#{{ profile?.id ?? '-' }}</dd>
                                    </div>
                                    <div class="set-fact">
                                        <dt>注册时间</dt>
                                        <dd>{{ formatDate(profile?.created_at) }}</dd>
                                    </div>
                                    <div class="set-fact">
                                        <dt>最后登录</dt>
                                        <dd>{{ formatDate(profile?.last_login_at) }}</dd>
                                    </div>
                                </dl>

                                <yk-text v-if="avatarMessage" :type="avatarSuccess ? 'success' : 'danger'">
                                    {{ avatarMessage }}
                                </yk-text>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── 安全 ── -->
                <section id="set-security" class="set-section">
                    <header class="set-section-head">
                        <yk-title :level="4" style="margin: 0">安全</yk-title>
                        <yk-text type="secondary">修改密码后需要重新登录</yk-text>
                    </header>

                    <div class="set-card">
                        <div class="set-field">
                            <label class="set-label" for="old-password">当前密码</label>
                            <div class="set-input-wrap">
                                <input id="old-password" v-model="passwordForm.oldPassword" class="set-input"
                                    :type="showOld ? 'text' : 'password'" placeholder="请输入当前密码"
                                    autocomplete="current-password" />
                                <button type="button" class="set-eye" :aria-label="showOld ? '隐藏密码' : '显示密码'"
                                    @click="showOld = !showOld">
                                    <IconCloseEyeOutline v-if="showOld" />
                                    <IconEyeOutline v-else />
                                </button>
                            </div>
                        </div>

                        <div class="set-field">
                            <label class="set-label" for="new-password">新密码</label>
                            <div class="set-input-wrap">
                                <input id="new-password" v-model="passwordForm.newPassword" class="set-input"
                                    :type="showNew ? 'text' : 'password'" placeholder="至少 8 位，含字母与数字"
                                    autocomplete="new-password" />
                                <button type="button" class="set-eye" :aria-label="showNew ? '隐藏密码' : '显示密码'"
                                    @click="showNew = !showNew">
                                    <IconCloseEyeOutline v-if="showNew" />
                                    <IconEyeOutline v-else />
                                </button>
                            </div>
                            <!-- 强度条：长度 + 字符种类实时反馈 -->
                            <div class="set-strength" v-if="passwordForm.newPassword">
                                <span class="set-strength-bar">
                                    <span class="set-strength-fill"
                                        :class="`is-${passwordStrength.level}`"
                                        :style="{ width: `${passwordStrength.percent}%` }" />
                                </span>
                                <span class="set-strength-label">{{ passwordStrength.label }}</span>
                            </div>
                        </div>

                        <div class="set-field">
                            <label class="set-label" for="confirm-password">确认新密码</label>
                            <input id="confirm-password" v-model="passwordForm.confirmPassword" class="set-input"
                                type="password" placeholder="再次输入新密码" autocomplete="new-password" />
                            <p v-if="passwordMismatch" class="set-hint is-error">
                                两次输入的新密码不一致
                            </p>
                        </div>

                        <yk-text v-if="passwordMessage" :type="passwordSuccess ? 'success' : 'danger'">
                            {{ passwordMessage }}
                        </yk-text>

                        <yk-button type="primary" :loading="changingPassword" :disabled="!canSubmitPassword"
                            style="align-self: flex-start; margin-top: 4px" @click="submitPassword">
                            保存新密码
                        </yk-button>
                    </div>
                </section>

                <!-- ── 外观 ── -->
                <section id="set-appearance" class="set-section">
                    <header class="set-section-head">
                        <yk-title :level="4" style="margin: 0">外观</yk-title>
                        <yk-text type="secondary">
                            当前：{{ activePreset?.name }}（{{ activePreset?.base === 'dark' ? '深色' : '浅色' }}）
                        </yk-text>
                    </header>

                    <div class="set-card">
                        <div class="set-subhead">
                            <span class="set-label">明暗基调</span>
                            <div class="set-mode-switch">
                                <button type="button" class="set-mode" :class="{ 'is-active': !isDark }"
                                    @click="switchMode('light')">
                                    <IconSunFill />浅色
                                </button>
                                <button type="button" class="set-mode" :class="{ 'is-active': isDark }"
                                    @click="switchMode('dark')">
                                    <IconMoonFill />深色
                                </button>
                            </div>
                        </div>

                        <!-- 描边强度只对渐变主题生效，纯色主题下整段隐藏 -->
                        <div v-if="isGradient" class="set-subhead">
                            <span class="set-label">卡片描边</span>
                            <yk-text type="tertiary">控制卡片边缘的渐变光圈</yk-text>
                        </div>

                        <div v-if="isGradient" class="set-card set-edge">
                            <div class="set-edge-options">
                                <button v-for="level in edgeLevels" :key="level" type="button" class="set-edge-option"
                                    :class="{ 'is-active': level === edgeLevel }"
                                    @click="selectEdgeLevel(level)">
                                    <span class="set-edge-ring" :data-level="level">
                                        <span class="set-edge-core" />
                                    </span>
                                    <span class="set-edge-name">{{ edgeLevelLabels[level] }}</span>
                                </button>
                            </div>
                            <p class="set-edge-hint">
                                {{ edgeLevel === 0 ? '已关闭，卡片为普通边框' : '描边随主题色在卡片边缘流动' }}
                            </p>
                        </div>

                        <div v-for="group in presetGroups" :key="group.key" class="set-theme-group">
                            <div class="set-subhead">
                                <span class="set-label">{{ group.label }}</span>
                                <yk-text type="tertiary">
                                    {{ isDark ? '深色' : '浅色' }}系 · 共 {{ group.items.length }} 套
                                </yk-text>
                            </div>

                            <div class="set-themes">
                                <button v-for="preset in group.items" :key="preset.id" type="button"
                                    class="set-theme" :class="{
                                        'is-active': preset.id === activePresetId,
                                        'is-gradient': preset.kind === 'gradient'
                                    }" @click="selectTheme(preset.id)">
                                    <span class="set-theme-swatch" :style="swatchStyle(preset)">
                                        <span class="set-theme-dot" :style="{ background: preset.primary }" />
                                        <span v-if="preset.kind === 'gradient'" class="set-theme-kind">渐变</span>
                                    </span>
                                    <span class="set-theme-name">{{ preset.name }}</span>
                                    <IconTickOutline v-if="preset.id === activePresetId" class="set-theme-check" />
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── 我的权限 ── -->
                <section id="set-permissions" class="set-section">
                    <header class="set-section-head">
                        <yk-title :level="4" style="margin: 0">我的权限</yk-title>
                        <yk-text type="secondary">
                            {{ isSuperAdmin ? '超级管理员拥有全部权限' : `当前角色共 ${permissionTotal} 项可操作权限` }}
                        </yk-text>
                    </header>

                    <div class="set-card">
                        <!-- 权限矩阵由后端按角色下发，这里只做只读展示，避免用户误判自己能做什么 -->
                        <div v-if="isSuperAdmin" class="set-perm-all">
                            <IconCrownFill class="set-perm-crown" />
                            <p>超级管理员固定持有全部权限，不受角色矩阵调整影响。</p>
                        </div>

                        <div v-else-if="permissionGroups.length" class="set-perm-groups">
                            <div v-for="group in permissionGroups" :key="group.key" class="set-perm-group">
                                <p class="set-perm-group-name">
                                    {{ group.label }}
                                    <span class="set-perm-count">{{ group.items.length }}</span>
                                </p>
                                <div class="set-perm-chips">
                                    <span v-for="item in group.items" :key="item" class="set-perm-chip">
                                        {{ item }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <yk-empty v-else description="当前角色没有被分配权限" />

                        <yk-button v-if="canViewPermissions" type="secondary" size="s" style="align-self: flex-start"
                            @click="go('/permissionManagement')">
                            <IconSecurityOutline />查看权限矩阵
                        </yk-button>
                    </div>
                </section>

                <!-- ── 系统信息 ── -->
                <section id="set-system" class="set-section">
                    <header class="set-section-head">
                        <yk-title :level="4" style="margin: 0">系统信息</yk-title>
                        <yk-text type="secondary">运行状态与版本</yk-text>
                    </header>

                    <div class="set-card">
                        <!-- 备份区容量：仅 file.purge 权限可见（与回收站口径一致） -->
                        <div v-if="canViewFiles && storage" class="set-storage">
                            <div class="set-storage-head">
                                <span class="set-label">备份区容量</span>
                                <span class="set-storage-level" :class="`is-${storage.level}`">
                                    {{ storageLevelLabel }}
                                </span>
                            </div>
                            <div class="set-storage-bar">
                                <span class="set-storage-fill" :class="`is-${storage.level}`"
                                    :style="{ width: `${storagePercent}%` }" />
                            </div>
                            <div class="set-storage-foot">
                                <span>{{ formatBytes(storage.usedBytes) }} / {{ formatBytes(storage.maxBytes) }}</span>
                                <span>{{ storagePercentText }}</span>
                            </div>
                        </div>

                        <dl class="set-facts set-facts-about">
                            <div class="set-fact">
                                <dt>系统名称</dt>
                                <dd>LinBlog 个人博客系统</dd>
                            </div>
                            <div class="set-fact">
                                <dt>技术栈</dt>
                                <dd>Vue 3 + Yike Design / Express + MySQL</dd>
                            </div>
                            <div class="set-fact">
                                <dt>当前角色</dt>
                                <dd>{{ roleName || '-' }}</dd>
                            </div>
                            <div class="set-fact">
                                <dt>会话权限</dt>
                                <dd>{{ isSuperAdmin ? '全部（超级管理员）' : `${permissionTotal} 项` }}</dd>
                            </div>
                        </dl>
                    </div>

                    <!-- 快捷入口 -->
                    <div v-if="hasQuickAccess" class="set-card">
                        <span class="set-label" style="margin-bottom: 12px">快捷入口</span>
                        <div class="set-quick">
                            <button v-for="entry in quickEntries" :key="entry.path" type="button"
                                class="set-quick-item" @click="go(entry.path)">
                                <component :is="entry.icon" class="set-quick-icon" />
                                <span>{{ entry.name }}</span>
                                <IconRightOutline class="set-quick-arrow" />
                            </button>
                        </div>
                    </div>
                </section>

                <!-- ── 危险区 ── -->
                <section id="set-danger" class="set-section">
                    <div class="set-card set-danger">
                        <div class="set-danger-copy">
                            <strong>退出登录</strong>
                            <span>清除本地登录态与权限快照，返回登录页。</span>
                        </div>
                        <yk-button type="secondary" status="danger" @click="handleLogout">
                            <IconSwitchOutline />退出登录
                        </yk-button>
                    </div>
                </section>
            </div>
        </div>
    </yk-space>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getUserInfo, changePassword, updateUserAvatar, type UserInfo } from '../api/user'
import { getFileStorageStatus, type FileStorageStatus } from '../api/file'
import { themePresets, type ThemePreset } from '../utils/themes'
import {
    applyThemePreset,
    applyEdgeLevel,
    getStoredPresetId,
    getStoredEdgeLevel,
    EDGE_LEVELS,
    EDGE_LEVEL_LABELS,
    type EdgeLevel
} from '../utils/themePreset'
import { buildImageUploadUrl } from '../utils/uploadUrl.ts'
import { useSessionStore } from '../store/session.ts'
import {
    IconAvatarFill,
    IconCloseEyeOutline,
    IconCrownFill,
    IconEyeOutline,
    IconFolderCloseFill,
    IconMoonFill,
    IconRightOutline,
    IconSecurityOutline,
    IconSettingsFill,
    IconStatisticsFill,
    IconSunFill,
    IconSwitchOutline,
    IconTickOutline,
    IconLockFill,
    IconImageFill,
} from '@yike-design/ui/es/components/svg-icon'

const router = useRouter()
const proxy = getCurrentInstance()?.proxy
const session = useSessionStore()

// ── 分区导航 ──
const sections = [
    { key: 'set-profile', name: '账号资料', hint: '头像与基本信息', icon: IconAvatarFill },
    { key: 'set-security', name: '安全', hint: '修改登录密码', icon: IconLockFill },
    { key: 'set-appearance', name: '外观', hint: '主题与明暗', icon: IconImageFill },
    { key: 'set-permissions', name: '我的权限', hint: '当前可操作范围', icon: IconSecurityOutline },
    { key: 'set-system', name: '系统信息', hint: '状态与快捷入口', icon: IconSettingsFill },
]
const activeSection = ref('set-profile')

// 滚动到目标分区：offset 让分区标题不被后台固定顶栏压住
const scrollToSection = (key: string) => {
    activeSection.value = key
    const el = document.getElementById(key)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 96
    window.scrollTo({ top, behavior: 'smooth' })
}

// 滚动时高亮当前分区（取最后一个已越过视口上沿的分区）
const syncActiveSection = () => {
    let current = sections[0].key
    for (const section of sections) {
        const el = document.getElementById(section.key)
        if (!el) continue
        if (el.getBoundingClientRect().top <= 140) current = section.key
    }
    activeSection.value = current
}

// ── 主题 ──
const activePresetId = ref(getStoredPresetId())
const activePreset = computed(() =>
    themePresets.find(p => p.id === activePresetId.value) || themePresets[0]
)
const isDark = computed(() => activePreset.value.base === 'dark')
// 描边是渐变主题的专属装饰，纯色主题下没有可调节的对象
const isGradient = computed(() => activePreset.value.kind === 'gradient')

// 主题配色先按当前基调过滤，再按纯色/渐变分段：
// 浅色 tab 只出浅色系，深色 tab 只出深色系，同基调内渐变色系单独成组
const presetGroups = computed(() => {
    const matched = themePresets.filter(p => p.base === activePreset.value.base)
    return [
        { key: 'solid', label: '纯色系', items: matched.filter(p => (p.kind || 'solid') === 'solid') },
        { key: 'gradient', label: '渐变系', items: matched.filter(p => p.kind === 'gradient') }
    ].filter(group => group.items.length > 0)
})

// 顶栏快捷明暗切换会回落到默认主题，这里同步卡片选中态
const onPresetChange = (event: Event) => {
    const presetId = (event as CustomEvent<{ presetId: string }>).detail?.presetId
    if (presetId) activePresetId.value = presetId
}

const selectTheme = (presetId: string) => {
    if (presetId === activePresetId.value) return
    applyThemePreset(presetId)
    activePresetId.value = presetId
}

// ── 卡片描边强度（仅渐变主题）──
const edgeLevels = EDGE_LEVELS
const edgeLevelLabels = EDGE_LEVEL_LABELS
const edgeLevel = ref<EdgeLevel>(getStoredEdgeLevel())

const selectEdgeLevel = (level: EdgeLevel) => {
    if (level === edgeLevel.value) return
    edgeLevel.value = applyEdgeLevel(level)
}

// 明暗切换：切到该基调的第一套配色，列表随之换成对应系别的卡片
const switchMode = (mode: 'light' | 'dark') => {
    if (isDark.value === (mode === 'dark')) return
    const candidate = themePresets.find(p => p.base === mode)
    if (candidate) selectTheme(candidate.id)
}

const swatchStyle = (preset: ThemePreset) => ({
    background: preset.preview || preset.background,
})

// ── 资料 ──
const profile = ref<UserInfo | null>(null)
const isSuperAdmin = computed(() => session.isSuperAdmin)

const roleMap: Record<string, string> = {
    admin: '管理员',
    editor: '编辑',
    normal: '普通用户',
    visitor: '游客'
}
const roleName = computed(() => roleMap[profile.value?.user_type ?? ''] || '')

// ── 我的权限（只读展示，权限键转中文标签） ──
const PERMISSION_LABELS: Record<string, string> = {
    'overview.viewAll': '查看全站总览',
    'article.viewAll': '查看文章',
    'article.create': '创建文章',
    'article.manageOwn': '管理自己的文章',
    'article.manageAll': '管理全部文章',
    'article.publish': '发布与驳回文章',
    'gallery.viewAll': '查看图库',
    'gallery.create': '创建图库',
    'gallery.manageOwn': '管理自己的图库',
    'gallery.manageAll': '管理全部图库',
    'gallery.publish': '发布与驳回图库',
    'diary.viewAll': '查看随笔',
    'diary.create': '创建随笔',
    'diary.manageOwn': '管理自己的随笔',
    'diary.manageAll': '管理全部随笔',
    'category.manage': '管理分类',
    'label.manage': '管理标签',
    'comment.create': '发表评论与回复',
    'comment.manageOwn': '删除自己的评论',
    'comment.moderate': '管理全部评论',
    'comment.like': '点赞与喜欢',
    'comment.report': '举报评论',
    'file.view': '查看本地文件',
    'file.upload': '上传文件',
    'file.manage': '整理与恢复文件',
    'file.purge': '彻底清除文件',
    'message.private': '收发私信',
    'message.system': '发送系统消息',
    'user.view': '查看用户',
    'user.create': '创建用户',
    'user.edit': '编辑用户',
    'user.disable': '启用与禁用用户',
    'user.delete': '删除用户',
    'user.assignAdmin': '授予管理员角色',
    'permission.view': '查看权限管理',
    'permission.edit': '修改权限矩阵',
    'systemLog.view': '查看系统日志',
}

// 权限分组：与后端 PERMISSION_GROUPS 对齐，键前缀决定归属
const PERMISSION_GROUPS: { key: string; label: string; prefixes: string[] }[] = [
    { key: 'overview', label: '系统总览', prefixes: ['overview'] },
    { key: 'content', label: '内容管理', prefixes: ['article', 'gallery', 'diary', 'category', 'label'] },
    { key: 'interaction', label: '评论互动', prefixes: ['comment'] },
    { key: 'file', label: '本地文件', prefixes: ['file'] },
    { key: 'message', label: '消息通知', prefixes: ['message'] },
    { key: 'user', label: '用户管理', prefixes: ['user'] },
    { key: 'system', label: '系统与权限', prefixes: ['permission', 'systemLog'] },
]

const permissionTotal = computed(() => session.permissions.length)

const permissionGroups = computed(() => {
    const owned = session.permissions
    return PERMISSION_GROUPS.map(group => {
        const items = owned
            .filter(key => group.prefixes.some(prefix => key.startsWith(`${prefix}.`)))
            .map(key => PERMISSION_LABELS[key] || key)
            .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        return { key: group.key, label: group.label, items }
    }).filter(group => group.items.length > 0)
})

// ── 密码 ──
const passwordForm = reactive({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
})
const changingPassword = ref(false)
const passwordMessage = ref('')
const passwordSuccess = ref(false)
const showOld = ref(false)
const showNew = ref(false)

const passwordMismatch = computed(
    () => Boolean(passwordForm.confirmPassword) &&
        passwordForm.newPassword !== passwordForm.confirmPassword
)

// 密码强度：长度 + 字符种类，给出即时反馈（后端仍要求至少 8 位）
const passwordStrength = computed(() => {
    const value = passwordForm.newPassword
    let score = 0
    if (value.length >= 8) score += 1
    if (value.length >= 12) score += 1
    if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score += 1
    if (/[^a-zA-Z0-9]/.test(value)) score += 1

    const levels = [
        { level: 'weak', label: '强度偏弱', percent: 25 },
        { level: 'fair', label: '强度一般', percent: 50 },
        { level: 'good', label: '强度较好', percent: 75 },
        { level: 'strong', label: '强度很高', percent: 100 },
    ]
    return levels[Math.min(score, levels.length - 1)]
})

const canSubmitPassword = computed(
    () => Boolean(passwordForm.oldPassword) &&
        passwordForm.newPassword.length >= 8 &&
        !passwordMismatch.value &&
        !changingPassword.value
)

// ── 头像 ──
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

// ── 系统信息：备份区容量 ──
const storage = ref<FileStorageStatus | null>(null)

const canViewFiles = computed(() => session.can('file.view'))
const canViewPermissions = computed(() => session.can('permission.view'))
const canViewUsers = computed(() => session.can('user.view'))
const canViewSystemLog = computed(() => session.can('systemLog.view'))

const storagePercent = computed(() =>
    Math.min(Math.max(Number(storage.value?.usedPercent ?? 0), 0), 100)
)
const storagePercentText = computed(() => `${storagePercent.value.toFixed(1)}%`)
const storageLevelLabel = computed(() => {
    if (storage.value?.level === 'critical') return '容量已满'
    if (storage.value?.level === 'warning') return '接近上限'
    return '容量正常'
})

const formatBytes = (bytes?: number): string => {
    const value = Number(bytes ?? 0)
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    const scaled = value / Math.pow(1024, index)
    return `${scaled.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

// 快捷入口按权限逐项显示：能进哪个后台模块才出现对应入口
const quickEntries = computed(() => {
    const list: { path: string; name: string; icon: unknown }[] = []
    if (canViewUsers.value) list.push({ path: '/userManagement', name: '用户管理', icon: IconAvatarFill })
    if (canViewSystemLog.value) list.push({ path: '/systemLog', name: '系统日志', icon: IconStatisticsFill })
    if (canViewFiles.value) list.push({ path: '/localfile', name: '本地文件', icon: IconFolderCloseFill })
    return list
})
const hasQuickAccess = computed(() => quickEntries.value.length > 0)

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
            syncAvatarFileList()
        }
    } catch (error) {
        console.error('获取用户信息失败：', error)
    }
}

const loadStorage = async () => {
    if (!canViewFiles.value) return
    try {
        const result = await getFileStorageStatus()
        storage.value = result.code === 200 && result.data ? result.data : null
    } catch {
        storage.value = null
    }
}

const submitPassword = async () => {
    passwordMessage.value = ''
    passwordSuccess.value = false

    if (!passwordForm.oldPassword) {
        passwordMessage.value = '请输入当前密码'
        return
    }
    if (passwordForm.newPassword.length < 8) {
        passwordMessage.value = '新密码至少 8 位'
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

const handleLogout = () => {
    session.clear()
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    router.replace('/loginRegister')
}

onMounted(loadProfile)
onMounted(() => void loadStorage())
onMounted(() => void refreshUploadUrl())
onMounted(() => window.addEventListener('theme:preset-change', onPresetChange))
onMounted(() => window.addEventListener('scroll', syncActiveSection, { passive: true }))
onUnmounted(() => window.removeEventListener('theme:preset-change', onPresetChange))
onUnmounted(() => window.removeEventListener('scroll', syncActiveSection))
</script>

<style lang="less" scoped>
.setting-page {
    width: 100%;
}

// ── 外壳：左侧分区导航 + 右侧内容 ──
.set-shell {
    display: flex;
    align-items: flex-start;
    gap: @space-xl;
    width: 100%;
}

.set-nav {
    position: sticky;
    top: 88px;
    display: flex;
    width: 232px;
    flex: none;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius, 18px);
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
}

.set-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: var(--admin-radius-sm, 12px);
    background: transparent;
    color: var(--admin-text, var(--gray));
    text-align: left;
    cursor: pointer;
    transition: all 0.18s ease;

    &:hover {
        border-color: var(--pcolor3);
        background: var(--pcolor1);
        color: var(--pcolor);
    }

    &.is-active {
        border-color: var(--pcolor3);
        background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
        color: #fff;
        box-shadow: 0 6px 18px var(--pcolor3);
    }
}

.set-nav-icon {
    width: 18px;
    height: 18px;
    flex: none;
    color: var(--pcolor);
}

.set-nav-item.is-active .set-nav-icon {
    color: #fff;
}

.set-nav-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;

    strong {
        font-size: 13px;
        font-weight: 600;
    }

    small {
        overflow: hidden;
        color: var(--admin-muted, var(--gray6));
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.set-nav-item.is-active .set-nav-copy small {
    color: rgba(255, 255, 255, 0.82);
}

.set-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: @space-xl;
}

.set-section {
    display: flex;
    flex-direction: column;
    gap: @space-m;
    scroll-margin-top: 96px;
}

.set-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.set-card {
    display: flex;
    flex-direction: column;
    gap: @space-m;
    padding: 22px 24px;
    border-radius: var(--admin-radius, 18px);
    background: var(--admin-surface, var(--bgColor1));
    box-shadow: var(--admin-shadow-sm, @shadow-s);
    box-sizing: border-box;
}

.set-label {
    display: block;
    color: var(--admin-text, var(--gray));
    font-size: 13px;
    font-weight: 600;
}

.set-subhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

// ── 卡片描边强度 ──
// 预览环复用真实的 --lin-edge-* 变量：切等级时预览与页面卡片同步变化，
// 而不是另写一套仅供展示的色值
.set-edge-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.set-edge-option {
    display: flex;
    flex: 1 1 96px;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 6px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius-sm, 12px);
    background: var(--admin-surface-soft, var(--bgColor2));
    cursor: pointer;
    transition: border-color 0.2s ease, transform 0.2s ease;

    &:hover {
        transform: translateY(-2px);
    }

    &.is-active {
        border-color: var(--pcolor);
        box-shadow: 0 0 0 3px var(--pcolor2);
    }
}

.set-edge-ring {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--admin-surface, var(--bgColor1));
}

// 预览环按等级直接改宽度变量，让同一套 mask 规则画出粗细不同的边
.set-edge-ring[data-level='0'] {
    --lin-edge-width: 0px;
}

.set-edge-ring[data-level='1'] {
    --lin-edge-width: 1px;
}

.set-edge-ring[data-level='2'] {
    --lin-edge-width: 1.5px;
}

.set-edge-ring[data-level='3'] {
    --lin-edge-width: 2px;
}

.set-edge-core {
    position: relative;
    isolation: isolate;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: var(--admin-surface, var(--bgColor1));

    &::before {
        position: absolute;
        inset: 0;
        z-index: -1;
        content: '';
        border-radius: inherit;
        padding: var(--lin-edge-width);
        background: var(--lin-edge-gradient, transparent);
        -webkit-mask: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000);
        mask-composite: exclude;
    }
}

.set-edge-name {
    color: var(--admin-text, var(--gray));
    font-size: 12px;
}

.set-edge-hint {
    margin: 0;
    color: var(--admin-muted, var(--gray6));
    font-size: 12px;
}

// ── 账号资料 ──
.set-profile {
    position: relative;
    padding: 0;
    // .set-card 的 gap 会在横幅与内容区之间插出一条底色缝，这里归零
    gap: 0;
    overflow: hidden;
}

.set-profile-banner {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 84px;
    justify-content: center;
    // 头像现在压在左侧下方，横幅文字仍可整幅排版，但右侧留出安全边距
    padding: 0 24px;
    overflow: hidden;
    background:
        radial-gradient(circle at 84% 0%, rgba(255, 255, 255, 0.22), transparent 42%),
        linear-gradient(120deg, var(--pcolor) 0%, var(--pcolor8) 58%, var(--scolor) 100%);
}

.set-profile-banner-glow {
    position: absolute;
    top: -40%;
    right: -10%;
    width: 260px;
    height: 260px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 70%);
    pointer-events: none;
}

.set-profile-banner-text {
    position: relative;
    color: #fff;
    font-size: 19px;
    font-weight: 700;
}

.set-profile-banner-note {
    position: relative;
    color: rgba(255, 255, 255, 0.82);
    font-size: 12px;
}

.set-profile-body {
    display: flex;
    align-items: center;
    gap: 24px;
    min-height: 104px;
    padding: 16px 24px 24px;
}

// 头像改用普通流布局 + 负 margin 上探进横幅：
// 不再靠 absolute 定位卡片，避免正文内容高度变化导致头像与文字错位
.set-avatar-box {
    flex: none;
    width: 96px;
    height: 96px;
    // 上探进入横幅（横幅 84px 高），让头像压在交界处
    margin-top: -40px;
    position: relative;
    z-index: 1;

    :deep(.yk-upload-picture) {
        width: 96px;
        height: 96px;
        box-sizing: border-box;
        border: none;
        // 描边用 box-shadow 环代替 border：不占尺寸，也不会在横幅上露出卡片色块
        box-shadow:
            0 0 0 3px var(--admin-surface, var(--bgColor1)),
            0 6px 16px rgba(0, 0, 0, 0.15);
    }

    :deep(.yk-upload-picture img) {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
}

.set-profile-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: @space-s;
    align-items: flex-start;
}

.set-profile-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

// 通用「标签 / 值」列表：资料与系统信息共用
.set-facts {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: @space-s @space-l;
    margin: 0;
}

.set-fact {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: @space-s;

    dt {
        flex: none;
        color: var(--admin-muted, var(--gray6));
        font-size: @size-s;
    }

    dd {
        min-width: 0;
        margin: 0;
        overflow: hidden;
        color: var(--admin-text, var(--gray));
        font-size: @size-s;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.set-facts-about {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

// ── 安全 ──
.set-field {
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.set-input-wrap {
    position: relative;
    width: 100%;
}

.set-input {
    box-sizing: border-box;
    width: 100%;
    height: 42px;
    padding: 0 12px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius-sm, 12px);
    outline: none;
    background: var(--bgColor1);
    color: var(--admin-text, var(--gray));
    font-size: 14px;

    &::placeholder {
        color: var(--admin-muted, var(--gray6));
    }

    &:focus {
        border-color: var(--pcolor);
        box-shadow: 0 0 0 3px var(--pcolor2);
    }
}

.set-input-wrap .set-input {
    padding-right: 44px;
}

.set-eye {
    position: absolute;
    top: 50%;
    right: 8px;
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    transform: translateY(-50%);
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--admin-muted, var(--gray6));
    cursor: pointer;
    transition: color 0.18s ease, background 0.18s ease;

    .yk-icon {
        width: 16px;
        height: 16px;
    }

    &:hover {
        background: var(--bgColor2);
        color: var(--pcolor);
    }
}

.set-hint {
    margin: 0;
    font-size: 12px;

    &.is-error {
        color: #fa5247;
    }
}

.set-strength {
    display: flex;
    align-items: center;
    gap: 10px;
}

.set-strength-bar {
    flex: 1;
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--bgColor2);
}

.set-strength-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease, background 0.3s ease;

    &.is-weak { background: #fa5247; }
    &.is-fair { background: var(--wcolor, #ff9a2e); }
    &.is-good { background: var(--scolor, #1fb4a2); }
    &.is-strong { background: linear-gradient(90deg, var(--scolor, #1fb4a2), var(--pcolor)); }
}

.set-strength-label {
    flex: none;
    color: var(--admin-muted, var(--gray6));
    font-size: 11px;
}

// ── 外观 ──
.set-mode-switch {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--bgColor2);
}

.set-mode {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 18px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--admin-muted, var(--gray6));
    font-size: 13px;
    cursor: pointer;
    transition: all 0.18s ease;

    .yk-icon {
        width: 15px;
        height: 15px;
    }

    &.is-active {
        background: linear-gradient(135deg, var(--pcolor), var(--pcolor8));
        color: #fff;
        font-weight: 600;
        box-shadow: 0 4px 12px var(--pcolor3);
    }
}

.set-theme-group+.set-theme-group {
    margin-top: @space-m;
}

.set-themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
    gap: @space-m;
}

.set-theme {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 2px solid transparent;
    border-radius: var(--admin-radius-sm, 12px);
    background: var(--bgColor2);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: var(--admin-shadow-sm, @shadow-s);
    }

    &.is-active {
        border-color: var(--pcolor);
        box-shadow: 0 0 0 3px var(--pcolor2);
    }
}

.set-theme-swatch {
    position: relative;
    display: block;
    height: 52px;
    overflow: hidden;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 8px;
}

.set-theme-dot {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.35);
}

.set-theme-kind {
    position: absolute;
    right: 4px;
    bottom: 4px;
    padding: 1px 5px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.42);
    color: #fff;
    font-size: 10px;
    line-height: 1.5;
    letter-spacing: 0.04em;
}

.set-theme-name {
    color: var(--admin-text, var(--gray));
    font-size: 12px;
    text-align: center;
}

.set-theme-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 16px;
    height: 16px;
    padding: 2px;
    border-radius: 50%;
    background: var(--pcolor);
    color: #fff;
}

// ── 我的权限 ──
.set-perm-all {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: var(--admin-radius-sm, 12px);
    background: var(--pcolor1);
    border: 1px solid var(--pcolor3);

    p {
        margin: 0;
        color: var(--admin-text, var(--gray));
        font-size: 13px;
    }
}

.set-perm-crown {
    width: 22px;
    height: 22px;
    flex: none;
    color: var(--pcolor);
}

.set-perm-groups {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.set-perm-group-name {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    color: var(--admin-text, var(--gray));
    font-size: 13px;
    font-weight: 600;
}

.set-perm-count {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--pcolor1);
    color: var(--pcolor);
    font-size: 11px;
    font-weight: 500;
}

.set-perm-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
}

.set-perm-chip {
    padding: 4px 11px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 999px;
    background: var(--bgColor2);
    color: var(--admin-muted, var(--gray6));
    font-size: 12px;
}

// ── 系统信息 ──
.set-storage {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius-sm, 12px);
    background: var(--bgColor2);
}

.set-storage-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.set-storage-level {
    font-size: 12px;
    font-weight: 600;

    &.is-ok { color: var(--scolor, #1fb4a2); }
    &.is-warning { color: var(--wcolor, #ff9a2e); }
    &.is-critical { color: #fa5247; }
}

.set-storage-bar {
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--bgColor1);
}

.set-storage-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width 0.4s ease;

    &.is-ok { background: var(--scolor, #1fb4a2); }
    &.is-warning { background: var(--wcolor, #ff9a2e); }
    &.is-critical { background: #fa5247; }
}

.set-storage-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--admin-muted, var(--gray6));
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.set-quick {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
}

.set-quick-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: var(--admin-radius-sm, 12px);
    background: var(--bgColor2);
    color: var(--admin-text, var(--gray));
    font-size: 13px;
    cursor: pointer;
    transition: all 0.18s ease;

    span {
        flex: 1;
        min-width: 0;
        text-align: left;
    }

    &:hover {
        border-color: var(--pcolor3);
        background: var(--pcolor1);
        color: var(--pcolor);
    }
}

.set-quick-icon {
    width: 17px;
    height: 17px;
    flex: none;
    color: var(--pcolor);
}

.set-quick-arrow {
    width: 15px;
    height: 15px;
    flex: none;
    color: var(--admin-muted, var(--gray6));
}

// ── 危险区 ──
.set-danger {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border: 1px solid color-mix(in srgb, #fa5247 26%, transparent);
    background: color-mix(in srgb, #fa5247 5%, var(--admin-surface, var(--bgColor1)));
}

.set-danger-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;

    strong {
        color: var(--admin-text, var(--gray));
        font-size: 14px;
    }

    span {
        color: var(--admin-muted, var(--gray6));
        font-size: 12px;
    }
}

// ── 响应式 ──
@media (max-width: 1100px) {
    .set-shell {
        flex-direction: column;
    }

    // 窄屏导航改为横向滚动条，不再 sticky 占位
    .set-nav {
        position: static;
        width: 100%;
        flex-direction: row;
        overflow-x: auto;
        scrollbar-width: none;

        &::-webkit-scrollbar {
            display: none;
        }
    }

    .set-nav-item {
        width: auto;
        flex: none;
    }

    .set-nav-copy small {
        display: none;
    }
}

@media (max-width: 700px) {
    .set-card {
        padding: 18px 16px;
    }

    .set-profile-banner {
        padding: 0 16px;
        min-height: 74px;
    }

    .set-profile-banner-text {
        font-size: 17px;
    }

    .set-profile-body {
        padding: 14px 16px 20px;
        gap: 16px;
        min-height: 92px;
    }

    .set-avatar-box {
        width: 76px;
        height: 76px;
        margin-top: -30px;

        :deep(.yk-upload-picture) {
            width: 76px;
            height: 76px;
        }
    }

    .set-facts {
        grid-template-columns: 1fr;
    }

    .set-danger {
        flex-direction: column;
        align-items: stretch;
    }
}

@media (prefers-reduced-motion: reduce) {
    .set-theme,
    .set-quick-item,
    .set-nav-item {
        transition: none;
    }

    .set-theme:hover {
        transform: none;
    }
}
</style>
