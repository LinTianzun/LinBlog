<template>
    <yk-modal :model-value="open" :title="item?.title || '随笔详情'" size="l" :show-footer="false" :closeable="true"
        @update:model-value="handleVisibleChange">
        <div v-if="item" class="diary-detail">
            <!-- 遮罩盖住首次加载时点赞图标/计数的跳变 -->
            <div v-if="detailLoading" class="detail-loading" aria-live="polite">
                <yk-spinner size="m" />
            </div>
            <!-- 与后台随笔详情共用纯文字头部：标题 + 天气/日期标签 -->
            <ContentDetailHero :title="item.title" variant="plain" :badges="heroBadges" />
            <!-- 与后台随笔详情共用统计条，点赞按钮走插槽 -->
            <ContentStatBar :views="views" :comments="commentTotal"
                :meta-text="formatDate(item.createdAt)" :meta-chips="metaChips">
                <template #like>
                    <button type="button" class="meta-like" :class="{ liked: likeState.liked, busy: likeBusy }"
                        :disabled="likeBusy || likePending" :title="canInteract ? '点赞 / 取消点赞' : '登录后可点赞'"
                        @click="handleLike">
                        <!-- 状态未就绪时先不渲染图标，避免「未点赞→已点赞」的图标跳变 -->
                        <template v-if="!likePending">
                            <IconLikeFill v-if="likeState.liked" />
                            <IconLikeOutline v-else />
                        </template>
                        {{ likeState.likes }}
                    </button>
                </template>
                <template #actions>
                    <PortalShareButton :url="shareUrl" :title="item?.title" :text="shareText" />
                </template>
            </ContentStatBar>
            <p class="diary-text">{{ item.content }}</p>
            <!-- 与后台随笔详情共用图片网格，点击进灯箱 -->
            <ContentPhotoGrid v-if="item.picture.length" :photos="item.picture" layout="strip"
                @preview="openLightbox" />

            <!-- 评论区：与文章/图库详情共用同一套两级评论组件 -->
            <PortalCommentSection
                target-type="diary"
                :target-id="item?.id ?? null"
                @comments-change="onCommentsChange"
                @need-login="goLogin" />
        </div>

        <!-- 灯箱：与后台随笔/图库共用同一个组件 -->
        <ContentLightbox :open="lightbox.open" :photos="item?.picture || []" :index="lightbox.index"
            :title="item?.title" @close="closeLightbox" @update:index="lightbox.index = $event" />
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { weathers } from '../../utils/weather'
import type { PortalDiary } from '../../api/portal'
import {
    getDiaryLikeState,
    toggleDiaryLike,
    recordView,
    type LikeState
} from '../../api/portal'
import PortalCommentSection from './PortalCommentSection.vue'
import { useSessionStore } from '../../store/session.ts'
import ContentDetailHero from '../content/ContentDetailHero.vue'
import ContentStatBar from '../content/ContentStatBar.vue'
import ContentPhotoGrid from '../content/ContentPhotoGrid.vue'
import ContentLightbox from '../content/ContentLightbox.vue'
import PortalShareButton from './PortalShareButton.vue'
import { plainText, portalItemUrl } from '../../utils/portalSeo'

const props = defineProps<{
    open: boolean
    item: PortalDiary | null
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'view-counted', payload: { id: number; views: number }): void
    (e: 'interaction-change', payload: { id: number; likes: number; comments: number }): void
}>()

const weatherName = computed(() => props.item?.weatherName || '')
const shareUrl = computed(() =>
    props.item?.id ? portalItemUrl('diary', props.item.id) : ''
)
const shareText = computed(() => plainText(props.item?.content))
const weatherIcon = computed(() =>
    weathers.find(w => w.name === weatherName.value)?.iconUrl || ''
)

// 统计条左侧：天气与标题，天气带图标语义但不塞进组件内部
const metaChips = computed(() => {
    const chips: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning'; icon?: string }[] = []
    if (weatherName.value) {
        chips.push({ text: weatherName.value, tone: 'accent', icon: weatherIcon.value || undefined })
    }
    return chips
})

// 头部与后台随笔详情共用同一组标签语义：天气、日期
const heroBadges = computed(() => {
    const badges: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning'; icon?: string }[] = []
    if (weatherName.value) {
        badges.push({ text: weatherName.value, tone: 'accent', icon: weatherIcon.value || undefined })
    }
    const date = formatDate(props.item?.createdAt || '')
    if (date) badges.push({ text: date, tone: 'plain' })
    return badges
})

// 灯箱：与后台随笔/图库共用
const lightbox = ref({ open: false, index: 0 })
const openLightbox = (index: number): void => {
    lightbox.value = { open: true, index }
}
const closeLightbox = (): void => {
    lightbox.value.open = false
}

// 浏览量本地副本：接口回读后立即刷新
const views = ref(0)

// 随笔点赞/评论：diary 是独立业务表，走 /public/diary/praise|comment
// 评论区最新总数，用于点赞后回写列表卡片
const commentTotal = ref(0)
const detailLoading = ref(false)

const likeState = ref<LikeState>({ liked: false, likes: 0 })
const likeBusy = ref(false)
// 点赞状态加载中：此期间不渲染图标，避免打开弹窗时图标与计数跳变
const likePending = ref(false)

const router = useRouter()
const proxy = getCurrentInstance()?.proxy
const session = useSessionStore()

// 点赞能力按 comment.like 权限判定，游客角色默认没有该权限
const canInteract = computed(
    () => Boolean(localStorage.getItem('token')) && session.can('comment.like')
)

const handleVisibleChange = (value: boolean) => {
    if (!value) emit('close')
}

// 打开随笔即计一次浏览；后端按访客去重，失败不影响正文展示
const countView = async (diaryId: number) => {
    try {
        const result = await recordView('diary', diaryId)
        if (result.code === 200 && result.data) {
            views.value = result.data.views
            emit('view-counted', { id: diaryId, views: result.data.views })
        }
    } catch {
        // 浏览计数失败时保持列表原有数字
    }
}

const loadLikeState = async (diaryId: number) => {
    try {
        const result = await getDiaryLikeState(diaryId)
        if (result.code === 200 && result.data) {
            likeState.value = result.data
        }
    } catch {
        // 点赞状态失败时回退到随笔自带的 likes 字段
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
    const diaryId = props.item?.id
    if (!diaryId || likeBusy.value) return

    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可点赞' })
        return
    }

    likeBusy.value = true
    try {
        const result = await toggleDiaryLike(diaryId)
        if (result.code === 200 && result.data) {
            likeState.value = result.data
            emit('interaction-change', {
                id: diaryId,
                likes: result.data.likes,
                comments: commentTotal.value
            })
        }
    } catch (error) {
        const message = (error as { response?: { data?: { message?: string } } })
            .response?.data?.message
        proxy?.$message?.({ type: 'error', message: message || '点赞失败，请稍后重试' })
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

    const diaryId = Number(key)
    if (!Number.isFinite(diaryId)) return

    detailLoading.value = true
    // 计数先用列表数据兜底避免闪成 0；图标等真实状态返回后再渲染
    likePending.value = true
    likeState.value = { liked: false, likes: props.item?.likes ?? 0 }
    views.value = props.item?.views ?? 0
    // 评论由 PortalCommentSection 自己按 targetId 加载
    await loadLikeState(diaryId)
    likePending.value = false
    await countView(diaryId)
    detailLoading.value = false
}, { immediate: true })

const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<style lang="less" scoped>
.diary-detail {
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

.diary-text {
    margin: 0;
    font-size: 15px;
    line-height: 2;
    color: @font-color-l;
    white-space: pre-wrap;
    word-break: break-word;
}

// 标题与正文之间留一档间距，与后台随笔的排版节奏一致
.diary-detail > :deep(.content-detail-hero) {
    padding-bottom: 4px;
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

</style>
