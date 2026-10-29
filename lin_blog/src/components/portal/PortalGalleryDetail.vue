<template>
    <yk-modal :model-value="open" :title="item?.title || '图库详情'" size="xl" :show-footer="false" :closeable="true"
        content-height="calc(100vh - 120px)" @update:model-value="handleVisibleChange">
        <div v-if="item" class="gallery-detail" :class="{ loading: detailLoading }">
            <div v-if="detailLoading" class="detail-loading" aria-live="polite">
                <yk-spinner size="m" />
            </div>

            <!-- 开场：与后台图库共用多图接触印样，标题回到内容层而不是压在单张图上 -->
            <div class="gd-intro">
                <ContentDetailHero :title="item.title" :introduce="item.introduce || ''"
                    variant="plain" :badges="heroBadges" />

                <ContentPhotoStage v-if="images.length" :photos="images"
                    :visible-count="stagePhotoCount" @preview="openLightbox" />

                <!-- 无图片时的空状态 -->
                <div v-else class="gd-empty-photos">
                    <IconImageOutline />
                    <p>这组图库暂无图片</p>
                </div>
            </div>

            <!-- ── 统计栏：与后台图库详情共用同一个组件，点赞按钮走插槽 ── -->
            <ContentStatBar class="gd-stats-bar" :views="views" :comments="commentTotal"
                :photo-count="images.length" :meta-text="formatDate(item.publishedAt || item.createdAt)">
                <template #like>
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
                </template>
                <template #actions>
                    <PortalShareButton :url="shareUrl" :title="item?.title"
                        :text="item?.introduce || ''" />
                </template>
            </ContentStatBar>

            <!-- 照片墙：开场已使用前 3 张，这里继续展示后续照片 -->
            <section v-if="images.length > stagePhotoCount" class="gd-photos">
                <header class="gd-photos-head">
                    <h3>整组照片</h3>
                    <span>还有 {{ images.length - stagePhotoCount }} 张</span>
                </header>
                <ContentPhotoGrid :photos="images.slice(stagePhotoCount)" layout="masonry"
                    :show-index="true" :start-index="stagePhotoCount" @preview="openLightbox" />
            </section>

            <!-- 评论区 -->
            <PortalCommentSection
                target-type="article"
                :target-id="item?.id ?? null"
                @comments-change="onCommentsChange"
                @need-login="goLogin" />
        </div>

        <!-- ── 灯箱：与后台共用同一个组件，这里只负责传入当前帧 ── -->
        <ContentLightbox :open="lightbox.open" :photos="images" :index="lightbox.index"
            :title="item?.title" @close="closeLightbox" @update:index="lightbox.index = $event" />
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
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
import ContentDetailHero from '../content/ContentDetailHero.vue'
import ContentStatBar from '../content/ContentStatBar.vue'
import ContentPhotoStage from '../content/ContentPhotoStage.vue'
import ContentPhotoGrid from '../content/ContentPhotoGrid.vue'
import ContentLightbox from '../content/ContentLightbox.vue'
import PortalShareButton from './PortalShareButton.vue'
import { portalItemUrl } from '../../utils/portalSeo'

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
const stagePhotoCount = computed(() => Math.min(images.value.length, 3))
const shareUrl = computed(() =>
    props.item?.id ? portalItemUrl('gallery', props.item.id) : ''
)

// 浏览量本地副本：接口回读后立即刷新
const views = ref(0)

// 评论区最新总数，用于点赞后回写列表卡片
const commentTotal = ref(0)
const detailLoading = ref(false)

const likeState = ref<LikeState>({ liked: false, likes: 0 })
const likeBusy = ref(false)
// 点赞状态加载中：此期间不渲染图标，避免打开弹窗时图标与计数跳变
const likePending = ref(false)

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

// 头部与后台图库详情共用同一组标签语义：分类、图片数、日期
const heroBadges = computed(() => {
    const badges: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning' }[] = []
    if (props.item?.subsetName) badges.push({ text: props.item.subsetName, tone: 'accent' })
    badges.push({ text: `${images.value.length} 张`, tone: 'plain' })
    const date = formatDate(props.item?.publishedAt || props.item?.createdAt)
    if (date) badges.push({ text: date, tone: 'plain' })
    return badges
})

// Lightbox 控制
const openLightbox = (index: number) => {
    lightbox.value = { open: true, index }
}

const closeLightbox = () => {
    lightbox.value.open = false
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
        lightbox.value.open = false
        return
    }

    const galleryId = Number(key)
    if (!Number.isFinite(galleryId)) return

    detailLoading.value = true
    likePending.value = true
    likeState.value = { liked: false, likes: props.item?.likes ?? 0 }
    views.value = props.item?.views ?? 0
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

// ===== 开场：标题 + 多图接触印样 =====
.gd-intro {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: -4px -4px 0;
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

// 照片墙区块：门户侧沿用共享网格，这里只补充标题层级与 token 覆盖
.gd-photos {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 0;
}

.gd-photos-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;

    h3 {
        margin: 0;
        color: var(--portal-text-primary);
        font-family: var(--portal-serif);
        font-size: 16px;
        font-weight: 600;
    }

    span {
        color: var(--portal-text-tertiary);
        font-size: 12px;
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

// ===== 响应式 =====
@media (max-width: 900px) {
    .gd-photos {
        padding: 14px 0;
    }
}

@media (max-width: 560px) {
    .gd-stats-bar {
        flex-direction: column;
        align-items: flex-start;
    }
}

@media (prefers-reduced-motion: reduce) {
    .gd-photos :deep(.content-photo-cell img) {
        transition: none;
    }

    .gd-photos :deep(.content-photo-cell) {
        animation: none;
    }

}
</style>
