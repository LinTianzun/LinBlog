<template>
    <yk-modal :model-value="open" :title="item?.title || '随笔详情'" size="l" :show-footer="false" :closeable="true"
        @update:model-value="handleVisibleChange">
        <div v-if="item" class="diary-detail">
            <!-- 遮罩盖住首次加载时点赞图标/计数的跳变 -->
            <div v-if="detailLoading" class="detail-loading" aria-live="polite">
                <yk-spinner size="m" />
            </div>
            <div class="detail-meta">
                <span v-if="weatherName" class="meta-weather">
                    <img v-if="weatherIcon" :src="weatherIcon" :alt="weatherName" />
                    {{ weatherName }}
                </span>
                <time>{{ formatDate(item.createdAt) }}</time>
                <span><IconEyeOutline />{{ views }}</span>
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
            </div>
            <p class="diary-text">{{ item.content }}</p>
            <div v-if="item.picture.length" class="diary-images">
                <yk-image-preview-group :src-list="item.picture" width="100%" height="180" fit="cover" />
            </div>

            <div class="comment-section">
                <div class="section-title">
                    评论
                    <yk-tag type="primary">{{ commentTotal }} 条</yk-tag>
                </div>

                <div class="comment-compose">
                    <yk-text-area v-model="commentDraft" :max-length="512" show-word-limit
                        :auto-size="{ minRows: 3, maxRows: 6 }"
                        :placeholder="canInteract ? '说点什么…' : '登录后即可发表评论'" :disabled="!canInteract"
                        @keydown.ctrl.enter="submitComment" />
                    <div class="compose-actions">
                        <span class="compose-hint">
                            {{ canInteract ? 'Ctrl + Enter 快速发送' : '当前为访客，登录后可评论' }}
                        </span>
                        <yk-button v-if="canInteract" type="primary" size="s" :loading="commentSubmitting"
                            :disabled="!commentDraft.trim()" @click="submitComment">
                            发表评论
                        </yk-button>
                        <yk-button v-else type="primary" size="s" @click="goLogin">
                            登录后评论
                        </yk-button>
                    </div>
                    <p v-if="commentError" class="compose-error">{{ commentError }}</p>
                </div>

                <div v-if="!comments.length" class="empty-comments">还没有评论，来抢沙发吧。</div>
                <div v-for="comment in comments" :key="comment.id" class="comment-item">
                    <yk-avatar :size="36" :img-url="comment.userAvatar || undefined" />
                    <div class="comment-main">
                        <div class="comment-head">
                            <span class="comment-user">{{ comment.userName || '匿名用户' }}</span>
                            <time>{{ formatDateTime(comment.createdAt) }}</time>
                        </div>
                        <p class="comment-content">{{ comment.content }}</p>
                    </div>
                </div>
            </div>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { weathers } from '../../utils/weather'
import type { PortalDiary } from '../../api/portal'
import {
    getDiaryComments,
    getDiaryLikeState,
    toggleDiaryLike,
    createDiaryComment,
    recordView,
    type DiaryComment,
    type LikeState
} from '../../api/portal'

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
const weatherIcon = computed(() =>
    weathers.find(w => w.name === weatherName.value)?.iconUrl || ''
)

// 浏览量本地副本：接口回读后立即刷新
const views = ref(0)

// 随笔点赞/评论：diary 是独立业务表，走 /public/diary/praise|comment
const comments = ref<DiaryComment[]>([])
const commentTotal = ref(0)
const commentDraft = ref('')
const commentSubmitting = ref(false)
const commentError = ref('')
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

const formatDateTime = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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

const loadComments = async (diaryId: number) => {
    try {
        const result = await getDiaryComments(diaryId)
        if (result.code === 200) {
            comments.value = result.data?.list || []
            commentTotal.value = result.data?.total || 0
        }
    } catch {
        // 评论区加载失败不打断正文展示
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

const submitComment = async () => {
    const diaryId = props.item?.id
    const content = commentDraft.value.trim()
    if (!diaryId || !content || commentSubmitting.value) return

    if (!canInteract.value) {
        goLogin()
        return
    }

    commentError.value = ''
    commentSubmitting.value = true
    try {
        const result = await createDiaryComment(diaryId, content)
        if (result.code === 200) {
            commentDraft.value = ''
            await loadComments(diaryId)
            emit('interaction-change', {
                id: diaryId,
                likes: likeState.value.likes,
                // 列表展示的是 diary.comments 冗余计数，按原计数递增，
                // 不能回填只统计当前已加载评论的 commentTotal，否则会跳变。
                comments: Math.max(commentTotal.value, (props.item?.comments ?? 0) + 1)
            })
            proxy?.$message?.({ type: 'success', message: '评论已发表' })
        }
    } catch (error) {
        const message = (error as { response?: { data?: { message?: string } } })
            .response?.data?.message
        commentError.value = message || '评论失败，请稍后重试'
    } finally {
        commentSubmitting.value = false
    }
}

// 监听稳定的字符串键而非 [open, id] 数组：数组每次都是新引用，
// 父组件任何一次重渲染（如浏览量回写）都会误触发整套加载流程，导致图标反复重建闪烁
const loadKey = computed(() => (props.open && props.item?.id ? `${props.item.id}` : ''))

watch(loadKey, async (key, previousKey) => {
    if (key === previousKey) return

    if (!key) {
        comments.value = []
        commentTotal.value = 0
        commentDraft.value = ''
        commentError.value = ''
        detailLoading.value = false
        likePending.value = false
        return
    }

    const diaryId = Number(key)
    if (!Number.isFinite(diaryId)) return

    detailLoading.value = true
    canInteract.value = readCanInteract()
    // 计数先用列表数据兜底避免闪成 0；图标等真实状态返回后再渲染
    likePending.value = true
    likeState.value = { liked: false, likes: props.item?.likes ?? 0 }
    views.value = props.item?.views ?? 0
    await Promise.all([loadComments(diaryId), loadLikeState(diaryId)])
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

.detail-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid @line-color-s;
    color: @font-color-s;
    font-size: @size-s;

    .meta-weather {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 500;

        img {
            width: 16px;
            height: 16px;
        }
    }
}

.diary-text {
    margin: 0;
    font-size: 15px;
    line-height: 2;
    color: @font-color-l;
    white-space: pre-wrap;
    word-break: break-word;
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

// 评论区：与上方正文同宽，用边界线区分内容
.comment-section {
    margin-top: 8px;
    padding-top: 22px;
    border-top: 1px solid @line-color-s;

    .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        font-size: 15px;
        font-weight: 600;
        color: @font-color-l;
    }

    .empty-comments {
        padding: 18px 0;
        color: @font-color-s;
        font-size: @size-s;
    }
}

.comment-compose {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
}

.compose-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.compose-hint {
    font-size: @size-ss;
    color: @font-color-s;
}

.compose-error {
    margin: 0;
    font-size: @size-ss;
    color: @ecolor;
}

.comment-item {
    display: flex;
    gap: 12px;
    padding: 12px 0;

    & + .comment-item {
        border-top: 1px solid @line-color-s;
    }

    .comment-main {
        flex: 1;
        min-width: 0;
    }

    .comment-head {
        display: flex;
        align-items: baseline;
        gap: 10px;

        .comment-user {
            font-weight: 600;
            color: @font-color-l;
        }

        time {
            font-size: @size-ss;
            color: @font-color-s;
        }
    }

    .comment-content {
        margin: 4px 0 0;
        color: @font-color-m;
        line-height: 1.7;
        word-break: break-word;
    }
}

.diary-images {
    // yk-image-preview-group 的根节点是 Fragment，外部 class 不会落到 yk-space 上，
    // 因此这里用 wrapper + :deep 覆盖内部布局
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

@media (max-width: 640px) {
    .diary-images :deep(.yk-space) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
