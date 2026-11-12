<template>
    <Teleport to="body">
        <div class="dsh-pet-layer">
            <div
                v-if="visible"
                ref="rootRef"
                class="dsh-pet-root"
                :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
                :data-facing="facing"
            >
            <!-- 素材透明区 alpha 恒为 1/255，扣一档归零（与 dsh-pet 同一修正） -->
            <svg class="dsh-pet-alpha-filter" width="0" height="0" aria-hidden="true">
                <defs>
                    <filter id="dsh-pet-alpha-fix">
                        <feComponentTransfer>
                            <feFuncA type="linear" slope="1" intercept="-0.0039215686" />
                        </feComponentTransfer>
                    </filter>
                </defs>
            </svg>
            <!-- A/B 双缓冲：前台 opacity 1，后台在换源完成前保持透明 -->
            <div class="dsh-pet-stage" :style="stageStyle">
                <video
                    ref="videoA"
                    class="dsh-pet-video"
                    :class="{ 'is-front': front === 0 }"
                    muted
                    playsinline
                    preload="auto"
                    disablepictureinpicture
                    @error="onVideoError"
                    @ended="onEnded"
                />
                <video
                    ref="videoB"
                    class="dsh-pet-video"
                    :class="{ 'is-front': front === 1 }"
                    muted
                    playsinline
                    preload="auto"
                    disablepictureinpicture
                    @error="onVideoError"
                    @ended="onEnded"
                />
                <img v-if="videoFailed" class="dsh-pet-fallback" :src="petFallback" alt="" />
            </div>

            <!-- 命中区：只盖住身体，透明区域不挡页面内容 -->
            <div
                class="dsh-pet-hit"
                :class="{ dragging }"
                :style="hitStyle"
                role="button"
                tabindex="0"
                :aria-label="petAriaLabel"
                @pointerdown="onPointerDown"
                @contextmenu.prevent="openMenu"
                @keydown.enter.prevent="poke"
                @keydown.space.prevent="poke"
            />

            <!-- 对话气泡：锚定到角色头部，而不是视频盒边缘 -->
            <div class="pet-bubble-anchor" :class="{ 'is-below': bubbleBelow }" :style="bubbleAnchorStyle"
                role="status" aria-live="polite">
                <Transition name="pet-bubble">
                    <div v-if="bubble" class="pet-bubble">
                        <span v-if="bubbleEmoji" class="pet-bubble-emoji" aria-hidden="true">
                            {{ bubbleEmoji }}
                        </span>
                        <span class="pet-bubble-text">{{ bubble }}</span>
                        <button v-if="bubbleAction" type="button" class="pet-bubble-action"
                            @click.stop="followBubbleAction">
                            {{ bubbleAction.label }}
                            <span aria-hidden="true">→</span>
                        </button>
                    </div>
                </Transition>
            </div>

            <!-- 右键菜单 -->
            <Transition name="pet-menu">
                <div v-if="menuOpen" class="pet-menu" :class="{ 'is-below': menuBelow }"
                    :style="menuAnchorStyle" @pointerdown.stop>
                    <div class="pet-menu-section">
                        <span class="pet-menu-label">互动</span>
                        <button type="button" @click="feedPet">
                            <span class="pet-menu-icon">🍚</span>喂一口
                        </button>
                        <button type="button" @click="showStatus">
                            <span class="pet-menu-icon">💗</span>看看状态
                        </button>
                        <button type="button" @click="speakNow">
                            <span class="pet-menu-icon">💬</span>说句话
                        </button>
                        <button type="button" @click="playRandomAction">
                            <span class="pet-menu-icon">🎲</span>随便演一个
                        </button>
                    </div>
                    <div class="pet-menu-section">
                        <span class="pet-menu-label">行为</span>
                        <button type="button" @click="goHome">
                            <span class="pet-menu-icon">🏠</span>回到原位
                        </button>
                        <button type="button" @click="toggleSleep">
                            <span class="pet-menu-icon">{{ sleepPhase ? '☀️' : '🌙' }}</span>
                            {{ sleepPhase ? '叫醒它' : '睡一觉' }}
                        </button>
                    </div>
                    <div class="pet-menu-section">
                        <span class="pet-menu-label">本机偏好</span>
                        <button type="button" @click="toggleQuietHours">
                            <span class="pet-menu-icon">{{ visitorPrefs.quietHoursEnabled ? '☀️' : '🌙' }}</span>
                            {{ visitorPrefs.quietHoursEnabled ? '关闭安静时段' : '开启安静时段' }}
                        </button>
                        <button type="button" @click="hidePet">
                            <span class="pet-menu-icon">🙈</span>仅本机隐藏
                        </button>
                        <button type="button" @click="resetLocalPrefs">
                            <span class="pet-menu-icon">🔄</span>重置本机偏好
                        </button>
                    </div>
                </div>
            </Transition>
            </div>

            <button
                v-else-if="restoreVisible"
                type="button"
                class="dsh-pet-restore"
                aria-label="显示桌面宠物"
                title="显示桌面宠物"
                @click="restorePet"
            >
                <span aria-hidden="true">🐾</span>
            </button>
        </div>
    </Teleport>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    getDesktopPetSettings,
    normalizeDesktopPetSettings,
    onDesktopPetCommand,
    onDesktopPetSettingsChange,
    setDesktopPetSettings,
    type DesktopPetSettings,
} from '../../utils/desktopPet'
import { getSiteSettings } from '../../api/site'
import petFallback from '../../assets/svg/petFallback.svg'
import { getIncomingCommentCursor } from '../../api/comment'
import {
    onPetReaction,
    PET_COMMENT_POLL_INTERVAL,
    PET_LAST_COMMENT_KEY,
    emitPetReaction,
    type PetReactionPayload,
} from '../../utils/desktopPetScene'
import {
    DEFAULT_VISITOR_PET_PREFERENCES,
    getVisitorPetPreferences,
    isWithinQuietHours,
    onVisitorPetPreferencesChange,
    setVisitorPetPreferences,
    timeOfDayGreeting,
    type VisitorPetPreferences,
} from '../../utils/desktopPetVisitor'
import {
    applyDailyGreeting,
    applyFeeding,
    applyPetting,
    getPetVitals,
    markAchievementsCelebrated,
    mergePetVitals,
    normalizePetVitals,
    recordDailyTask,
    setPetVitals,
    vitalsCompanionTitle,
    vitalsIntimacyLevel,
    vitalsMilestoneWall,
    vitalsMoodLabel,
    vitalsNextMilestone,
    type PetVitals,
} from '../../utils/desktopPetVitals'
import {
    mergeRemotePetVitals,
    syncPetVitalsToServer,
} from '../../utils/desktopPetSync'

// dsh-pet 桌面宠物移植版（素材来自 PC2005-cloud/dsh-pet，MIT）：
// 纯 webm 透明动画 + 随机动作链 + 拖拽甩抛物理 + 睡觉 + 碎碎念。
// 不依赖 DSH：余额 / 会话联动 / AI 对话等功能未移植，只保留桌宠本体。

/** 站点设置（大小 / 活泼程度 / 漫游 / 拖拽），服务端为准，本地缓存避免首屏闪烁 */
const petSettings = ref<DesktopPetSettings>(getDesktopPetSettings())
const route = useRoute()
const router = useRouter()
const inPortal = computed(() => route.path.startsWith('/portal'))
const inAdmin = computed(() => !inPortal.value && Boolean(route.meta.requiresAuth))
const scopeMatches = computed(() => {
    const scope = petSettings.value.petScope
    if (scope === 'portal') return inPortal.value
    if (scope === 'admin') return inAdmin.value
    return true
})
const visitorPrefs = ref<VisitorPetPreferences>(getVisitorPetPreferences())
const visible = computed(
    () =>
        petSettings.value.desktopPetEnabled &&
        scopeMatches.value &&
        !visitorPrefs.value.hidden
)
const restoreVisible = computed(
    () =>
        petSettings.value.desktopPetEnabled &&
        scopeMatches.value &&
        visitorPrefs.value.hidden
)
const unsubscribeSettings = onDesktopPetSettingsChange((next) => {
    petSettings.value = normalizeDesktopPetSettings(next)
})
const unsubscribeVisitor = onVisitorPetPreferencesChange((next) => {
    visitorPrefs.value = next
})

interface PetHomeRect {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
}

const inPetHomePage = computed(() => route.path.startsWith('/petManage'))
const petHomeRect = ref<PetHomeRect | null>(null)

/**
 * 宠物显示宽度（px）：档位宽度 × 自定义缩放，素材是 16:9。
 * 移动端再收窄到 60%，并限制不超过视口宽度。
 */
const SIZE_WIDTHS = { small: 200, medium: 300, large: 400 } as const
const viewportWidth = ref(window.innerWidth)
const PET_W = computed(() => {
    const base = SIZE_WIDTHS[petSettings.value.petSize] ?? SIZE_WIDTHS.medium
    const scaled = base * (petSettings.value.petScale || 100) / 100
    const mobile = viewportWidth.value < 640 ? 0.6 : 1
    const homeLimit = inPetHomePage.value && petHomeRect.value
        ? Math.max(120, petHomeRect.value.width - 28)
        : Infinity
    const max = Math.max(120, Math.min(viewportWidth.value - 16, homeLimit))
    return Math.max(120, Math.round(Math.min(scaled * mobile, max)))
})
const PET_H = computed(() => (PET_W.value * 9) / 16)
const movementBounds = computed(() => {
    const home = inPetHomePage.value ? petHomeRect.value : null
    if (home) {
        return {
            left: home.left + 20,
            top: home.top + 20,
            right: home.right - 20,
            bottom: home.bottom - 24,
            maxX: Math.max(home.left + 20, home.right - PET_W.value - 20),
            maxY: Math.max(home.top + 20, home.bottom - PET_H.value - 24),
        }
    }
    return {
        left: 8,
        top: 8,
        right: window.innerWidth - 8,
        bottom: window.innerHeight - 8,
        maxX: Math.max(8, window.innerWidth - PET_W.value - 8),
        maxY: Math.max(8, window.innerHeight - PET_H.value - 8),
    }
})
/** 走位距离的基准宽度（素材设计尺寸） */
const PET_REF_WIDTH = 462

const petOpacity = computed(() =>
    Math.min(100, Math.max(40, Number(petSettings.value.petOpacity) || 100)) / 100
)

// ===== 页面语境 / 安静时段 / 无障碍 =====
// 编辑器里进入「安静陪写」：不漫游、降低动作频率；门户首页则更活泼一点。
const focusMode = computed(
    () => route.path.startsWith('/editarticle') || route.path.startsWith('/editgallery')
)
const portalHome = computed(() => route.path === '/portal')
const nowTick = ref(Date.now())
const quietNow = computed(() =>
    isWithinQuietHours(visitorPrefs.value, new Date(nowTick.value))
)
const reducedMotion = ref(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
)
const effectiveActivity = computed<DesktopPetSettings['petActivity']>(() => {
    if (quietNow.value || focusMode.value) return 'quiet'
    if (portalHome.value && petSettings.value.petActivity !== 'quiet') return 'lively'
    return petSettings.value.petActivity
})
const canRoam = computed(
    () =>
        petSettings.value.petRoamingEnabled &&
        !quietNow.value &&
        !focusMode.value &&
        !reducedMotion.value
)

// ===== 养成状态（登录用户跨设备同步） =====
const vitals = ref<PetVitals>(getPetVitals())
const petName = computed(() => vitals.value.name.trim() || '小 Lin')
let remoteSyncTimer: number | undefined
let authRefreshTimer: number | undefined
let milestoneTimer: number | undefined
let greetingReady = false
watch(
    vitals,
    (next) => {
        setPetVitals(next)
        window.clearTimeout(remoteSyncTimer)
        remoteSyncTimer = window.setTimeout(() => {
            void syncPetVitalsToServer(next)
        }, 1500)
    },
    { deep: true }
)
const petAriaLabel = computed(
    () =>
        `${petName.value}，${vitalsCompanionTitle(vitals.value)}，点击互动，右键打开菜单。心情${vitalsMoodLabel(vitals.value)}，` +
        `饱腹 ${vitals.value.satiety}，亲密度 Lv.${vitalsIntimacyLevel(vitals.value)}`
)

// ===== 动画池（与 dsh-pet assets/config.jsonc 同名精简） =====
const IDLE = ['待机呼吸休闲']
const TURN = ['东张西望']
const DRAG = ['被鼠标拖拽悬空反馈']
const CLICKS = ['点击回应-开心跃动', '点击回应-害羞惊讶', '点击回应-傲娇生气', '点击回应-挠痒咯咯笑', '点击回应-元气挥手']
const MOVES = [
    { name: '螃蟹走路', minDist: 60, maxDist: 240, margin: 20, leadSec: 2, tailSec: 2 },
    { name: '原地漂浮踏步', minDist: 40, maxDist: 120, margin: 20, leadSec: 2, tailSec: 2 },
    { name: '原地左转奔跑', minDist: 120, maxDist: 320, margin: 20, leadSec: 1.75, tailSec: 4.8 },
]
const WHISPER = ['碎碎念-擦桌碎碎念', '碎碎念-发呆碎碎念', '碎碎念-对屏碎碎念']
const SLEEP_SET = { start: '睡觉-开始', loop: '睡觉-循环', end: '睡觉-起来' }

interface Category {
    id: string
    weight: number
    noMirror?: boolean
    actions: string[]
}

const CATEGORIES: Category[] = [
    {
        id: '小动作',
        weight: 20,
        actions: ['悠闲哼歌', '超大伸懒腰', '哈欠连天', '原地小憩沉眠', '被吓一跳', '打瞌睡被惊醒', '照镜子', '写代码'],
    },
    {
        id: '玩耍',
        weight: 20,
        actions: ['原地专心玩魔方', '蓝鲸现世', '优雅女仆舞', '可爱宅舞', '吹气球', '动物环绕', '拆礼物', '变鸽子', '三球抛接', '撸猫'],
    },
    {
        id: '吃什么',
        weight: 16,
        actions: ['吃白饭', '大口吃零食', '吃Token', '吃冰淇淋融化', '吃西瓜', '涮火锅'],
    },
    {
        id: '时节',
        weight: 14,
        actions: ['堆雪人', '放烟花', '收红包', '装点圣诞树', '吃粽子', '舞狮头'],
    },
    { id: '文字', weight: 10, noMirror: true, actions: ['深度思考碎碎念'] },
]

/** 活泼程度 → 顶层权重（idle / turn / move，余量归随机动作分类） */
const ACTIVITY_WEIGHTS = {
    quiet: { idle: 22, turn: 6, move: 2 },
    normal: { idle: 10, turn: 5, move: 5 },
    lively: { idle: 4, turn: 4, move: 12 },
} as const

// ===== 物理参数（与 dsh-pet 默认值一致） =====
const GRAVITY = 1400 // px/s²
const RESTITUTION = 0.78
const GROUND_FRICTION = 2.5
const DEAD_ZONE_SPEED = 500 // 低于此速度松手视为原地放下
const MAX_THROW_SPEED = 3600
const SQ_DURATION_MS = 220

const rootRef = ref<HTMLElement | null>(null)
const videoA = ref<HTMLVideoElement | null>(null)
const videoB = ref<HTMLVideoElement | null>(null)

// 关闭时视频节点被销毁；重新开启后 v-if 会重建空 video，需要补一次 src 才能继续播
watch(
    visible,
    (enabled) => {
        if (!enabled) return
        const el = elementOf(front.value)
        if (el && !el.getAttribute('src')) {
            el.src = animUrl(currentAnim)
            el.loop = false
            videoFailed.value = false
            fallbackNotified = false
            el.play().catch(() => {})
        }
    },
    { flush: 'post' }
)

// 尺寸档位变化后重新钳制位置，避免大号宠物越出视口
watch(
    () => PET_W.value,
    () => {
        pos.value = clampPos(pos.value)
    },
    { flush: 'post' }
)
const pos = ref({ x: 0, y: 0 })
const facing = ref<'left' | 'right'>('left')
const front = ref<0 | 1>(0)
const dragging = ref(false)
const menuOpen = ref(false)
interface BubbleAction {
    path: string
    label: string
}
const bubble = ref('')
const bubbleEmoji = ref('')
const bubbleAction = ref<BubbleAction | null>(null)
const sleeping = ref(false)
const videoFailed = ref(false)
let fallbackNotified = false
const squashY = ref(1)
const walking = ref(false)

const stageStyle = computed(() => ({
    width: `${PET_W.value}px`,
    height: `${PET_H.value}px`,
    opacity: String(petOpacity.value),
    // 镜像与挤压合并到同一个 transform：分开写会互相覆盖
    transform: `scaleX(${facing.value === 'right' ? -1 : 1}) scaleY(${squashY.value})`,
}))

// 命中区只覆盖角色上半身：保留点击/拖拽，同时避开页面右下角的操作按钮
const hitStyle = computed(() => ({
    left: `${PET_W.value * 0.24}px`,
    top: `${PET_H.value * 0.10}px`,
    width: `${PET_W.value * 0.52}px`,
    height: `${PET_H.value * 0.46}px`,
}))

// ===== 气泡 =====
// 素材是 320×180，角色实际只占中间一块；按 alpha 阈值实测的可见边界定位，
// 避免气泡按整个视频盒上沿计算而离头顶很远。
const PET_VISIBLE_TOP = 0.172
const PET_VISIBLE_BOTTOM = 0.083
const BUBBLE_MAX_WIDTH = 240
const MENU_MAX_WIDTH = 148
const MENU_MAX_HEIGHT = 400

const bubbleBelow = computed(() => {
    const bounds = movementBounds.value
    return pos.value.y + PET_H.value * PET_VISIBLE_TOP < bounds.top + 56
})
const menuSpace = computed(() => {
    const bounds = movementBounds.value
    const above = Math.max(
        80,
        pos.value.y + PET_H.value * PET_VISIBLE_TOP - bounds.top - 16
    )
    const below = Math.max(
        80,
        bounds.bottom -
            (pos.value.y + PET_H.value * (1 - PET_VISIBLE_BOTTOM) + 16)
    )
    return { above, below }
})
const menuBelow = computed(() => {
    const { above, below } = menuSpace.value
    if (below >= MENU_MAX_HEIGHT) return true
    if (above >= MENU_MAX_HEIGHT) return false
    return below >= above
})

/** 气泡中心跟随角色，但整体被限制在当前活动区域内；尾巴再指回角色中心 */
const bubbleAnchorStyle = computed<Record<string, string>>(() => {
    const bounds = movementBounds.value
    const maxWidth = Math.max(
        120,
        Math.min(BUBBLE_MAX_WIDTH, bounds.right - bounds.left - 24, viewportWidth.value - 24)
    )
    // 13px 字号下中文约 13px/字，加左右内边距；估算宽度用于贴边时精准钳制
    const estimated =
        26 +
        bubble.value.length * 13 +
        (bubbleEmoji.value ? 29 : 0) +
        (bubbleAction.value ? 66 : 0)
    const bubbleWidth = Math.max(52, Math.min(estimated, maxWidth))
    const petCenter = pos.value.x + PET_W.value / 2
    const half = bubbleWidth / 2 + 12
    const minCenter = bounds.left + half
    const maxCenter = Math.max(minCenter, bounds.right - half)
    const clamped = Math.min(Math.max(petCenter, minCenter), maxCenter)
    const tailLimit = Math.max(0, bubbleWidth / 2 - 14)
    const tailShift = Math.min(Math.max(petCenter - clamped, -tailLimit), tailLimit)
    return {
        left: `${Math.round(clamped - pos.value.x)}px`,
        maxWidth: `${maxWidth}px`,
        '--pet-tail-shift': `${Math.round(tailShift)}px`,
        ...(bubbleBelow.value
            ? { top: `${Math.round(PET_H.value * (1 - PET_VISIBLE_BOTTOM) + 6)}px` }
            : { bottom: `${Math.round(PET_H.value * (1 - PET_VISIBLE_TOP) + 2)}px` }),
    }
})

const menuAnchorStyle = computed<Record<string, string>>(() => {
    const bounds = movementBounds.value
    const maxWidth = Math.max(
        148,
        Math.min(MENU_MAX_WIDTH, bounds.right - bounds.left - 24, viewportWidth.value - 24)
    )
    const maxHeight = Math.min(
        MENU_MAX_HEIGHT,
        menuBelow.value ? menuSpace.value.below : menuSpace.value.above
    )
    const petCenter = pos.value.x + PET_W.value / 2
    const half = maxWidth / 2 + 12
    const minCenter = bounds.left + half
    const maxCenter = Math.max(minCenter, bounds.right - half)
    const clamped = Math.min(Math.max(petCenter, minCenter), maxCenter)
    return {
        left: `${Math.round(clamped - pos.value.x)}px`,
        maxWidth: `${maxWidth}px`,
        maxHeight: `${Math.round(maxHeight)}px`,
        ...(menuBelow.value
            ? { top: `${Math.round(PET_H.value * (1 - PET_VISIBLE_BOTTOM) + 8)}px` }
            : { bottom: `${Math.round(PET_H.value * (1 - PET_VISIBLE_TOP) + 8)}px` }),
    }
})

const IDLE_LINES = [
    '摸摸我～',
    '今天也要加油鸭',
    '博客更新了记得看哦',
    '这边有好吃的吗？',
    '拖我甩出去试试！',
    '主人写文章辛苦了～',
    '有新留言吗？好期待',
    '困了……先眯一会儿',
]
const MILESTONE_ANIMATIONS = ['放烟花', '收红包', '点击回应-开心跃动', '点击回应-元气挥手']
/** 按当前页面给一句更贴场景的台词；没有匹配时回落通用台词 */
const routeIdleLine = computed(() => {
    const path = route.path
    if (focusMode.value) return '专心写，我不吵你～'
    if (path.startsWith('/petManage')) return '这里是我的小屋～'
    if (path.startsWith('/setting')) return '慢慢调，我等你。'
    if (path.startsWith('/portal/gallery')) return '这张光线好漂亮。'
    if (path.startsWith('/portal/articles')) return '这篇写得真好。'
    if (path.startsWith('/portal/diary')) return '今天的随笔也很温柔。'
    if (path.startsWith('/portal/messages')) return '有悄悄话就慢慢说～'
    if (portalHome.value) return '门户这边也很热闹～'
    return ''
})
const pickIdleLine = (preferContext = false) => {
    const context = routeIdleLine.value
    if (context && (preferContext || Math.random() < 0.5)) return context
    return randomFrom(IDLE_LINES)
}
const POKE_LINES = ['呀！被抓到了', '喵？', '嘿嘿，好痒', '再来一次！', 'Q 弹 Q 弹的～']
const SLEEP_LINES = ['zzz……', '梦到小鱼干了……', '呼……呼……']
const WAKE_LINES = ['唔……我醒了。', '睡饱啦，主人！']

const randomFrom = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

let bubbleTimer: number | undefined

const showBubble = (
    text: string,
    duration = 3000,
    emoji = '',
    force = false,
    action: BubbleAction | null = null
) => {
    if (!petSettings.value.petBubbleEnabled && !force) return
    bubble.value = text
    bubbleEmoji.value = emoji
    bubbleAction.value = action
    const visibleFor = action ? Math.max(duration, 6000) : duration
    window.clearTimeout(bubbleTimer)
    bubbleTimer = window.setTimeout(() => {
        bubble.value = ''
        bubbleAction.value = null
    }, visibleFor)
}

const followBubbleAction = () => {
    const action = bubbleAction.value
    if (!action) return
    markInteraction()
    bubble.value = ''
    bubbleAction.value = null
    closeMenu()
    void router.push(action.path)
}

// ===== 动画链 =====
const animUrl = (name: string) => `/pet/webm/${encodeURIComponent(name)}.webm`

let currentAnim = IDLE[0]
let switchGen = 0
let sleepPhase: '' | 'start' | 'loop' | 'end' = ''
let sleepSetActive = { ...SLEEP_SET }

const elementOf = (index: 0 | 1) => (index === 0 ? videoA.value : videoB.value)

/** 视频加载失败：当前前台也不可用时切换到静态形象，避免透明空场 */
const onVideoError = (event: Event) => {
    const target = event.target as HTMLVideoElement | null
    const frontEl = elementOf(front.value)
    if (frontEl && frontEl !== target && frontEl.readyState >= 2 && !frontEl.error) {
        return
    }
    videoFailed.value = true
    if (fallbackNotified) return
    fallbackNotified = true
    showBubble('动画没加载出来，先这样陪你～', 4200, '⚠️', true)
}

/** 换源：后台槽加载新动画，就绪后再交换前台，避免黑帧 */
const playAnim = (name: string, once: boolean) => {
    const back = elementOf(front.value === 0 ? 1 : 0)
    if (!back) return
    const gen = ++switchGen
    currentAnim = name
    back.src = animUrl(name)
    back.loop = !once
    const swap = () => {
        if (gen !== switchGen) return
        const next = front.value === 0 ? 1 : 0
        // 旧前台暂停：否则它播完会触发 ended，造成动画链双跳
        elementOf(front.value)?.pause()
        front.value = next
        videoFailed.value = false
        fallbackNotified = false
        const el = elementOf(next)
        if (!el) return
        el.play().catch(() => {
            // 自动播放被拦截时静默：用户首次交互后自然恢复
        })
    }
    // 已缓存或很快可播时直接换；否则等 canplay
    if (back.readyState >= 2) swap()
    else back.addEventListener('canplay', swap, { once: true })
}

/** 按权重掷骰：idle / turn / move / action */
const rollKind = () => {
    if (focusMode.value) return Math.random() < 0.7 ? 'idle' : 'turn'
    const weights = ACTIVITY_WEIGHTS[effectiveActivity.value] ?? ACTIVITY_WEIGHTS.normal
    const roll = Math.random()
    if (roll < weights.idle / 100) return 'idle'
    if (roll < (weights.idle + weights.turn) / 100) return 'turn'
    if (roll < (weights.idle + weights.turn + weights.move) / 100) return 'move'
    return 'action'
}

const pickWeightedCategory = (): Category => {
    const eligible = CATEGORIES.filter((c) => !(c.noMirror && facing.value === 'right'))
    const pool = eligible.length ? eligible : CATEGORIES
    const total = pool.reduce((sum, c) => sum + c.weight, 0)
    let t = Math.random() * total
    for (const c of pool) {
        t -= c.weight
        if (t <= 0) return c
    }
    return pool[pool.length - 1]
}

const pickFrom = (pool: readonly string[], exclude?: string) => {
    const entries = exclude ? pool.filter((n) => n !== exclude) : pool
    return randomFrom(entries.length ? entries : pool)
}

/** 随机链：选下一段自播动画 */
const pickNext = () => {
    if (!visible.value || dragging.value || sleeping.value || document.hidden) return
    if (quietNow.value) {
        playAnim(
            Math.random() < 0.15
                ? pickFrom(TURN, currentAnim)
                : pickFrom(IDLE, currentAnim),
            true
        )
        return
    }
    const kind = rollKind()
    if (kind === 'idle') {
        playAnim(pickFrom(IDLE, currentAnim), true)
        return
    }
    if (kind === 'turn') {
        playAnim(pickFrom(TURN, currentAnim), true)
        return
    }
    if (kind === 'move' && tryWalk()) return
    const category = pickWeightedCategory()
    playAnim(pickFrom(category.actions, currentAnim), true)
}

/** 播完判定（移植 dsh-pet decideEndedCue + 睡觉状态机） */
const onEnded = () => {
    if (sleepPhase === 'start') {
        sleepPhase = 'loop'
        playAnim(sleepSetActive.loop, false)
        return
    }
    if (sleepPhase === 'loop') {
        // 循环段不应 ended；被外来动画顶掉时重新点名循环段
        playAnim(sleepSetActive.loop, false)
        return
    }
    if (sleepPhase === 'end') {
        sleepPhase = ''
        sleeping.value = false
        pickNext()
        return
    }
    if (TURN.includes(currentAnim)) {
        facing.value = facing.value === 'left' ? 'right' : 'left'
        pickNext()
        return
    }
    if (DRAG.includes(currentAnim) || CLICKS.includes(currentAnim)) {
        pickNext()
        return
    }
    pickNext()
}

// ===== 走位 =====
let walkRaf = 0
let walkStart = 0
let walkFrom = { x: 0, y: 0 }
let walkTo = { x: 0, y: 0 }
let walkLead = 2
let walkTail = 2
let walkDuration = 4

const stopWalk = () => {
    if (walkRaf) cancelAnimationFrame(walkRaf)
    walkRaf = 0
    walking.value = false
}

const tryWalk = (): boolean => {
    if (!canRoam.value) return false
    if (walkRaf) return true
    const action = randomFrom(MOVES)
    const dir = facing.value === 'right' ? 1 : -1
    const scale = PET_W.value / PET_REF_WIDTH
    const dist = (action.minDist + Math.random() * (action.maxDist - action.minDist)) * scale
    const targetX = pos.value.x + dir * dist
    const bounds = movementBounds.value
    if (targetX < bounds.left || targetX > bounds.maxX) return false
    const el = elementOf(front.value)
    if (!el) return false

    playAnim(action.name, true)
    walkFrom = { x: pos.value.x, y: pos.value.y }
    walkTo = { x: targetX, y: pos.value.y }
    walkLead = action.leadSec
    walkTail = action.tailSec
    walkDuration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 4
    walkStart = performance.now()
    walking.value = true

    const step = () => {
        const t = (performance.now() - walkStart) / 1000
        const travel = Math.max(0.1, walkDuration - walkLead - walkTail)
        if (t <= walkLead) {
            pos.value = { x: walkFrom.x, y: walkFrom.y }
        } else if (t >= walkDuration - walkTail) {
            pos.value = { x: walkTo.x, y: walkTo.y }
        } else {
            const p = (t - walkLead) / travel
            pos.value = {
                x: walkFrom.x + (walkTo.x - walkFrom.x) * p,
                y: walkFrom.y + (walkTo.y - walkFrom.y) * p,
            }
        }
        if (t < walkDuration - walkTail) {
            walkRaf = requestAnimationFrame(step)
        } else {
            walkRaf = 0
            walking.value = false
            persistPosition()
        }
    }
    walkRaf = requestAnimationFrame(step)
    return true
}

// ===== 挤压 =====
let squashRaf = 0

const squashScale = (u: number, squash = 0.55) => {
    if (u < 0.45) {
        const p = u / 0.45
        return 1 - (1 - squash) * p * p
    }
    const p = (u - 0.45) / 0.55
    const c1 = 1.70158
    const c3 = c1 + 1
    const f = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
    return Math.min(1.12, squash + (1 - squash) * Math.max(f, 0))
}

const startSquash = (squash = 0.55) => {
    if (squashRaf) cancelAnimationFrame(squashRaf)
    const start = performance.now()
    const step = () => {
        const u = Math.min((performance.now() - start) / SQ_DURATION_MS, 1)
        squashY.value = squashScale(u, squash)
        if (u < 1) squashRaf = requestAnimationFrame(step)
        else {
            squashRaf = 0
            squashY.value = 1
        }
    }
    squashRaf = requestAnimationFrame(step)
}

// ===== 拖拽与甩抛 =====
interface Sample {
    t: number
    x: number
    y: number
}

let pressOrigin = { x: 0, y: 0 }
let grabOffset = { x: 0, y: 0 }
let pressMoved = false
let trail: Sample[] = []
let flightRaf = 0
const LONG_PRESS_MS = 520
const LONG_PRESS_MOVE_PX = 6
let longPressTimer: number | undefined
let longPressTriggered = false

const clearLongPress = () => {
    if (longPressTimer !== undefined) {
        window.clearTimeout(longPressTimer)
        longPressTimer = undefined
    }
}

const startLongPress = (event: PointerEvent) => {
    clearLongPress()
    longPressTriggered = false
    pressMoved = false
    if (event.pointerType === 'mouse') return
    longPressTimer = window.setTimeout(() => {
        longPressTimer = undefined
        if (pressMoved) return
        longPressTriggered = true
        dragging.value = false
        navigator.vibrate?.(12)
        openMenu()
    }, LONG_PRESS_MS)
}

const clampPos = (p: { x: number; y: number }) => {
    const bounds = movementBounds.value
    return {
        x: Math.min(Math.max(p.x, bounds.left), bounds.maxX),
        y: Math.min(Math.max(p.y, bounds.top), bounds.maxY),
    }
}

const onPointerDown = (event: PointerEvent) => {
    markInteraction()
    if (menuOpen.value) {
        closeMenu()
        return
    }
    event.preventDefault()
    startLongPress(event)
    // 关闭拖拽时仍保留点击回应，只是不再跟手/甩抛
    if (!petSettings.value.petDragEnabled) {
        if (event.pointerType === 'mouse') {
            poke()
            return
        }
        const trackMove = (moveEvent: PointerEvent) => {
            if (
                Math.hypot(
                    moveEvent.clientX - pressOrigin.x,
                    moveEvent.clientY - pressOrigin.y
                ) > LONG_PRESS_MOVE_PX
            ) {
                pressMoved = true
                clearLongPress()
            }
        }
        pressOrigin = { x: event.clientX, y: event.clientY }
        const finishTap = () => {
            window.removeEventListener('pointerup', finishTap)
            window.removeEventListener('pointercancel', finishTap)
            window.removeEventListener('pointermove', trackMove)
            clearLongPress()
            if (!longPressTriggered) poke()
            longPressTriggered = false
        }
        window.addEventListener('pointerup', finishTap, { once: true })
        window.addEventListener('pointercancel', finishTap, { once: true })
        window.addEventListener('pointermove', trackMove)
        return
    }
    try {
        ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    } catch {
        // 合成事件或指针已释放时忽略
    }
    stopFlight()
    stopWalk()
    if (sleepPhase) wake()

    const rect = rootRef.value?.getBoundingClientRect()
    if (!rect) return
    grabOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    pressOrigin = { x: event.clientX, y: event.clientY }
    pressMoved = false
    trail = [{ t: performance.now(), x: event.clientX, y: event.clientY }]

    dragging.value = true
    playAnim(DRAG[0], false)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
}

const onPointerMove = (event: PointerEvent) => {
    if (!dragging.value) return
    pos.value = clampPos({
        x: event.clientX - grabOffset.x,
        y: event.clientY - grabOffset.y,
    })
    const now = performance.now()
    trail.push({ t: now, x: event.clientX, y: event.clientY })
    trail = trail.filter((s) => now - s.t <= 250)
    if (
        !pressMoved &&
        Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > LONG_PRESS_MOVE_PX
    ) {
        pressMoved = true
        clearLongPress()
    }
}

/** 由轨迹估算松手初速（移植 dsh-pet estimateReleaseVelocity，简化峰值加权） */
const estimateRelease = (): { vx: number; vy: number } | null => {
    const now = performance.now()
    const last = trail[trail.length - 1]
    if (!last || now - last.t > 150) return null
    const win = trail.filter((s) => now - s.t <= 150)
    if (win.length < 2) return null
    const t0 = win[0].t
    const t1 = win[win.length - 1].t
    const span = t1 - t0
    if (span < 20) return null
    const baseVx = ((win[win.length - 1].x - win[0].x) / span) * 1000
    const baseVy = ((win[win.length - 1].y - win[0].y) / span) * 1000
    const baseSpeed = Math.hypot(baseVx, baseVy)
    if (baseSpeed < 1e-6) return null

    let peak = 0
    for (let i = 1; i < win.length; i++) {
        const dt = win[i].t - win[i - 1].t
        if (dt >= 8) {
            peak = Math.max(
                peak,
                (Math.hypot(win[i].x - win[i - 1].x, win[i].y - win[i - 1].y) / dt) * 1000
            )
        }
    }
    const speedBeforeClamp = peak > 0 ? baseSpeed * 0.5 + peak * 0.5 : baseSpeed
    const speed =
        MAX_THROW_SPEED * (1 - Math.exp(-speedBeforeClamp / MAX_THROW_SPEED))
    if (speed < DEAD_ZONE_SPEED) return null
    return { vx: (baseVx / baseSpeed) * speed, vy: (baseVy / baseSpeed) * speed }
}

const onPointerUp = (event: PointerEvent) => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    try {
        ;(event.target as HTMLElement).releasePointerCapture?.(event.pointerId)
    } catch {
        // 合成事件或指针已释放时忽略
    }
    clearLongPress()
    if (longPressTriggered) {
        longPressTriggered = false
        dragging.value = false
        return
    }
    if (!dragging.value) return
    dragging.value = false

    if (!pressMoved) {
        poke()
        return
    }
    const velocity = estimateRelease()
    if (velocity && !reducedMotion.value) startFlight(velocity.vx, velocity.vy)
    else settle()
}

/** 原地放下：回到待机并保存位置 */
const settle = () => {
    persistPosition()
    playAnim(IDLE[0], true)
}

const startFlight = (vx: number, vy: number) => {
    let px = pos.value.x
    let py = pos.value.y
    let last = performance.now()

    const step = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05)
        last = now

        vy += GRAVITY * dt
        px += vx * dt
        py += vy * dt

        const bounds = movementBounds.value
        let landed = 0

        if (px < bounds.left) {
            px = bounds.left
            if (vx < 0) vx = -vx * RESTITUTION
            py += 0
        } else if (px > bounds.maxX) {
            px = bounds.maxX
            if (vx > 0) vx = -vx * RESTITUTION
        }
        if (py < bounds.top) {
            py = bounds.top
            if (vy < 0) vy = -vy * RESTITUTION
        } else if (py > bounds.maxY) {
            py = bounds.maxY
            landed = Math.abs(vy)
            if (vy > 0) vy = -vy * RESTITUTION
            vx *= Math.max(0, 1 - GROUND_FRICTION * dt)
        }

        pos.value = { x: px, y: py }

        // 触底且速度衰减到静止：落定
        if (py >= bounds.maxY - 0.5 && Math.abs(vy) < 40 && Math.abs(vx) < 15) {
            flightRaf = 0
            pos.value = {
                x: Math.min(Math.max(px, bounds.left), bounds.maxX),
                y: bounds.maxY,
            }
            if (landed > 0) startSquash(Math.min(0.8, 1 - Math.min(1, Math.max(0, (landed - 300) / 1200)) * 0.45))
            settle()
            return
        }

        if (py >= bounds.maxY - 0.5 && landed > 0) {
            startSquash(Math.min(0.8, 1 - Math.min(1, Math.max(0, (landed - 300) / 1200)) * 0.45))
        }

        flightRaf = requestAnimationFrame(step)
    }
    flightRaf = requestAnimationFrame(step)
}

const stopFlight = () => {
    if (flightRaf) cancelAnimationFrame(flightRaf)
    flightRaf = 0
}

const poke = () => {
    markInteraction()
    const previous = normalizePetVitals(vitals.value)
    vitals.value = applyPetting(vitals.value)
    setPetVitals(vitals.value)
    celebrateMilestones(previous, vitals.value, 1400)
    startSquash()
    const line =
        vitals.value.satiety < 20 && Math.random() < 0.5
            ? '肚子空空的……右键喂我一口吧'
            : randomFrom(POKE_LINES)
    showBubble(line)
    playAnim(pickFrom(CLICKS, currentAnim), true)
}

// ===== 睡觉 =====
let sleepTalkTimer: number | undefined

const toggleSleep = () => {
    markInteraction()
    closeMenu()
    if (sleepPhase) wake()
    else sleep()
}

const sleep = () => {
    if (sleepPhase) return
    markInteraction()
    stopWalk()
    stopFlight()
    sleepSetActive = { ...SLEEP_SET }
    sleepPhase = 'start'
    sleeping.value = true
    playAnim(sleepSetActive.start, true)
    showBubble('好困……我先睡一会儿。')
    window.clearInterval(sleepTalkTimer)
    sleepTalkTimer = window.setInterval(() => {
        if (sleepPhase === 'loop') showBubble(randomFrom(SLEEP_LINES), 3500)
    }, 25000)
}

const wake = () => {
    if (!sleepPhase) return
    markInteraction()
    window.clearInterval(sleepTalkTimer)
    // 入睡过渡中被打断：直接取消，不播「起来」
    if (sleepPhase === 'start') {
        sleepPhase = ''
        sleeping.value = false
        pickNext()
        return
    }
    if (sleepPhase === 'end') return
    sleepPhase = 'end'
    playAnim(sleepSetActive.end, true)
    showBubble(randomFrom(WAKE_LINES))
}

// ===== 碎碎念 =====
let whisperTimer: number | undefined
const WHISPER_DELAYS = {
    quiet: [240000, 480000],
    normal: [120000, 300000],
    lively: [40000, 90000],
} as const

const speakNow = () => {
    markInteraction()
    closeMenu()
    if (sleepPhase === 'loop') {
        showBubble(randomFrom(SLEEP_LINES))
        return
    }
    playAnim(pickFrom(WHISPER, currentAnim), true)
    showBubble(pickIdleLine(true))
}

const scheduleWhisper = () => {
    window.clearTimeout(whisperTimer)
    if (!petSettings.value.petBubbleEnabled) return
    if (quietNow.value) return
    const [minDelay, maxDelay] =
        WHISPER_DELAYS[effectiveActivity.value] ?? WHISPER_DELAYS.normal
    whisperTimer = window.setTimeout(() => {
        if (visible.value && !dragging.value && !sleepPhase && !document.hidden && bubble.value === '' && !quietNow.value) {
            playAnim(pickFrom(WHISPER, currentAnim), true)
            const hungry = vitals.value.satiety < 20
            showBubble(
                hungry && Math.random() < 0.65
                    ? '我有点饿了……右键喂我一口？'
                    : pickIdleLine()
            )
        }
        scheduleWhisper()
    }, minDelay + Math.random() * (maxDelay - minDelay))
}

// ===== 菜单 =====
let menuOutsideBound = false

const openMenu = () => {
    menuOpen.value = true
    if (!menuOutsideBound) {
        window.setTimeout(() => {
            window.addEventListener('pointerdown', onMenuOutside)
            menuOutsideBound = true
        }, 0)
    }
}

const closeMenu = () => {
    menuOpen.value = false
    if (menuOutsideBound) {
        window.removeEventListener('pointerdown', onMenuOutside)
        menuOutsideBound = false
    }
}

const onMenuOutside = () => {
    closeMenu()
}

const goHome = () => {
    markInteraction()
    closeMenu()
    stopWalk()
    stopFlight()
    pos.value = clampPos(homePosition())
    persistPosition()
    settle()
    showBubble('回家啦～')
}

const playRandomAction = () => {
    markInteraction()
    closeMenu()
    if (sleepPhase) wake()
    const category = pickWeightedCategory()
    playAnim(pickFrom(category.actions, currentAnim), true)
}

const feedPet = () => {
    markInteraction()
    closeMenu()
    if (sleepPhase) wake()
    const previous = normalizePetVitals(vitals.value)
    const result = applyFeeding(vitals.value)
    if (result.effect === 'cooldown') {
        vitals.value = result.vitals
        setPetVitals(vitals.value)
        showBubble('刚吃过啦，等一小会儿再喂～', 3000, '🍵', true)
        return
    }
    if (result.effect === 'full') {
        vitals.value = result.vitals
        setPetVitals(vitals.value)
        showBubble('吃不下啦，肚子已经圆滚滚的。', 3000, '🍚', true)
        return
    }
    const task = recordDailyTask(result.vitals, 'feed')
    vitals.value = task.vitals
    setPetVitals(vitals.value)
    celebrateMilestones(previous, task.vitals, 1600)
    const eatCategory = CATEGORIES.find((category) => category.id === '吃什么')
    if (eatCategory) playAnim(pickFrom(eatCategory.actions, currentAnim), true)
    showBubble(
        task.completedNow
            ? '好吃！今日任务也完成啦，心情 +8、亲密度 +1～'
            : '好吃！谢谢你～',
        3200,
        '🍚'
    )
}

const showStatus = () => {
    markInteraction()
    closeMenu()
    const current = vitals.value
    const milestone = vitalsNextMilestone(current)
    const completedTasks = Object.values(current.dailyTasks.progress)
        .filter((value) => value >= 1)
        .length
    const detail = [
        `我叫${petName.value}`,
        `称号 ${vitalsCompanionTitle(current)}`,
        `心情 ${vitalsMoodLabel(current)}`,
        `饱腹 ${current.satiety}`,
        `亲密度 Lv.${vitalsIntimacyLevel(current)}`,
        `今日任务 ${completedTasks}/3`,
    ].join(' · ')
    const nextLine = milestone
        ? `；下一个目标：${milestone.label} ${milestone.target}${milestone.kind === 'streak' ? ' 天' : ' 次'}，还差 ${milestone.remaining}`
        : '；所有陪伴目标都完成啦'
    showBubble(
        current.satiety < 20
            ? `${detail}${nextLine}。先喂我一口吧`
            : `${detail}${nextLine}`,
        5200,
        '💗',
        true
    )
}

const toggleQuietHours = () => {
    markInteraction()
    closeMenu()
    const next = setVisitorPetPreferences({
        quietHoursEnabled: !visitorPrefs.value.quietHoursEnabled,
    })
    showBubble(
        next.quietHoursEnabled
            ? `安静时段已开启（${next.quietStart}–${next.quietEnd}）`
            : '安静时段已关闭，我回来陪你啦～',
        3200,
        next.quietHoursEnabled ? '🌙' : '☀️',
        true
    )
}

const hidePet = () => {
    markInteraction()
    closeMenu()
    setVisitorPetPreferences({ hidden: true })
}

const resetLocalPrefs = () => {
    markInteraction()
    closeMenu()
    setVisitorPetPreferences({ ...DEFAULT_VISITOR_PET_PREFERENCES })
    showBubble('本机偏好已恢复默认～', 3000, '🔄', true)
}

const restorePet = () => {
    markInteraction()
    setVisitorPetPreferences({ hidden: false })
    window.setTimeout(() => {
        showBubble(`${petName.value}回来啦～`, 2600)
        window.setTimeout(() => announcePendingAchievements(), 2800)
    }, 60)
}

// ===== 位置持久化 =====
const STORAGE_KEY = 'linblog-dsh-pet-pos'

const persistPosition = () => {
    if (inPetHomePage.value) return
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pos.value))
    } catch {
        // 忽略持久化失败
    }
}

const restorePosition = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const saved = JSON.parse(raw) as { x: number; y: number }
            pos.value = clampPos(saved)
            return
        }
    } catch {
        // 使用默认位置
    }
    pos.value = clampPos(homePosition())
}

const onResize = () => {
    viewportWidth.value = window.innerWidth
    if (!inPetHomePage.value) {
        pos.value = clampPos(pos.value)
        return
    }
    schedulePetHomeBoundsSync()
}

/** 宠物管理页以小屋为准居中落地，其他页面仍是右下 / 左下 */
const homePosition = () => {
    const bounds = movementBounds.value
    if (inPetHomePage.value && petHomeRect.value) {
        return {
            x: bounds.left + Math.max(0, (bounds.right - bounds.left - PET_W.value) / 2),
            y: bounds.maxY,
        }
    }
    return {
        x:
            petSettings.value.petHomeCorner === 'left'
                ? 28
                : Math.max(window.innerWidth - PET_W.value - 28, 8),
        y: Math.max(window.innerHeight - PET_H.value - 96, 8),
    }
}

// ===== 宠物管理页：活动范围绑定「宠物之家」 =====
let petHomeZone: HTMLElement | null = null
let petHomeResizeObserver: ResizeObserver | null = null
let petHomeRetryTimer: number | undefined
let petHomeSyncRaf = 0
let wasInPetHome = false

const clearPetHomeZone = () => {
    petHomeResizeObserver?.disconnect()
    petHomeResizeObserver = null
    petHomeZone = null
    petHomeRect.value = null
}

const readPetHomeRect = (): boolean => {
    const zone = document.querySelector<HTMLElement>('[data-pet-home-zone]')
    if (!zone) {
        clearPetHomeZone()
        return false
    }

    if (zone !== petHomeZone) {
        petHomeResizeObserver?.disconnect()
        petHomeZone = zone
        if (typeof ResizeObserver !== 'undefined') {
            petHomeResizeObserver = new ResizeObserver(() => {
                schedulePetHomeBoundsSync()
            })
            petHomeResizeObserver.observe(zone)
        }
    }

    const rect = zone.getBoundingClientRect()
    const previous = petHomeRect.value
    const changed =
        !previous ||
        Math.abs(previous.left - rect.left) > 0.5 ||
        Math.abs(previous.top - rect.top) > 0.5 ||
        Math.abs(previous.width - rect.width) > 0.5 ||
        Math.abs(previous.height - rect.height) > 0.5
    if (changed) {
        petHomeRect.value = {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        }
    }
    return true
}

const applyPetHomeMode = (resetPosition: boolean, attempt = 0) => {
    if (!inPetHomePage.value) {
        const wasHome = wasInPetHome
        wasInPetHome = false
        window.clearTimeout(petHomeRetryTimer)
        petHomeRetryTimer = undefined
        clearPetHomeZone()
        if (wasHome) {
            stopWalk()
            stopFlight()
            restorePosition()
        }
        return
    }

    if (!readPetHomeRect()) {
        if (attempt < 12 && petHomeRetryTimer === undefined) {
            petHomeRetryTimer = window.setTimeout(() => {
                petHomeRetryTimer = undefined
                if (inPetHomePage.value) applyPetHomeMode(true, attempt + 1)
            }, 60)
        }
        return
    }

    window.clearTimeout(petHomeRetryTimer)
    petHomeRetryTimer = undefined
    const enteringHome = !wasInPetHome
    wasInPetHome = true
    if (enteringHome || resetPosition) {
        stopWalk()
        stopFlight()
        pos.value = clampPos(homePosition())
    } else {
        pos.value = clampPos(pos.value)
    }
}

const schedulePetHomeBoundsSync = () => {
    if (!inPetHomePage.value) return
    if (petHomeSyncRaf) return
    petHomeSyncRaf = requestAnimationFrame(() => {
        petHomeSyncRaf = 0
        applyPetHomeMode(false)
    })
}

watch(
    () => route.path,
    async () => {
        await nextTick()
        applyPetHomeMode(true)
    },
    { flush: 'post' }
)

// ===== 气泡 / 碎碎念开关 =====
watch(
    () => petSettings.value.petBubbleEnabled,
    (enabled) => {
        if (enabled) {
            scheduleWhisper()
            return
        }
        window.clearTimeout(whisperTimer)
        window.clearTimeout(bubbleTimer)
        bubble.value = ''
        bubbleAction.value = null
    }
)

watch(
    () => petSettings.value.petActivity,
    () => scheduleWhisper()
)

watch(effectiveActivity, () => scheduleWhisper())

watch(focusMode, (focused) => {
    if (focused) stopWalk()
    scheduleWhisper()
})

// 安静时段：自动入睡并停止碎碎念；离开时段后轻轻叫醒
watch(quietNow, (quiet, wasQuiet) => {
    if (quiet === wasQuiet) return
    if (quiet) {
        window.clearTimeout(whisperTimer)
        stopWalk()
        if (!sleepPhase) sleep()
        if (!bubble.value) {
            showBubble('夜深了，我安静陪你。', 3600, '🌙', true)
        }
        return
    }
    if (sleepPhase) wake()
    if (!bubble.value) {
        showBubble(`${timeOfDayGreeting()}～我回来啦`, 3000, '☀️')
    }
    window.setTimeout(() => announcePendingAchievements(), 1200)
})

// ===== 自动入睡 =====
const AUTO_SLEEP_IDLE_MS = 3 * 60 * 1000
let lastInteractionAt = Date.now()
let autoSleepTimer: number | undefined

const markInteraction = () => {
    lastInteractionAt = Date.now()
}

/** 合并当前账号的远端进度并结算每日问候；登录/退出后也会重跑 */
const settleVitals = async (announce: boolean) => {
    const previous = normalizePetVitals(vitals.value)
    const merged = await mergeRemotePetVitals(getPetVitals())
    const greeting = applyDailyGreeting(merged)
    vitals.value = greeting.vitals
    greetingReady = true
    if (announce && greeting.kind !== 'none' && !quietNow.value) {
        window.setTimeout(() => {
            showBubble(
                greeting.kind === 'first'
                    ? `${timeOfDayGreeting()}！我是${petName.value}，右键可以喂我～`
                    : `${timeOfDayGreeting()}～今天也一起加油！`,
                4800,
                greeting.kind === 'first' ? '🐾' : '☀️'
            )
        }, 1200)
    }
    celebrateMilestones(
        previous,
        greeting.vitals,
        announce && greeting.kind !== 'none' && !quietNow.value ? 6200 : 0
    )
    return greeting
}

const milestoneItems = (value: PetVitals) =>
    vitalsMilestoneWall(value).flatMap((group) => group.items)

/** 待庆祝队列：计时器被后续互动打断、页面隐藏或安静时段都不会丢 */
const pendingCelebrationKeys = new Set<string>()

const announcePendingAchievements = (delay = 0) => {
    const items = milestoneItems(vitals.value)
    const byKey = new Map(items.map((item) => [item.key, item]))
    for (const key of [...pendingCelebrationKeys]) {
        const item = byKey.get(key)
        if (!item?.unlocked || item.celebrated) {
            pendingCelebrationKeys.delete(key)
        }
    }
    if (!pendingCelebrationKeys.size) return
    if (quietNow.value || document.hidden || !visible.value) return

    const announce = () => {
        if (quietNow.value || document.hidden || !visible.value) return
        const currentItems = milestoneItems(vitals.value)
        const currentByKey = new Map(
            currentItems.map((item) => [item.key, item])
        )
        const pending = [...pendingCelebrationKeys]
            .map((key) => currentByKey.get(key))
            .filter(
                (item): item is NonNullable<typeof item> =>
                    Boolean(item?.unlocked && !item?.celebrated)
            )
        if (!pending.length) return
        const labels = pending.map(
            (item) =>
                `${item.label} ${item.target}${item.kind === 'streak' ? ' 天' : ' 次'}`
        )
        showBubble(`${petName.value}达成${labels.join('、')}！好耶～`, 5200, '🎉')
        playAnim(pickFrom(MILESTONE_ANIMATIONS, currentAnim), true)
        for (const item of pending) pendingCelebrationKeys.delete(item.key)
        const announced = markAchievementsCelebrated(
            vitals.value,
            pending.map((item) => item.key)
        )
        if (announced !== vitals.value) {
            vitals.value = announced
            setPetVitals(announced)
            emitPetReaction('vitals-updated')
        }
    }

    window.clearTimeout(milestoneTimer)
    if (delay > 0) milestoneTimer = window.setTimeout(announce, delay)
    else announce()
}

/** 跨设备合并或每日结算后，如果刚好达成新目标就加入待庆祝队列 */
const celebrateMilestones = (
    previous: PetVitals,
    next: PetVitals,
    delay = 0
) => {
    if (!previous.firstVisitAt) return
    const previousUnlocked = new Set(
        milestoneItems(previous)
            .filter((item) => item.unlocked)
            .map((item) => item.key)
    )
    for (const item of milestoneItems(next)) {
        if (
            item.unlocked &&
            !item.celebrated &&
            !previousUnlocked.has(item.key)
        ) {
            pendingCelebrationKeys.add(item.key)
        }
    }
    announcePendingAchievements(delay)
}

const startAutoSleepWatch = () => {
    window.clearInterval(autoSleepTimer)
    autoSleepTimer = window.setInterval(() => {
        if (!petSettings.value.petAutoSleepEnabled) return
        if (!visible.value || sleepPhase || sleeping.value) return
        if (dragging.value || menuOpen.value || document.hidden) return
        if (Date.now() - lastInteractionAt < AUTO_SLEEP_IDLE_MS) return
        sleep()
    }, 30000)
}

// ===== 设置页动作指令 =====
const unsubscribeCommand = onDesktopPetCommand((command) => {
    if (!visible.value) return
    if (command === 'home') goHome()
    else if (command === 'sleep' && !sleepPhase) sleep()
    else if (command === 'wake' && sleepPhase) wake()
    else if (command === 'speak') speakNow()
})

// ===== 业务事件联动 =====
const REACTION_ACTIONS: Partial<Record<PetReactionPayload['kind'], string[]>> = {
    'article-published': ['放烟花', '收红包', '点击回应-元气挥手'],
    'gallery-published': ['放烟花', '收红包', '点击回应-元气挥手'],
    'article-saved': ['点击回应-开心跃动'],
    'gallery-saved': ['点击回应-开心跃动'],
    'save-failed': ['被吓一跳'],
    'publish-failed': ['打瞌睡被惊醒'],
    'new-message': ['点击回应-害羞惊讶'],
    'new-comment': ['点击回应-开心跃动'],
    'comment-posted': ['点击回应-元气挥手'],
    login: ['点击回应-元气挥手'],
    logout: ['点击回应-害羞惊讶'],
    'settings-saved': ['点击回应-开心跃动'],
}
const REACTION_EMOJI: Partial<Record<PetReactionPayload['kind'], string>> = {
    'article-published': '🎉',
    'gallery-published': '🎉',
    'new-message': '💌',
    'new-comment': '💬',
    login: '👋',
    logout: '👋',
    'save-failed': '⚠️',
    'publish-failed': '⚠️',
}

const reactionMessage = (payload: PetReactionPayload): string => {
    const count = Math.max(1, Number(payload.count) || 1)
    switch (payload.kind) {
        case 'article-published':
        case 'gallery-published':
            return payload.message || '发布成功！好棒！'
        case 'article-saved':
        case 'gallery-saved':
            return payload.message || '保存好啦～'
        case 'save-failed':
            return payload.message || '保存出错了，我有点担心…'
        case 'publish-failed':
            return payload.message || '发布没有成功，再试一次吧'
        case 'new-message':
            return payload.message || `收到 ${count} 条新私信！`
        case 'new-comment':
            return payload.message || `作品下有 ${count} 条新评论！`
        case 'comment-posted':
            return payload.message || '评论发送成功！'
        case 'login':
            return payload.message || '欢迎回来，今天也一起加油！'
        case 'logout':
            return payload.message || '下次见，我会乖乖等你～'
        case 'settings-saved':
            return payload.message || '设置已保存'
        default:
            return payload.message || ''
    }
}

const reactionAction = (payload: PetReactionPayload): BubbleAction | null => {
    if (payload.actionPath) {
        return { path: payload.actionPath, label: payload.actionLabel || '去看看' }
    }
    if (payload.kind === 'new-message') {
        return { path: '/messages', label: '去看看' }
    }
    if (payload.kind === 'settings-saved') {
        return { path: '/petManage', label: '去宠物管理' }
    }
    return null
}

/** 发布/评论任务在桌宠隐藏或安静时段也要记账，因此放在可见性早退之前 */
const recordBusinessDailyTask = (
    kind: PetReactionPayload['kind']
): boolean => {
    const task =
        kind === 'article-published' || kind === 'gallery-published'
            ? 'publish'
            : kind === 'comment-posted'
              ? 'comment'
              : null
    if (!task) return false
    const result = recordDailyTask(vitals.value, task)
    if (JSON.stringify(result.vitals) !== JSON.stringify(vitals.value)) {
        vitals.value = result.vitals
        setPetVitals(result.vitals)
    }
    if (result.completedNow) emitPetReaction('vitals-updated')
    return result.completedNow
}

const handlePetReaction = (payload: PetReactionPayload) => {
    if (payload.kind === 'vitals-updated') {
        const previous = normalizePetVitals(vitals.value)
        const merged = mergePetVitals(vitals.value, getPetVitals())
        if (JSON.stringify(merged) !== JSON.stringify(vitals.value)) {
            vitals.value = merged
            celebrateMilestones(previous, merged)
        }
        return
    }
    if (payload.kind === 'login' || payload.kind === 'logout') {
        pendingCelebrationKeys.clear()
        window.clearTimeout(milestoneTimer)
        if (payload.kind === 'logout') void syncPetVitalsToServer(vitals.value)
        window.clearTimeout(remoteSyncTimer)
        window.clearTimeout(authRefreshTimer)
        authRefreshTimer = window.setTimeout(() => {
            void settleVitals(false)
        }, 0)
    }
    const dailyTaskCompleted = recordBusinessDailyTask(payload.kind)
    if (!visible.value || quietNow.value || document.hidden) return
    const line = reactionMessage(payload)
    if (!line) return
    const message = dailyTaskCompleted
        ? `${line} 今日小任务完成，奖励已到账！`
        : line
    markInteraction()

    if (sleepPhase) {
        const shouldWake = ['new-message', 'new-comment', 'article-published', 'gallery-published'].includes(payload.kind)
        if (!shouldWake) return
        wake()
        showBubble(
            message,
            3600,
            REACTION_EMOJI[payload.kind] || '',
            false,
            reactionAction(payload)
        )
        return
    }
    showBubble(
        message,
        3600,
        REACTION_EMOJI[payload.kind] || '',
        false,
        reactionAction(payload)
    )
    if (dragging.value) return
    const pool = REACTION_ACTIONS[payload.kind]
    if (pool?.length) playAnim(pickFrom(pool, currentAnim), true)
}

const unsubscribeReaction = onPetReaction(handlePetReaction)

// ===== 新评论轮询 =====
interface StoredCommentCursor {
    userId: number
    article: number
    diary: number
}

let commentTimer: number | undefined
let commentPolling = false

const readCommentCursor = (): StoredCommentCursor | null => {
    try {
        const raw = localStorage.getItem(PET_LAST_COMMENT_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<StoredCommentCursor>
        const cursor = {
            userId: Number(parsed.userId) || 0,
            article: Math.max(0, Number(parsed.article) || 0),
            diary: Math.max(0, Number(parsed.diary) || 0),
        }
        return cursor.userId ? cursor : null
    } catch {
        return null
    }
}

const writeCommentCursor = (cursor: StoredCommentCursor) => {
    try {
        localStorage.setItem(PET_LAST_COMMENT_KEY, JSON.stringify(cursor))
    } catch {
        // 隐私模式下忽略
    }
}

const currentUserId = (): number => {
    try {
        const raw = localStorage.getItem('userInfo')
        if (!raw) return 0
        return Number((JSON.parse(raw) as { id?: number }).id) || 0
    } catch {
        return 0
    }
}

const pollIncomingComments = async () => {
    if (commentPolling || !visible.value || document.hidden) return
    if (!localStorage.getItem('token')) return
    const userId = currentUserId()
    if (!userId) return

    commentPolling = true
    try {
        const stored = readCommentCursor()
        // 首次或切换账号：只记录当前位置，不倒灌历史评论
        if (!stored || stored.userId !== userId) {
            const result = await getIncomingCommentCursor()
            if (result.code === 200 && result.data) {
                writeCommentCursor({
                    userId,
                    article: Number(result.data.latest?.article) || 0,
                    diary: Number(result.data.latest?.diary) || 0,
                })
            }
            return
        }

        const result = await getIncomingCommentCursor({
            articleAfter: stored.article,
            diaryAfter: stored.diary,
        })
        if (result.code !== 200 || !result.data) return
        writeCommentCursor({
            userId,
            article: Number(result.data.latest?.article) || 0,
            diary: Number(result.data.latest?.diary) || 0,
        })
        if (result.data.newCount > 0) {
            const articleTarget = result.data.targets?.article
            const diaryTarget = result.data.targets?.diary
            let actionPath: string | undefined
            if (articleTarget?.id) {
                actionPath =
                    articleTarget.classify === 'image'
                        ? `/portal/gallery?open=${articleTarget.id}`
                        : `/portal/articles?open=${articleTarget.id}`
            } else if (diaryTarget?.id) {
                actionPath = `/portal/diary?open=${diaryTarget.id}`
            }
            handlePetReaction({
                kind: 'new-comment',
                count: result.data.newCount,
                ...(actionPath ? { actionPath, actionLabel: '去看看' } : {}),
            })
        }
    } catch {
        // 接口不可用时下一轮再试
    } finally {
        commentPolling = false
    }
}

const startCommentPolling = () => {
    if (commentTimer !== undefined) window.clearInterval(commentTimer)
    void pollIncomingComments()
    commentTimer = window.setInterval(() => {
        void pollIncomingComments()
    }, PET_COMMENT_POLL_INTERVAL)
}

const stopCommentPolling = () => {
    if (commentTimer !== undefined) window.clearInterval(commentTimer)
    commentTimer = undefined
}

// ===== 性能：空闲预取少量常用动画 =====
const PREFETCH_ANIMS = [
    IDLE[0],
    TURN[0],
    CLICKS[0],
    CLICKS[1],
    SLEEP_SET.start,
    SLEEP_SET.loop,
    SLEEP_SET.end,
    WHISPER[0],
]

const prefetchAnimations = () => {
    const connection = (
        navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string }
        }
    ).connection
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return
    for (const name of new Set(PREFETCH_ANIMS)) {
        if (document.querySelector(`link[data-pet-prefetch="${name}"]`)) continue
        const link = document.createElement('link')
        link.rel = 'prefetch'
        link.as = 'video'
        link.href = animUrl(name)
        link.dataset.petPrefetch = name
        document.head.appendChild(link)
    }
}

// ===== 页签可见性：隐藏时暂停视频与 rAF，回来再恢复 =====
const onVisibilityChange = () => {
    if (document.hidden) {
        videoA.value?.pause()
        videoB.value?.pause()
        stopWalk()
        stopFlight()
        window.clearTimeout(whisperTimer)
        stopCommentPolling()
        return
    }
    const el = elementOf(front.value)
    if (el?.paused) el.play().catch(() => {})
    scheduleWhisper()
    startCommentPolling()
    announcePendingAchievements()
}

/** 跨标签页：登录态变化时切换账号状态，养成进度变化时取两边较高值 */
const onStorage = (event: StorageEvent) => {
    if (event.key === 'token' || event.key === 'userInfo') {
        window.clearTimeout(authRefreshTimer)
        authRefreshTimer = window.setTimeout(() => {
            void settleVitals(false)
        }, 0)
        return
    }
    if (
        !event.key ||
        !/^LINBLOG_DESKTOP_PET_VITALS(?::u\d+)?$/.test(event.key) ||
        !event.newValue
    ) {
        return
    }
    try {
        const previous = normalizePetVitals(vitals.value)
        const incoming = normalizePetVitals(
            JSON.parse(event.newValue) as Partial<PetVitals>
        )
        const merged = mergePetVitals(vitals.value, incoming)
        if (JSON.stringify(merged) !== JSON.stringify(vitals.value)) {
            vitals.value = merged
            celebrateMilestones(previous, merged)
        }
    } catch {
        // 忽略其他页面写入的损坏数据
    }
}

const onOnline = () => {
    void syncPetVitalsToServer(vitals.value)
}

let clockTimer: number | undefined
let motionQuery: MediaQueryList | null = null
const onMotionChange = (event: MediaQueryListEvent) => {
    reducedMotion.value = event.matches
    if (event.matches) {
        stopWalk()
        stopFlight()
    }
}

// ===== 生命周期 =====
onMounted(() => {
    // 以服务端配置为准：缓存只负责首屏不闪，接口回来后校正
    void getSiteSettings()
        .then((res) => {
            if (res?.code === 200 && res.data) {
                setDesktopPetSettings(res.data)
            }
        })
        .catch(() => {
            // 接口不可用时沿用本地缓存的配置
        })
    restorePosition()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', schedulePetHomeBoundsSync, { passive: true })
    void nextTick().then(() => applyPetHomeMode(true))
    startAutoSleepWatch()
    // 初始待机：呼吸动画循环播放
    const a = videoA.value
    if (a) {
        a.src = animUrl(IDLE[0])
        a.loop = false
        a.play().catch(() => {
            // 自动播放被拦截时，等首次点击交互再恢复
        })
    }
    scheduleWhisper()
    clockTimer = window.setInterval(() => {
        nowTick.value = Date.now()
        if (!greetingReady) return
        const rollover = applyDailyGreeting(vitals.value)
        if (rollover.kind === 'none') return
        vitals.value = rollover.vitals
        emitPetReaction('vitals-updated')
        if (!quietNow.value && !sleepPhase) {
            showBubble(
                `${timeOfDayGreeting()}～新的一天，继续加油！`,
                4200,
                '☀️'
            )
        }
    }, 30_000)
    motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null
    motionQuery?.addEventListener('change', onMotionChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('storage', onStorage)
    window.addEventListener('online', onOnline)
    startCommentPolling()

    // 登录用户先合并远端养成进度，再做每日问候；匿名访客只读本机
    void settleVitals(true)
    if (quietNow.value) {
        sleep()
        showBubble('夜深了，我安静陪你。', 3600, '🌙', true)
    }

    // 空闲时只预取少量高频动画，避免一次拉取上百个 webm
    const requestIdle = (
        window as Window & {
            requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number
        }
    ).requestIdleCallback
    if (requestIdle) requestIdle(prefetchAnimations, { timeout: 3000 })
    else window.setTimeout(prefetchAnimations, 2500)

    // 某些浏览器会拦截静音自动播放：首次任意交互后补一次播放
    const resume = () => {
        const el = elementOf(front.value)
        if (el && el.paused) el.play().catch(() => {})
        document.removeEventListener('pointerdown', resume)
    }
    document.addEventListener('pointerdown', resume)
})

onBeforeUnmount(() => {
    unsubscribeSettings()
    unsubscribeVisitor()
    unsubscribeReaction()
    unsubscribeCommand()
    clearLongPress()
    stopCommentPolling()
    stopWalk()
    stopFlight()
    window.clearInterval(autoSleepTimer)
    window.clearInterval(clockTimer)
    if (squashRaf) cancelAnimationFrame(squashRaf)
    window.clearTimeout(bubbleTimer)
    window.clearTimeout(whisperTimer)
    window.clearTimeout(remoteSyncTimer)
    window.clearTimeout(authRefreshTimer)
    window.clearTimeout(milestoneTimer)
    window.clearTimeout(petHomeRetryTimer)
    void syncPetVitalsToServer(vitals.value)
    window.clearInterval(sleepTalkTimer)
    if (petHomeSyncRaf) cancelAnimationFrame(petHomeSyncRaf)
    clearPetHomeZone()
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', schedulePetHomeBoundsSync)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('pointerdown', onMenuOutside)
    window.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('online', onOnline)
    motionQuery?.removeEventListener('change', onMotionChange)
})
</script>

<style lang="less" scoped>
.dsh-pet-layer {
    position: fixed;
    inset: 0;
    z-index: 9600;
    pointer-events: none;
}

.dsh-pet-root {
    position: fixed;
    z-index: 9600;
    pointer-events: none;
    user-select: none;
}

.dsh-pet-restore {
    position: fixed;
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    padding: 0;
    border: 1px solid var(--admin-line, var(--portal-surface-border, rgba(0, 0, 0, 0.12)));
    border-radius: 999px;
    background: var(--admin-surface, var(--portal-surface-strong, #fff));
    box-shadow: var(--admin-shadow-md, var(--portal-shadow-soft, 0 10px 26px rgba(0, 0, 0, 0.14)));
    color: inherit;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
    opacity: 0.82;
    transition: opacity 160ms ease, transform 160ms ease;

    &:hover,
    &:focus-visible {
        opacity: 1;
        transform: translateY(-1px);
    }
}

.dsh-pet-stage {
    position: relative;
    transform-origin: center bottom;
    transition: none;
}

.dsh-pet-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    opacity: 0;
    transition: opacity 180ms ease;
    transform-origin: center;
    filter: url(#dsh-pet-alpha-fix);

    &.is-front {
        opacity: 1;
    }
}

.dsh-pet-fallback {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.12));
}

.dsh-pet-hit {
    position: absolute;
    pointer-events: auto;
    cursor: grab;
    z-index: 2;
    touch-action: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;

    &.dragging {
        cursor: grabbing;
    }
}

.pet-bubble-anchor {
    position: absolute;
    z-index: 3;
    max-width: 100%;
    pointer-events: none;
    // 气泡宽度随内容收缩，用独立 translate 属性居中，
    // 不占用 transform，避免和进出场动画互相覆盖
    translate: -50% 0;
}

.pet-bubble {
    --pet-popover-bg: var(--admin-surface, var(--portal-surface-strong, var(--bgColor1)));
    --pet-popover-line: var(--admin-line, var(--portal-surface-border, rgba(0, 0, 0, 0.08)));
    position: relative;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    max-width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--pet-popover-line);
    border-radius: 14px;
    background: var(--pet-popover-bg);
    box-shadow: var(--admin-shadow-md, var(--portal-shadow-soft, 0 12px 32px rgba(0, 0, 0, 0.12)));
    color: var(--admin-text, var(--portal-text-primary, var(--font-color1)));
    font-size: 13px;
    font-family: var(--portal-sans, inherit);
    line-height: 1.55;
    overflow-wrap: anywhere;
    pointer-events: none;

    &::after {
        position: absolute;
        bottom: -5px;
        // 气泡被视口钳制时尾巴仍指向角色；再用 clamp 保证短气泡里尾巴不出框
        left: clamp(14px, calc(50% + var(--pet-tail-shift, 0px)), calc(100% - 14px));
        width: 9px;
        height: 9px;
        margin-left: -5px;
        content: '';
        transform: rotate(45deg);
        border-right: 1px solid var(--pet-popover-line);
        border-bottom: 1px solid var(--pet-popover-line);
        border-radius: 0 0 2px 0;
        background: var(--pet-popover-bg);
    }
}

.pet-bubble-anchor.is-below .pet-bubble::after {
    top: -5px;
    bottom: auto;
    border-right: none;
    border-bottom: none;
    border-top: 1px solid var(--pet-popover-line);
    border-left: 1px solid var(--pet-popover-line);
    border-radius: 2px 0 0 0;
}

.pet-bubble-emoji {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    font-size: 17px;
    line-height: 1;
}

.pet-bubble-text {
    min-width: 0;
    overflow-wrap: anywhere;
}

.pet-bubble-action {
    flex: none;
    padding: 2px 9px;
    border: 1px solid var(--pet-popover-line);
    border-radius: 999px;
    background: var(--admin-accent-soft, var(--portal-accent-soft, rgba(80, 120, 255, 0.12)));
    color: var(--portal-accent, var(--pcolor, #4f7cff));
    font-family: inherit;
    font-size: 12px;
    line-height: 1.5;
    cursor: pointer;
    pointer-events: auto;

    &:hover,
    &:focus-visible {
        filter: brightness(1.05);
        outline: none;
        box-shadow: 0 0 0 2px var(--portal-accent-soft, rgba(80, 120, 255, 0.18));
    }
}

.pet-menu {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 148px;
    max-width: 100%;
    max-height: min(400px, calc(100vh - 96px));
    padding: 6px;
    border-radius: 12px;
    background: var(--admin-surface, var(--portal-surface-strong, var(--bgColor1)));
    border: 1px solid var(--admin-line, var(--portal-surface-border, rgba(0, 0, 0, 0.08)));
    box-shadow: var(--admin-shadow-md, var(--portal-shadow-hover, 0 18px 48px rgba(0, 0, 0, 0.16)));
    backdrop-filter: blur(var(--portal-blur-glass, 8px));
    translate: -50% 0;
    pointer-events: auto;
    z-index: 4;
    overflow-y: auto;
    scrollbar-width: thin;

    .pet-menu-section {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .pet-menu-section + .pet-menu-section {
        margin-top: 4px;
        padding-top: 5px;
        border-top: 1px solid var(--admin-line, var(--portal-surface-border, rgba(0, 0, 0, 0.08)));
    }

    .pet-menu-label {
        padding: 3px 10px 2px;
        color: var(--admin-muted, var(--portal-text-tertiary, rgba(0, 0, 0, 0.45)));
        font-size: 11px;
        letter-spacing: 0.08em;
    }

    button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--admin-text, var(--portal-text-primary, var(--font-color1)));
        font-size: 13px;
        font-family: var(--portal-sans, inherit);
        cursor: pointer;
        text-align: left;

        &:hover {
            background: var(--admin-accent-soft, var(--portal-accent-soft, rgba(0, 0, 0, 0.06)));
        }
    }
}

.pet-menu-icon {
    font-size: 14px;
}

.pet-bubble-enter-active,
.pet-bubble-leave-active {
    transition: opacity 180ms ease, transform 180ms ease;
}

.pet-bubble-enter-from,
.pet-bubble-leave-to {
    opacity: 0;
    transform: translateY(4px) scale(0.96);
}

.pet-bubble-anchor.is-below .pet-bubble-enter-from,
.pet-bubble-anchor.is-below .pet-bubble-leave-to {
    transform: translateY(-4px) scale(0.96);
}

.pet-menu-enter-active,
.pet-menu-leave-active {
    transition: opacity 150ms ease, transform 150ms ease;
}

.pet-menu-enter-from,
.pet-menu-leave-to {
    opacity: 0;
    transform: translateY(4px);
}

.pet-menu.is-below.pet-menu-enter-from,
.pet-menu.is-below.pet-menu-leave-to {
    transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
    .dsh-pet-video {
        transition: none;
    }
}
</style>
