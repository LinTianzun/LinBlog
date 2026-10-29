<template>
    <yk-modal :model-value="open" :title="item?.title || '图库详情'" size="xl" :show-footer="false" :closeable="true"
        content-height="calc(100vh - 120px)" @update:model-value="handleVisibleChange">
        <div v-if="item" class="gallery-detail" :class="{ loading: detailLoading }">
            <div v-if="detailLoading" class="detail-loading" aria-live="polite">
                <yk-spinner size="m" />
            </div>

            <!-- ── Hero 区：首图全幅 + 标题与元信息覆盖层 ── -->
            <div class="gd-hero" v-if="images.length">
                <div class="gd-hero-frame" @click="openLightbox(0)">
                    <img v-if="images[heroIndex]" :src="images[heroIndex]" :alt="`${item.title} - ${heroIndex + 1}`"
                        loading="eager" @error="onHeroError" />
                    <div class="gd-hero-veil" />
                    <div class="gd-hero-caption">
                        <span v-if="item.subsetName" class="gd-hero-chip">{{ item.subsetName }}</span>
                        <h2 class="gd-hero-title">{{ item.title }}</h2>
                        <p v-if="item.introduce" class="gd-hero-intro">{{ item.introduce }}</p>
                    </div>
                    <span class="gd-hero-zoom-hint">
                        <IconZoomInOutline /> 点击放大
                    </span>
                </div>

                <!-- 胶片条：水平滚动缩略图，当前帧高亮 -->
                <div class="gd-filmstrip" v-if="images.length > 1">
                    <button type="button" class="gd-strip-nav gd-strip-prev" :disabled="heroIndex === 0"
                        @click="stepHero(-1)" aria-label="上一张">
                        <IconRightOutline class="gd-icon-flip" />
                    </button>
                    <div class="gd-strip-track" ref="stripRef">
                        <button v-for="(src, i) in images" :key="i" type="button"
                            class="gd-strip-thumb" :class="{ active: i === heroIndex }"
                            @click="heroIndex = i" :aria-label="`第 ${i + 1} 张`">
                            <img :src="src" :alt="`缩略图 ${i + 1}`" loading="lazy" />
                            <span class="gd-strip-num">{{ String(i + 1).padStart(2, '0') }}</span>
                        </button>
                    </div>
                    <button type="button" class="gd-strip-nav gd-strip-next"
                        :disabled="heroIndex === images.length - 1" @click="stepHero(1)"
                        aria-label="下一张">
                        <IconRightOutline />
                    </button>
                </div>
            </div>

            <!-- 无图片时的空状态 -->
            <div v-else class="gd-empty-photos">
                <IconImageOutline />
                <p>这组图库暂无图片</p>
            </div>

            <!-- ── 统计栏 ── -->
            <div class="gd-stats-bar">
                <div class="gd-stats-left">
                    <span class="gd-stat-item">
                        <IconEyeOutline /> {{ views }}
                    </span>
                    <button type="button" class="gd-like-btn"
                        :class="{ liked: likeState.liked, busy: likeBusy }"
                        :disabled="likeBusy || likePending"
                        :title="canInteract ? '喜欢 / 取消喜欢' : '登录后即可喜欢'"
                        @click="handleLike">
                        <template v-if="!likePending">
                            <IconHeartFill v-if="likeState.liked" />
                            <IconHeartOutline v-else />
                        </template>
                        {{ likeState.likes }}
                    </button>
                    <span class="gd-stat-item">
                        <IconCameraOutline /> {{ images.length }} 张
                    </span>
                    <span class="gd-stat-item">
                        <IconCommentOutline /> {{ commentTotal }}
                    </span>
                </div>
                <time class="gd-stats-date">{{ formatDate(item.publishedAt || item.createdAt) }}</time>
            </div>

            <!-- ── 瀑布流照片墙 ── -->
            <div class="gd-masonry" v-if="images.length > 1">
                <figure v-for="(src, i) in images.slice(1)" :key="i"
                    class="gd-masonry-item"
                    :style="{ '--stagger': `${Math.min(i, 15) * 40}ms` }"
                    @click="openLightbox(i + 1)">
                    <img :src="src" :alt="`${item.title} - ${i + 2}`" loading="lazy" />
                    <span class="gd-masonry-index">{{ String(i + 2).padStart(2, '0') }}</span>
                    <div class="gd-masonry-overlay">
                        <IconZoomInOutline />
                    </div>
                </figure>
            </div>

            <!-- 评论区 -->
            <PortalCommentSection
                target-type="article"
                :target-id="item?.id ?? null"
                @comments-change="onCommentsChange"
                @need-login="goLogin" />
        </div>

        <!-- ── 自定义 Lightbox：全屏查看，键盘翻页 ── -->
        <Teleport to="body">
            <div v-if="lightbox.open" class="gd-lightbox" @click.self="closeLightbox"
                @keydown.esc.prevent="closeLightbox"
                @keydown.arrow-left.prevent="stepLightbox(-1)"
                @keydown.arrow-right.prevent="stepLightbox(1)">
                <button type="button" class="gd-lb-close" @click="closeLightbox"
                    aria-label="关闭">
                    <IconCrossOutline />
                </button>
                <button v-if="lightbox.index > 0" type="button" class="gd-lb-nav gd-lb-prev"
                    @click="stepLightbox(-1)" aria-label="上一张">
                    <IconRightOutline class="gd-icon-flip" />
                </button>
                <div class="gd-lb-stage" @click.self="closeLightbox">
                    <img :src="images[lightbox.index]" :alt="`${item?.title} - ${lightbox.index + 1}`"
                        :key="lightbox.index" />
                </div>
                <button v-if="lightbox.index < images.length - 1" type="button"
                    class="gd-lb-nav gd-lb-next" @click="stepLightbox(1)"
                    aria-label="下一张">
                    <IconRightOutline />
                </button>
                <div class="gd-lb-counter">
                    {{ lightbox.index + 1 }} / {{ images.length }}
                </div>
            </div>
        </Teleport>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { parseGalleryContent, type ArticleItem } from '../../api/article'
import {
    getLikeState,
    toggleLike,
    recordView,
    type LikeState
} from '../../api/portal'
import PortalCommentSection from './PortalCommentSection.vue'
import { useSessionStore } from '../../store/session.ts'

const props = defineProps<{
    open: boolean
    item: ArticleItem | null
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'view-counted', payload: { id: number; views: number }): void
    (e: 'interaction-change', payload: { id: number; likes: number; comments: number }): void
}>()

const images = computed(() => (props.item ? parseGalleryContent(props.item.content) : []))

// 浏览量本地副本：接口回读后立即刷新
const views = ref(0)

// 评论区最新总数，用于点赞后回写列表卡片
const commentTotal = ref(0)
const detailLoading = ref(false)

const likeState = ref<LikeState>({ liked: false, likes: 0 })
const likeBusy = ref(false)
// 点赞状态加载中：此期间不渲染图标，避免打开弹窗时图标与计数跳变
const likePending = ref(false)

// Hero 区当前帧
const heroIndex = ref(0)
const stripRef = ref<HTMLElement | null>(null)

// Lightbox 状态
const lightbox = ref({ open: false, index: 0 })

const router = useRouter()
const proxy = getCurrentInstance()?.proxy
const session = useSessionStore()

// 喜欢能力按 comment.like 权限判定，游客角色默认没有该权限
const canInteract = computed(
    () => Boolean(localStorage.getItem('token')) && session.can('comment.like')
)

const handleVisibleChange = (value: boolean) => {
    if (!value) emit('close')
}

const formatDate = (value?: string | null) => {
    const date = new Date(value || '')
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
}

// Hero 帧步进
const stepHero = (delta: number) => {
    const next = heroIndex.value + delta
    if (next < 0 || next >= images.value.length) return
    heroIndex.value = next
    scrollStripIntoView()
}

// 胶片条自动滚动到当前帧
const scrollStripIntoView = () => {
    nextTick(() => {
        const track = stripRef.value
        if (!track) return
        const active = track.querySelector('.gd-strip-thumb.active') as HTMLElement | null
        if (active) {
            active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        }
    })
}

// Lightbox 控制
const openLightbox = (index: number) => {
    lightbox.value = { open: true, index }
}

const closeLightbox = () => {
    lightbox.value.open = false
}

const stepLightbox = (delta: number) => {
    const next = lightbox.value.index + delta
    if (next < 0 || next >= images.value.length) return
    lightbox.value.index = next
}

// 首图加载失败时切换到下一张
const onHeroError = () => {
    if (heroIndex.value < images.value.length - 1) {
        heroIndex.value++
    }
}

// 打开图库即计一次浏览；后端按访客去重，失败不影响图片展示
const countView = async (galleryId: number) => {
    try {
        const result = await recordView('image', galleryId)
        if (result.code === 200 && result.data) {
            views.value = result.data.views
            emit('view-counted', { id: galleryId, views: result.data.views })
        }
    } catch {
        // 浏览计数失败时保持列表原有数字
    }
}

const loadLikeState = async (galleryId: number) => {
    try {
        const result = await getLikeState(galleryId)
        if (result.code === 200 && result.data) {
            likeState.value = result.data
        }
    } catch {
        // 点赞状态失败时回退到图库自带的 likes 字段
    }
}

const goLogin = () => {
    emit('close')
    void router.push('/loginRegister')
}

// 评论区最新总数变化后同步到列表卡片（点赞时回写用）
const onCommentsChange = (total: number) => {
    commentTotal.value = total
}

const handleLike = async () => {
    const galleryId = props.item?.id
    if (!galleryId || likeBusy.value) return

    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后即可喜欢' })
        return
    }

    likeBusy.value = true
    try {
        const result = await toggleLike(galleryId)
        if (result.code === 200 && result.data) {
            likeState.value = result.data
            emit('interaction-change', {
                id: galleryId,
                likes: result.data.likes,
                comments: commentTotal.value
            })
        }
    } catch (error) {
        const message = (error as { response?: { data?: { message?: string } } })
            .response?.data?.message
        proxy?.$message?.({ type: 'error', message: message || '操作失败，请稍后重试' })
    } finally {
        likeBusy.value = false
    }
}

// 监听稳定的字符串键而非 [open, id] 数组
const loadKey = computed(() => (props.open && props.item?.id ? `${props.item.id}` : ''))

watch(loadKey, async (key, previousKey) => {
    if (key === previousKey) return

    if (!key) {
        commentTotal.value = 0
        detailLoading.value = false
        likePending.value = false
        heroIndex.value = 0
        lightbox.value.open = false
        return
    }

    const galleryId = Number(key)
    if (!Number.isFinite(galleryId)) return

    detailLoading.value = true
    likePending.value = true
    likeState.value = { liked: false, likes: props.item?.likes ?? 0 }
    views.value = props.item?.views ?? 0
    heroIndex.value = 0
    await loadLikeState(galleryId)
    likePending.value = false
    await countView(galleryId)
    detailLoading.value = false
}, { immediate: true })
</script>

<style lang="less" scoped>
.gallery-detail {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0;

    &.loading > :not(.detail-loading) {
        opacity: 0.4;
        transition: opacity 0.15s ease;
    }
}

.detail-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
}

// ===== Hero 区 =====
.gd-hero {
    margin: -4px -4px 0;
}

.gd-hero-frame {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 4px;
    cursor: zoom-in;
    background: var(--portal-line-soft);

    img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.6s cubic-bezier(0.22, 0.61, 0.36, 1);
    }

    &:hover img {
        transform: scale(1.03);
    }

    &:hover .gd-hero-zoom-hint {
        opacity: 1;
        transform: translateY(0);
    }
}

.gd-hero-veil {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(180deg,
        transparent 40%,
        rgba(0, 0, 0, 0.28) 70%,
        rgba(0, 0, 0, 0.55) 100%);
}

.gd-hero-caption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: clamp(16px, 3vw, 32px);
    pointer-events: none;
}

.gd-hero-chip {
    display: inline-block;
    margin-bottom: 10px;
    padding: 4px 14px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.92);
    font-size: 11px;
    letter-spacing: 0.08em;
}

.gd-hero-title {
    margin: 0 0 8px;
    color: #fff;
    font-family: var(--portal-serif);
    font-size: clamp(24px, 3.5vw, 42px);
    font-weight: 700;
    line-height: 1.2;
    text-shadow: 0 2px 16px rgba(0, 0, 0, 0.5);
}

.gd-hero-intro {
    margin: 0;
    max-width: 52ch;
    color: rgba(255, 255, 255, 0.82);
    font-size: 13px;
    line-height: 1.7;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.gd-hero-zoom-hint {
    position: absolute;
    top: 16px;
    right: 16px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.88);
    font-size: 12px;
    opacity: 0;
    transform: translateY(-6px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    pointer-events: none;

    .yk-icon {
        width: 14px;
        height: 14px;
    }
}

// ===== 胶片条 =====
.gd-filmstrip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 0 0;
}

.gd-strip-nav {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 50px;
    border: 1px solid var(--portal-surface-border);
    border-radius: 8px;
    background: var(--portal-surface);
    color: var(--portal-text-secondary);
    cursor: pointer;
    transition: all var(--portal-transition-fast);

    .yk-icon {
        width: 16px;
        height: 16px;
    }

    &:hover:not(:disabled) {
        border-color: var(--portal-accent);
        color: var(--portal-accent);
        background: var(--portal-accent-soft);
    }

    &:disabled {
        opacity: 0.3;
        cursor: default;
    }
}

.gd-icon-flip {
    transform: scaleX(-1);
}

.gd-strip-track {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scroll-behavior: smooth;
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }
}

.gd-strip-thumb {
    position: relative;
    flex: none;
    width: 64px;
    height: 50px;
    border: 2px solid transparent;
    border-radius: 6px;
    overflow: hidden;
    background: var(--portal-line-soft);
    cursor: pointer;
    transition: border-color var(--portal-transition-fast), opacity var(--portal-transition-fast);
    opacity: 0.6;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    &.active {
        border-color: var(--portal-accent);
        opacity: 1;
    }

    &:hover {
        opacity: 1;
    }
}

.gd-strip-num {
    position: absolute;
    bottom: 2px;
    right: 4px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}

// ===== 统计栏 =====
.gd-stats-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 0;
    margin-top: 4px;
    border-bottom: 1px solid var(--portal-line-soft);
    flex-wrap: wrap;
}

.gd-stats-left {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
}

.gd-stat-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--portal-text-tertiary);
    font-size: 13px;
    font-variant-numeric: tabular-nums;

    .yk-icon {
        width: 15px;
        height: 15px;
    }
}

.gd-stats-date {
    color: var(--portal-text-tertiary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.gd-like-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 14px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--portal-text-tertiary);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: all var(--portal-transition-fast);

    .yk-icon {
        width: 15px;
        height: 15px;
    }

    &:hover:not(:disabled) {
        border-color: var(--portal-accent);
        color: var(--portal-accent);
    }

    &.liked {
        border-color: var(--portal-accent);
        background: var(--portal-accent-soft);
        color: var(--portal-accent);
        font-weight: 500;
    }

    &.busy,
    &:disabled {
        cursor: progress;
        opacity: 0.7;
    }
}

// ===== 瀑布流照片墙 =====
.gd-masonry {
    columns: 3;
    column-gap: 12px;
    padding: 16px 0;
}

.gd-masonry-item {
    position: relative;
    display: block;
    width: 100%;
    margin: 0 0 12px;
    break-inside: avoid;
    border-radius: 6px;
    overflow: hidden;
    cursor: zoom-in;
    background: var(--portal-line-soft);
    box-shadow: var(--portal-shadow-soft);
    animation: gd-masonry-in 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    animation-delay: var(--stagger, 0ms);

    img {
        display: block;
        width: 100%;
        height: auto;
        transition: transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
    }

    &:hover img {
        transform: scale(1.04);
    }

    &:hover .gd-masonry-overlay {
        opacity: 1;
    }

    &:hover .gd-masonry-index {
        opacity: 1;
    }
}

.gd-masonry-index {
    position: absolute;
    top: 8px;
    left: 10px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 11px;
    font-family: var(--portal-serif);
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
    opacity: 0;
    transition: opacity var(--portal-transition-fast);
    pointer-events: none;
}

.gd-masonry-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, transparent 50%, rgba(0, 0, 0, 0.3));
    opacity: 0;
    transition: opacity var(--portal-transition-fast);
    pointer-events: none;

    .yk-icon {
        width: 28px;
        height: 28px;
        color: rgba(255, 255, 255, 0.85);
    }
}

@keyframes gd-masonry-in {
    from {
        opacity: 0;
        transform: translateY(14px) scale(0.98);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

// ===== 空状态 =====
.gd-empty-photos {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 200px;
    color: var(--portal-text-tertiary);

    .yk-icon {
        width: 48px;
        height: 48px;
    }

    p {
        margin: 0;
        font-size: 14px;
    }
}

// ===== Lightbox =====
.gd-lightbox {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(8, 10, 14, 0.92);
    backdrop-filter: blur(6px);
    animation: gd-lb-fade 0.2s ease;
}

@keyframes gd-lb-fade {
    from { opacity: 0; }
    to { opacity: 1; }
}

.gd-lb-close {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all var(--portal-transition-fast);

    .yk-icon {
        width: 20px;
        height: 20px;
    }

    &:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
    }
}

.gd-lb-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
    display: grid;
    place-items: center;
    width: 48px;
    height: 72px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all var(--portal-transition-fast);

    .yk-icon {
        width: 22px;
        height: 22px;
    }

    &:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        border-color: rgba(255, 255, 255, 0.3);
    }
}

.gd-lb-prev {
    left: 20px;
}

.gd-lb-next {
    right: 20px;
}

.gd-lb-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 40px 80px;
    cursor: zoom-out;

    img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 4px;
        animation: gd-lb-img-in 0.25s ease;
    }
}

@keyframes gd-lb-img-in {
    from {
        opacity: 0;
        transform: scale(0.97);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

.gd-lb-counter {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 18px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
}

// ===== 响应式 =====
@media (max-width: 900px) {
    .gd-masonry {
        columns: 2;
    }

    .gd-hero-frame {
        aspect-ratio: 3 / 2;
    }

    .gd-lb-stage {
        padding: 20px 56px;
    }
}

@media (max-width: 560px) {
    .gd-masonry {
        columns: 1;
    }

    .gd-hero-frame {
        aspect-ratio: 4 / 3;
    }

    .gd-hero-title {
        font-size: 22px;
    }

    .gd-hero-intro {
        -webkit-line-clamp: 1;
    }

    .gd-strip-thumb {
        width: 52px;
        height: 42px;
    }

    .gd-lb-stage {
        padding: 12px 8px;
    }

    .gd-lb-nav {
        width: 40px;
        height: 60px;
    }

    .gd-lb-prev {
        left: 8px;
    }

    .gd-lb-next {
        right: 8px;
    }

    .gd-stats-bar {
        flex-direction: column;
        align-items: flex-start;
    }
}

@media (prefers-reduced-motion: reduce) {
    .gd-hero-frame img,
    .gd-masonry-item img {
        transition: none;
    }

    .gd-masonry-item {
        animation: none;
    }

    .gd-lb-stage img {
        animation: none;
    }
}
</style>
