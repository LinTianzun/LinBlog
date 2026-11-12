<template>
    <Teleport to="body">
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
                    @ended="onEnded"
                />
            </div>

            <!-- 命中区：只盖住身体，透明区域不挡页面内容 -->
            <div
                class="dsh-pet-hit"
                :class="{ dragging }"
                :style="hitStyle"
                @pointerdown="onPointerDown"
                @contextmenu.prevent="openMenu"
            />

            <!-- 对话气泡：锚定到角色头部，而不是视频盒边缘 -->
            <div class="pet-bubble-anchor" :class="{ 'is-below': bubbleBelow }" :style="bubbleAnchorStyle">
                <Transition name="pet-bubble">
                    <div v-if="bubble" class="pet-bubble">
                        <img v-if="bubbleEmoji" class="pet-bubble-emoji" :src="bubbleEmoji" alt="" />
                        <span>{{ bubble }}</span>
                    </div>
                </Transition>
            </div>

            <!-- 右键菜单 -->
            <Transition name="pet-menu">
                <div v-if="menuOpen" class="pet-menu" :class="{ 'is-below': menuBelow }"
                    :style="menuAnchorStyle" @pointerdown.stop>
                    <button type="button" @click="goHome">
                        <span class="pet-menu-icon">🏠</span>回到原位
                    </button>
                    <button type="button" @click="toggleSleep">
                        <span class="pet-menu-icon">{{ sleepPhase ? '☀️' : '🌙' }}</span>
                        {{ sleepPhase ? '叫醒它' : '睡一觉' }}
                    </button>
                    <button type="button" @click="speakNow">
                        <span class="pet-menu-icon">💬</span>说句话
                    </button>
                    <button type="button" @click="playRandomAction">
                        <span class="pet-menu-icon">🎲</span>随便演一个
                    </button>
                </div>
            </Transition>
        </div>
    </Teleport>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
    getDesktopPetSettings,
    normalizeDesktopPetSettings,
    onDesktopPetCommand,
    onDesktopPetSettingsChange,
    setDesktopPetSettings,
    type DesktopPetSettings,
} from '../../utils/desktopPet'
import { getSiteSettings } from '../../api/site'

// dsh-pet 桌面宠物移植版（素材来自 PC2005-cloud/dsh-pet，MIT）：
// 纯 webm 透明动画 + 随机动作链 + 拖拽甩抛物理 + 睡觉 + 碎碎念。
// 不依赖 DSH：余额 / 会话联动 / AI 对话等功能未移植，只保留桌宠本体。

/** 站点设置（大小 / 活泼程度 / 漫游 / 拖拽），服务端为准，本地缓存避免首屏闪烁 */
const petSettings = ref<DesktopPetSettings>(getDesktopPetSettings())
const route = useRoute()
const inPortal = computed(() => route.path.startsWith('/portal'))
const inAdmin = computed(() => !inPortal.value && Boolean(route.meta.requiresAuth))
const scopeMatches = computed(() => {
    const scope = petSettings.value.petScope
    if (scope === 'portal') return inPortal.value
    if (scope === 'admin') return inAdmin.value
    return true
})
const visible = computed(
    () => petSettings.value.desktopPetEnabled && scopeMatches.value
)
const unsubscribeSettings = onDesktopPetSettingsChange((next) => {
    petSettings.value = normalizeDesktopPetSettings(next)
})

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
    const max = Math.max(120, viewportWidth.value - 16)
    return Math.max(120, Math.round(Math.min(scaled * mobile, max)))
})
const PET_H = computed(() => (PET_W.value * 9) / 16)
/** 走位距离的基准宽度（素材设计尺寸） */
const PET_REF_WIDTH = 462

const petOpacity = computed(() =>
    Math.min(100, Math.max(40, Number(petSettings.value.petOpacity) || 100)) / 100
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
const bubble = ref('')
const bubbleEmoji = ref('')
const sleeping = ref(false)
const squashY = ref(1)
const walking = ref(false)

const stageStyle = computed(() => ({
    width: `${PET_W.value}px`,
    height: `${PET_H.value}px`,
    opacity: String(petOpacity.value),
    // 镜像与挤压合并到同一个 transform：分开写会互相覆盖
    transform: `scaleX(${facing.value === 'right' ? -1 : 1}) scaleY(${squashY.value})`,
}))

// 命中区略小于视频盒：透明边不挡页面点击
const hitStyle = computed(() => ({
    left: `${PET_W.value * 0.12}px`,
    top: `${PET_H.value * 0.08}px`,
    width: `${PET_W.value * 0.76}px`,
    height: `${PET_H.value * 0.84}px`,
}))

// ===== 气泡 =====
// 素材是 320×180，角色实际只占中间一块；按 alpha 阈值实测的可见边界定位，
// 避免气泡按整个视频盒上沿计算而离头顶很远。
const PET_VISIBLE_TOP = 0.172
const PET_VISIBLE_BOTTOM = 0.083
const BUBBLE_MAX_WIDTH = 240
const MENU_MAX_WIDTH = 148

const bubbleBelow = computed(
    () => pos.value.y + PET_H.value * PET_VISIBLE_TOP < 64
)
const menuBelow = computed(
    () => pos.value.y + PET_H.value * PET_VISIBLE_TOP < 190
)

/** 气泡中心跟随角色，但整体被限制在视口内；尾巴再指回角色中心 */
const bubbleAnchorStyle = computed<Record<string, string>>(() => {
    const maxWidth = Math.max(120, Math.min(BUBBLE_MAX_WIDTH, viewportWidth.value - 24))
    // 13px 字号下中文约 13px/字，加左右内边距；估算宽度用于贴边时精准钳制
    const estimated = 26 + bubble.value.length * 13 + (bubbleEmoji.value ? 29 : 0)
    const bubbleWidth = Math.max(52, Math.min(estimated, maxWidth))
    const petCenter = pos.value.x + PET_W.value / 2
    const half = bubbleWidth / 2 + 12
    const clamped = Math.min(
        Math.max(petCenter, half),
        Math.max(half, viewportWidth.value - half)
    )
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
    const maxWidth = Math.max(148, Math.min(MENU_MAX_WIDTH, viewportWidth.value - 24))
    const petCenter = pos.value.x + PET_W.value / 2
    const half = maxWidth / 2 + 12
    const clamped = Math.min(
        Math.max(petCenter, half),
        Math.max(half, viewportWidth.value - half)
    )
    return {
        left: `${Math.round(clamped - pos.value.x)}px`,
        maxWidth: `${maxWidth}px`,
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
const POKE_LINES = ['呀！被抓到了', '喵？', '嘿嘿，好痒', '再来一次！', 'Q 弹 Q 弹的～']
const SLEEP_LINES = ['zzz……', '梦到小鱼干了……', '呼……呼……']
const WAKE_LINES = ['唔……我醒了。', '睡饱啦，主人！']

const randomFrom = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

let bubbleTimer: number | undefined

const showBubble = (text: string, duration = 3000, emoji = '') => {
    if (!petSettings.value.petBubbleEnabled) return
    bubble.value = text
    bubbleEmoji.value = emoji
    window.clearTimeout(bubbleTimer)
    bubbleTimer = window.setTimeout(() => {
        bubble.value = ''
    }, duration)
}

// ===== 动画链 =====
const animUrl = (name: string) => `/pet/webm/${encodeURIComponent(name)}.webm`

let currentAnim = IDLE[0]
let switchGen = 0
let sleepPhase: '' | 'start' | 'loop' | 'end' = ''
let sleepSetActive = { ...SLEEP_SET }

const elementOf = (index: 0 | 1) => (index === 0 ? videoA.value : videoB.value)

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
    const weights = ACTIVITY_WEIGHTS[petSettings.value.petActivity] ?? ACTIVITY_WEIGHTS.normal
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
    if (!petSettings.value.petRoamingEnabled) return false
    if (walkRaf) return true
    const action = randomFrom(MOVES)
    const dir = facing.value === 'right' ? 1 : -1
    const scale = PET_W.value / PET_REF_WIDTH
    const dist = (action.minDist + Math.random() * (action.maxDist - action.minDist)) * scale
    const targetX = pos.value.x + dir * dist
    const maxX = window.innerWidth - PET_W.value - 8
    if (targetX < 8 || targetX > maxX) return false
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

const clampPos = (p: { x: number; y: number }) => ({
    x: Math.min(Math.max(p.x, 8), Math.max(window.innerWidth - PET_W.value - 8, 8)),
    y: Math.min(Math.max(p.y, 8), Math.max(window.innerHeight - PET_H.value - 8, 8)),
})

const onPointerDown = (event: PointerEvent) => {
    markInteraction()
    if (menuOpen.value) {
        closeMenu()
        return
    }
    event.preventDefault()
    // 关闭拖拽时仍保留点击回应，只是不再跟手/甩抛
    if (!petSettings.value.petDragEnabled) {
        poke()
        return
    }
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
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
        Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 6
    ) {
        pressMoved = true
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
    ;(event.target as HTMLElement).releasePointerCapture?.(event.pointerId)
    if (!dragging.value) return
    dragging.value = false

    if (!pressMoved) {
        poke()
        return
    }
    const velocity = estimateRelease()
    if (velocity) startFlight(velocity.vx, velocity.vy)
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

        const maxX = window.innerWidth - PET_W.value - 8
        const maxY = window.innerHeight - PET_H.value - 8
        let landed = 0

        if (px < 8) {
            px = 8
            if (vx < 0) vx = -vx * RESTITUTION
            py += 0
        } else if (px > maxX) {
            px = maxX
            if (vx > 0) vx = -vx * RESTITUTION
        }
        if (py < 8) {
            py = 8
            if (vy < 0) vy = -vy * RESTITUTION
        } else if (py > maxY) {
            py = maxY
            landed = Math.abs(vy)
            if (vy > 0) vy = -vy * RESTITUTION
            vx *= Math.max(0, 1 - GROUND_FRICTION * dt)
        }

        pos.value = { x: px, y: py }

        // 触底且速度衰减到静止：落定
        if (py >= maxY - 0.5 && Math.abs(vy) < 40 && Math.abs(vx) < 15) {
            flightRaf = 0
            pos.value = { x: Math.min(Math.max(px, 8), maxX), y: maxY }
            if (landed > 0) startSquash(Math.min(0.8, 1 - Math.min(1, Math.max(0, (landed - 300) / 1200)) * 0.45))
            settle()
            return
        }

        if (py >= maxY - 0.5 && landed > 0) {
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
    startSquash()
    showBubble(randomFrom(POKE_LINES))
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
    showBubble(randomFrom(IDLE_LINES))
}

const scheduleWhisper = () => {
    window.clearTimeout(whisperTimer)
    if (!petSettings.value.petBubbleEnabled) return
    const [minDelay, maxDelay] =
        WHISPER_DELAYS[petSettings.value.petActivity] ?? WHISPER_DELAYS.normal
    whisperTimer = window.setTimeout(() => {
        if (visible.value && !dragging.value && !sleepPhase && !document.hidden && bubble.value === '') {
            playAnim(pickFrom(WHISPER, currentAnim), true)
            showBubble(randomFrom(IDLE_LINES))
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

// ===== 位置持久化 =====
const STORAGE_KEY = 'linblog-dsh-pet-pos'

const persistPosition = () => {
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
    pos.value = clampPos(pos.value)
}

/** 默认停靠位置：右下或左下，避开底部安全区 */
const homePosition = () => ({
    x:
        petSettings.value.petHomeCorner === 'left'
            ? 28
            : Math.max(window.innerWidth - PET_W.value - 28, 8),
    y: Math.max(window.innerHeight - PET_H.value - 96, 8),
})

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
    }
)

watch(
    () => petSettings.value.petActivity,
    () => scheduleWhisper()
)

// ===== 自动入睡 =====
const AUTO_SLEEP_IDLE_MS = 3 * 60 * 1000
let lastInteractionAt = Date.now()
let autoSleepTimer: number | undefined

const markInteraction = () => {
    lastInteractionAt = Date.now()
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
    unsubscribeCommand()
    stopWalk()
    stopFlight()
    window.clearInterval(autoSleepTimer)
    if (squashRaf) cancelAnimationFrame(squashRaf)
    window.clearTimeout(bubbleTimer)
    window.clearTimeout(whisperTimer)
    window.clearInterval(sleepTalkTimer)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('pointerdown', onMenuOutside)
})
</script>

<style lang="less" scoped>
.dsh-pet-root {
    position: fixed;
    z-index: 9600;
    pointer-events: none;
    user-select: none;
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
    width: 22px;
    height: 22px;
    object-fit: contain;
}

.pet-menu {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 148px;
    max-width: 100%;
    padding: 6px;
    border-radius: 12px;
    background: var(--admin-surface, var(--portal-surface-strong, var(--bgColor1)));
    border: 1px solid var(--admin-line, var(--portal-surface-border, rgba(0, 0, 0, 0.08)));
    box-shadow: var(--admin-shadow-md, var(--portal-shadow-hover, 0 18px 48px rgba(0, 0, 0, 0.16)));
    backdrop-filter: blur(var(--portal-blur-glass, 8px));
    translate: -50% 0;
    pointer-events: auto;
    z-index: 4;

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
