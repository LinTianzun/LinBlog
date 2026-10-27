<template>
    <yk-modal :model-value="open" :title="article?.title || '文章详情'" size="xl" :show-footer="false" :closeable="true"
        @update:model-value="handleVisibleChange">
        <div v-if="article" class="detail-content" :class="{ loading: detailLoading }">
            <div v-if="detailLoading" class="detail-loading" aria-live="polite">
                <yk-spinner size="m" />
            </div>
            <div class="detail-meta">
                <span v-if="article.subsetName" class="meta-chip">{{ article.subsetName }}</span>
                <time>{{ formatArticleDate(article.publishedAt || article.createdAt) }}</time>
                <span><IconEyeOutline />{{ views }}</span>
                <button type="button" class="meta-like" :class="{ liked: likeState.liked, busy: likeBusy }"
                    :disabled="likeBusy || likePending"
                    :title="canInteract ? '点赞 / 取消点赞' : '登录后可点赞'"
                    @click="handleLike">
                    <!-- 状态未就绪时先不渲染图标，避免「未点赞→已点赞」的图标跳变 -->
                    <template v-if="!likePending">
                        <IconLikeFill v-if="likeState.liked" />
                        <IconLikeOutline v-else />
                    </template>
                    {{ likeState.likes }}
                </button>
            </div>
            <img v-if="article.cover" class="detail-cover" :src="article.cover" :alt="article.cover" />
            <div class="detail-html" v-html="article.content"></div>

            <div class="comment-section">
                <div class="section-title">
                    评论
                    <yk-tag type="primary">{{ commentTotal }} 条</yk-tag>
                </div>

                <!-- 发表评论：登录后可用，游客点击直接引导登录 -->
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
import { formatArticleDate, type ArticleItem } from '../../api/article'
import {
    getPublicComments,
    getLikeState,
    toggleLike,
    createPublicComment,
    recordView,
    type PortalComment,
    type LikeState
} from '../../api/portal'

const props = defineProps<{
    open: boolean
    article: ArticleItem | null
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'interaction-change', payload: { likes: number; comments: number }): void
    (e: 'view-counted', payload: { views: number }): void
}>()
const comments = ref<PortalComment[]>([])
const commentTotal = ref(0)
const commentDraft = ref('')
const commentSubmitting = ref(false)
const detailLoading = ref(false)
const commentError = ref('')

const likeState = ref<LikeState>({ liked: false, likes: 0 })
const likeBusy = ref(false)
// 点赞状态加载中：此期间不渲染图标，避免打开弹窗时图标与计数跳变
const likePending = ref(false)

// 浏览量本地副本：接口回读后立即刷新，避免列表与弹窗数字不一致
const views = ref(0)

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

const loadComments = async (articleId: number) => {
    try {
        const result = await getPublicComments(articleId)
        if (result.code === 200) {
            comments.value = result.data?.list || []
            commentTotal.value = result.data?.total || 0
        }
    } catch {
        // 评论区加载失败不打断正文展示
    }
}

const loadLikeState = async (articleId: number) => {
    try {
        const result = await getLikeState(articleId)
        if (result.code === 200 && result.data) {
            likeState.value = result.data
        }
    } catch {
        // 点赞状态失败时回退到文章自带的 likes 字段
    }
}

// 打开详情即计一次浏览；后端按访客去重，失败不影响正文展示
const countView = async (articleId: number) => {
    try {
        const result = await recordView('article', articleId)
        if (result.code === 200 && result.data) {
            views.value = result.data.views
            emit('view-counted', { views: result.data.views })
        }
    } catch {
        // 浏览计数失败时保持列表原有数字
    }
}

const goLogin = () => {
    emit('close')
    void router.push('/loginRegister')
}

const handleLike = async () => {
    const articleId = props.article?.id
    if (!articleId || likeBusy.value) return

    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可点赞' })
        return
    }

    likeBusy.value = true
    try {
        const result = await toggleLike(articleId)
        if (result.code === 200 && result.data) {
            likeState.value = result.data
            emit('interaction-change', {
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
    const articleId = props.article?.id
    const content = commentDraft.value.trim()
    if (!articleId || !content || commentSubmitting.value) return

    if (!canInteract.value) {
        goLogin()
        return
    }

    commentError.value = ''
    commentSubmitting.value = true
    try {
        const result = await createPublicComment({ articleId, content })
        if (result.code === 200) {
            commentDraft.value = ''
            await loadComments(articleId)
            emit('interaction-change', {
                likes: likeState.value.likes,
                // 列表展示的是 article.comments 冗余计数，按文章原计数递增，
                // 不能回填只统计当前已加载评论的 commentTotal，否则会跳变。
                comments: Math.max(commentTotal.value, (props.article?.comments ?? 0) + 1)
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
const loadKey = computed(() => (props.open && props.article?.id ? `${props.article.id}` : ''))

watch(loadKey, async (key, previousKey) => {
    // 同一个 key 不再重复加载，避免父组件更新引起的抖动
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

    const articleId = Number(key)
    if (!Number.isFinite(articleId)) return

    {
        // modal 打开期间加载评论/点赞态，用遮罩盖住加载中的跳变
        detailLoading.value = true
        canInteract.value = readCanInteract()
        // 计数先用列表数据兜底避免闪成 0；图标等真实状态返回后再渲染，
        // 否则会先显示「未点赞」再跳成「已点赞」，看起来像在闪烁
        likePending.value = true
        likeState.value = {
            liked: false,
            likes: props.article?.likes ?? 0
        }
        views.value = props.article?.views ?? 0
        await Promise.all([loadComments(articleId), loadLikeState(articleId)])
        likePending.value = false
        await countView(articleId)
        detailLoading.value = false
    }
}, { immediate: true })
</script>

<style lang="less" scoped>
.detail-content {
    // 滚动交给 yk-modal 自身的 scrollbar，避免嵌套双滚动条
    padding-right: 4px;
}

.detail-content.loading {
    position: relative;
    min-height: 120px;
    // 加载期间内容半透明，遮罩居中显示 spinner
    & > :not(.detail-loading) {
        opacity: 0.45;
        transition: opacity 0.15s ease;
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
    padding-bottom: 14px;
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

.detail-cover {
    width: 100%;
    // 详情封面限高，避免长图撑满整个弹窗挤走正文
    max-height: 220px;
    object-fit: cover;
    border-radius: 12px;
    margin-bottom: 18px;
}

.detail-html {
    font-size: 15px;
    line-height: 1.85;
    color: @font-color-l;
    word-break: break-word;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
        margin: 1.6em 0 0.6em;
        font-family: var(--portal-serif);
        font-weight: 600;
        line-height: 1.4;
        color: @font-color-l;

        &:first-child {
            margin-top: 0;
        }
    }

    :deep(h1) {
        font-size: 24px;
    }

    :deep(h2) {
        font-size: 21px;
    }

    :deep(h3) {
        font-size: 18px;
    }

    :deep(p) {
        margin: 0 0 1em;
    }

    :deep(a) {
        color: @pcolor;
    }

    :deep(blockquote) {
        margin: 1.2em 0;
        padding: 4px 0 4px 16px;
        border-left: 3px solid @pcolor;
        color: @font-color-m;
    }

    :deep(code) {
        padding: 2px 5px;
        border-radius: 3px;
        background: @bg-color-s;
        font-size: 0.92em;
    }

    :deep(img) {
        max-width: 100%;
        // 正文图限高并裁切，避免长图/大图占满整屏打断阅读流
        max-height: 320px;
        height: auto;
        object-fit: contain;
        border-radius: 8px;
        cursor: zoom-in;
    }

    :deep(pre) {
        padding: 12px;
        border-radius: 8px;
        background: @bg-color-s;
        overflow-x: auto;

        code {
            padding: 0;
            background: transparent;
        }
    }
}

.comment-section {
    margin-top: 28px;
    padding-top: 18px;
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

// 发表评论
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
</style>
