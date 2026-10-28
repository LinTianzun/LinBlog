<template>
    <yk-modal :model-value="open" :title="item?.title || '图库详情'" size="xl" :show-footer="false" :closeable="true"
        @update:model-value="handleVisibleChange">
        <div v-if="item" class="gallery-detail">
            <!-- 遮罩盖住首次加载时点赞图标/计数的跳变 -->
            <div v-if="detailLoading" class="detail-loading" aria-live="polite">
                <yk-spinner size="m" />
            </div>
            <div class="detail-meta">
                <span v-if="item.subsetName" class="meta-chip">{{ item.subsetName }}</span>
                <time>{{ formatDate(item.publishedAt || item.createdAt) }}</time>
                <span><IconEyeOutline />{{ views }}</span>
                <button type="button" class="meta-like" :class="{ liked: likeState.liked, busy: likeBusy }"
                    :disabled="likeBusy || likePending" :title="canInteract ? '喜欢 / 取消喜欢' : '登录后即可喜欢'"
                    @click="handleLike">
                    <!-- 状态未就绪时先不渲染图标，避免「未点赞→已点赞」的图标跳变 -->
                    <template v-if="!likePending">
                        <IconLikeFill v-if="likeState.liked" />
                        <IconLikeOutline v-else />
                    </template>
                    {{ likeState.likes }}
                </button>
                <span><IconCameraOutline />{{ images.length }} 张</span>
            </div>
            <div class="gallery-grid">
                <yk-image-preview-group :src-list="images" width="100%" height="200" fit="cover" />
            </div>
            <p v-if="item.introduce" class="gallery-introduce">{{ item.introduce }}</p>

            <!-- 评论区：与文章/随笔详情共用同一套两级评论组件 -->
            <PortalCommentSection
                target-type="article"
                :target-id="item?.id ?? null"
                @comments-change="onCommentsChange"
                @need-login="goLogin" />
        </div>
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

// 图库是 article 表里 classify=image 的行，直接复用文章的点赞/评论接口
// 评论区最新总数，用于点赞后回写列表卡片
const commentTotal = ref(0)
const detailLoading = ref(false)

const likeState = ref<LikeState>({ liked: false, likes: 0 })
const likeBusy = ref(false)
// 点赞状态加载中：此期间不渲染图标，避免打开弹窗时图标与计数跳变
const likePending = ref(false)

const router = useRouter()
const proxy = getCurrentInstance()?.proxy

// 登录态判断：有 token 且不是 visitor 角色才允许互动。
// 弹窗每次打开都重新读取，避免登录后返回门户仍沿用挂载时的游客状态。
const readCanInteract = () => {
    const token = localStorage.getItem('token')
    if (!token) return false
    try {
        const saved = localStorage.getItem('userInfo')
        const user = saved ? JSON.parse(saved) as { user_type?: string } : null
        return user?.user_type !== 'visitor'
    } catch {
        return false
    }
}

const canInteract = ref(readCanInteract())

const handleVisibleChange = (value: boolean) => {
    if (!value) emit('close')
}

const formatDate = (value?: string | null) => {
    const date = new Date(value || '')
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN')
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

// 监听稳定的字符串键而非 [open, id] 数组：数组每次都是新引用，
// 父组件任何一次重渲染（如浏览量回写）都会误触发整套加载流程，导致图标反复重建闪烁
const loadKey = computed(() => (props.open && props.item?.id ? `${props.item.id}` : ''))

watch(loadKey, async (key, previousKey) => {
    if (key === previousKey) return

    if (!key) {
        commentTotal.value = 0
        detailLoading.value = false
        likePending.value = false
        return
    }

    const galleryId = Number(key)
    if (!Number.isFinite(galleryId)) return

    detailLoading.value = true
    canInteract.value = readCanInteract()
    // 计数先用列表数据兜底避免闪成 0；图标等真实状态返回后再渲染
    likePending.value = true
    likeState.value = { liked: false, likes: props.item?.likes ?? 0 }
    views.value = props.item?.views ?? 0
    // 评论由 PortalCommentSection 自己按 targetId 加载
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
    gap: 16px;

    // 加载期间内容半透明，遮罩居中显示 spinner
    &:has(.detail-loading) > :not(.detail-loading) {
        opacity: 0.45;
    }
}

.detail-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
}

.detail-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid @line-color-s;
    color: @font-color-s;
    font-size: @size-s;

    .meta-chip {
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }

    span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
}

// yk-image-preview-group 内部是 flex 容器，这里覆盖为网格，保证缩略图等宽换行
// 该组件根节点是 Fragment，外部 class 不会落到 yk-space 上，需用 :deep 定位
.gallery-grid {
    :deep(.yk-space) {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        width: 100%;
    }

    :deep(.yk-image) {
        width: 100% !important;
    }
}

.gallery-introduce {
    margin: 0;
    font-size: @size-s;
    line-height: 1.8;
    color: @font-color-s;
}

// 点赞按钮：与只读 meta 并排，但保留可点击的视觉反馈
.meta-like {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: @font-color-s;
    font-size: @size-s;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;

    &:hover:not(:disabled) {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.liked {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;
    }

    &.busy,
    &:disabled {
        cursor: progress;
        opacity: 0.7;
    }
}

// 评论区：与上方图片区同宽，用边界线区分内容
@media (max-width: 640px) {
    .gallery-grid :deep(.yk-space) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
