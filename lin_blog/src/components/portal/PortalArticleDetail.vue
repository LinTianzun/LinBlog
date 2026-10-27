<template>
    <yk-modal :model-value="open" title="文章阅读" size="l" :show-footer="false" :closeable="true"
        content-height="calc(100vh - 148px)" @update:model-value="handleVisibleChange">
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
            <!-- 头图：宽幅卡片居中，不再整条铺满弹窗 -->
            <figure v-if="article.cover" class="detail-cover-figure">
                <img class="detail-cover" :src="article.cover" :alt="article.cover" />
            </figure>
            <!-- 正文：独立阅读区，行宽收窄，图片改为居中卡片 -->
            <article class="detail-reader">
                <header v-if="article.introduce" class="detail-intro">
                    <p class="detail-intro-text">{{ article.introduce }}</p>
                </header>
                <div class="detail-html" v-html="article.content"></div>
            </article>

            <div class="comment-section">
                <div class="section-title">
                    评论
                    <span class="comment-count">{{ commentTotal }}</span>
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

                <div v-if="!threads.length" class="empty-comments">还没有评论，来抢沙发吧。</div>

                <div v-else class="comment-list">
                    <div v-for="thread in threads" :key="thread.root.id" class="comment-thread">
                        <yk-avatar :size="36" :img-url="thread.root.userAvatar || undefined"
                            class="comment-avatar" />
                        <div class="comment-main">
                            <div class="comment-head">
                                <span class="comment-user">{{ thread.root.userName || '匿名用户' }}</span>
                                <div class="comment-head-right">
                                    <time>{{ formatDateTime(thread.root.createdAt) }}</time>
                                    <button type="button" class="comment-like"
                                        :class="{ liked: thread.root.liked, busy: isCommentLikeBusy(thread.root.id) }"
                                        :disabled="isCommentLikeBusy(thread.root.id)"
                                        :title="canInteract ? '点赞 / 取消点赞' : '登录后可点赞'"
                                        @click="handleCommentLike(thread.root)">
                                        <IconLikeFill v-if="thread.root.liked" />
                                        <IconLikeOutline v-else />
                                        {{ thread.root.likes }}
                                    </button>
                                </div>
                            </div>
                            <p class="comment-content">{{ thread.root.content }}</p>

                            <div class="comment-actions">
                                <div class="comment-action-left">
                                    <button type="button" class="comment-reply-btn"
                                        @click="startReply(thread.root, thread.root)">
                                        <IconCommentOutline />回复
                                    </button>
                                    <button v-if="thread.replies.length" type="button" class="reply-toggle"
                                        @click="toggleReplies(thread.root.id)">
                                        <template v-if="isExpanded(thread.root.id)">
                                            <IconUpOutline />收起回复
                                        </template>
                                        <template v-else>
                                            <IconDownOutline />展开 {{ thread.replies.length }} 条回复
                                        </template>
                                    </button>
                                </div>

                                <yk-popover :open="activeCommentMenu === thread.root.id" trigger="click"
                                    placement="bottomRight" :arrow="false"
                                    overlay-class="comment-action-popover"
                                    @update:open="(open: boolean) => setCommentMenu(thread.root.id, open)">
                                    <button type="button" class="comment-more" title="更多操作"
                                        aria-label="更多操作">
                                        <IconMoreOutline />
                                    </button>
                                    <template #popover>
                                        <div class="comment-menu">
                                            <button type="button" @click="handleReport(thread.root)">
                                                <IconWarningOutline />举报
                                            </button>
                                        </div>
                                    </template>
                                </yk-popover>
                            </div>

                            <div v-if="replyTarget?.commentId === thread.root.id" class="inline-reply-compose">
                                <div class="inline-reply-title">
                                    回复 <strong>{{ replyTarget.targetUserName }}</strong>
                                </div>
                                <yk-text-area v-model="replyDraft" :max-length="512" show-word-limit
                                    :auto-size="{ minRows: 2, maxRows: 5 }"
                                    placeholder="写下你的回复…" @keydown.ctrl.enter="submitReply" />
                                <div class="inline-reply-actions">
                                    <span class="compose-hint">Ctrl + Enter 快速发送</span>
                                    <div class="inline-reply-buttons">
                                        <yk-button size="s" @click="cancelReply">取消</yk-button>
                                        <yk-button type="primary" size="s" :loading="replySubmitting"
                                            :disabled="!replyDraft.trim()" @click="submitReply">
                                            发表回复
                                        </yk-button>
                                    </div>
                                </div>
                                <p v-if="replyError" class="compose-error">{{ replyError }}</p>
                            </div>

                            <div v-if="thread.replies.length && isExpanded(thread.root.id)"
                                class="reply-list">
                                <div v-for="reply in thread.replies" :key="reply.id" class="reply-item">
                                    <yk-avatar :size="26" :img-url="reply.userAvatar || undefined" />
                                    <div class="reply-body">
                                        <div class="comment-head">
                                            <div class="comment-author-line">
                                                <span class="comment-user">{{ reply.userName || '匿名用户' }}</span>
                                                <span class="reply-to">
                                                    回复 {{ reply.replyToUserName || thread.root.userName || '该用户' }}
                                                </span>
                                            </div>
                                            <div class="comment-head-right">
                                                <time>{{ formatDateTime(reply.createdAt) }}</time>
                                                <button type="button" class="comment-like"
                                                    :class="{ liked: reply.liked, busy: isCommentLikeBusy(reply.id) }"
                                                    :disabled="isCommentLikeBusy(reply.id)"
                                                    :title="canInteract ? '点赞 / 取消点赞' : '登录后可点赞'"
                                                    @click="handleCommentLike(reply)">
                                                    <IconLikeFill v-if="reply.liked" />
                                                    <IconLikeOutline v-else />
                                                    {{ reply.likes }}
                                                </button>
                                            </div>
                                        </div>
                                        <p class="comment-content">{{ reply.content }}</p>
                                        <div class="comment-actions is-reply">
                                            <button type="button" class="comment-reply-btn"
                                                @click="startReply(reply, thread.root)">
                                                <IconCommentOutline />回复
                                            </button>
                                            <yk-popover :open="activeCommentMenu === reply.id"
                                                trigger="click" placement="bottomRight" :arrow="false"
                                                overlay-class="comment-action-popover"
                                                @update:open="(open: boolean) => setCommentMenu(reply.id, open)">
                                                <button type="button" class="comment-more" title="更多操作"
                                                    aria-label="更多操作">
                                                    <IconMoreOutline />
                                                </button>
                                                <template #popover>
                                                    <div class="comment-menu">
                                                        <button type="button" @click="handleReport(reply)">
                                                            <IconWarningOutline />举报
                                                        </button>
                                                    </div>
                                                </template>
                                            </yk-popover>
                                        </div>
                                        <div v-if="replyTarget?.commentId === reply.id"
                                            class="inline-reply-compose is-nested">
                                            <div class="inline-reply-title">
                                                回复 <strong>{{ replyTarget.targetUserName }}</strong>
                                            </div>
                                            <yk-text-area v-model="replyDraft" :max-length="512"
                                                show-word-limit :auto-size="{ minRows: 2, maxRows: 5 }"
                                                placeholder="写下你的回复…" @keydown.ctrl.enter="submitReply" />
                                            <div class="inline-reply-actions">
                                                <span class="compose-hint">Ctrl + Enter 快速发送</span>
                                                <div class="inline-reply-buttons">
                                                    <yk-button size="s" @click="cancelReply">取消</yk-button>
                                                    <yk-button type="primary" size="s"
                                                        :loading="replySubmitting"
                                                        :disabled="!replyDraft.trim()"
                                                        @click="submitReply">
                                                        发表回复
                                                    </yk-button>
                                                </div>
                                            </div>
                                            <p v-if="replyError" class="compose-error">{{ replyError }}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
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
import {
    getRequestErrorMessage,
    reportComment,
    toggleCommentLike
} from '../../api/comment'

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
// 二级评论默认收起，按一级评论 ID 记录展开状态
const expandedThreads = ref<Set<number>>(new Set())
const activeCommentMenu = ref<number | null>(null)
const commentLikeBusyIds = ref<Set<number>>(new Set())

type ReplyTarget = {
    commentId: number
    rootId: number
    targetUserName: string
}

type CommentThread = {
    root: PortalComment
    replies: PortalComment[]
}

// 一级评论按时间倒序，二级回复按时间正序挂在所属评论下
const threads = computed<CommentThread[]>(() => {
    const roots = comments.value.filter(item => !item.parentId)
    const replies = comments.value.filter(item => item.parentId)

    return roots
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(root => ({
            root,
            replies: replies
                .filter(reply => Number(reply.parentId) === Number(root.id))
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        }))
})

const isExpanded = (commentId: number) => expandedThreads.value.has(commentId)

const toggleReplies = (commentId: number) => {
    // 直接改 Set 不会触发更新，这里复制一份再赋值
    const next = new Set(expandedThreads.value)
    if (next.has(commentId)) next.delete(commentId)
    else next.add(commentId)
    expandedThreads.value = next
}
const commentTotal = ref(0)
const commentDraft = ref('')
const commentSubmitting = ref(false)
const replyTarget = ref<ReplyTarget | null>(null)
const replyDraft = ref('')
const replySubmitting = ref(false)
const replyError = ref('')
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
    try {
        const saved = localStorage.getItem('userInfo')
        const user = saved ? JSON.parse(saved) as { user_type?: string } : null
        return Boolean(token && user?.user_type !== 'visitor')
    } catch {
        return false
    }
}

const canInteract = ref(readCanInteract())

const isCommentLikeBusy = (commentId: number) => commentLikeBusyIds.value.has(commentId)

const setCommentLikeBusy = (commentId: number, busy: boolean) => {
    const next = new Set(commentLikeBusyIds.value)
    if (busy) next.add(commentId)
    else next.delete(commentId)
    commentLikeBusyIds.value = next
}

const setCommentMenu = (commentId: number, open: boolean) => {
    if (open) {
        activeCommentMenu.value = commentId
        return
    }
    if (activeCommentMenu.value === commentId) {
        activeCommentMenu.value = null
    }
}

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
        // 一页 50 条是接口上限，门户详情一次取满，避免二级回复被分页截断
        const result = await getPublicComments(articleId, 1, 50)
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

const handleCommentLike = async (comment: PortalComment) => {
    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可点赞评论' })
        return
    }
    if (isCommentLikeBusy(comment.id)) return

    setCommentLikeBusy(comment.id, true)
    try {
        const result = await toggleCommentLike({
            commentType: 'article',
            commentId: comment.id
        })
        if (result.code === 200 && result.data) {
            comment.liked = result.data.liked
            comment.likes = result.data.likes
        }
    } catch (error) {
        proxy?.$message?.({
            type: 'error',
            message: getRequestErrorMessage(error, '点赞评论失败，请稍后重试')
        })
    } finally {
        setCommentLikeBusy(comment.id, false)
    }
}

const handleReport = async (comment: PortalComment) => {
    activeCommentMenu.value = null
    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可举报评论' })
        return
    }

    try {
        const result = await reportComment({
            commentType: 'article',
            commentId: comment.id
        })
        if (result.code === 200 && result.data) {
            comment.complaint = result.data.complaint
            proxy?.$message?.({
                type: result.data.already ? 'primary' : 'success',
                message: result.message || (result.data.already ? '你已举报过该评论' : '举报成功')
            })
        }
    } catch (error) {
        proxy?.$message?.({
            type: 'error',
            message: getRequestErrorMessage(error, '举报评论失败，请稍后重试')
        })
    }
}

const startReply = (target: PortalComment, root: PortalComment) => {
    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可回复评论' })
        return
    }
    activeCommentMenu.value = null
    replyTarget.value = {
        commentId: Number(target.id),
        rootId: Number(root.id),
        targetUserName: target.userName || '该用户'
    }
    replyDraft.value = ''
    replyError.value = ''
    // 回复二级评论时自动展开当前线程，避免输入框被收起状态隐藏
    const next = new Set(expandedThreads.value)
    next.add(Number(root.id))
    expandedThreads.value = next
}

const cancelReply = () => {
    replyTarget.value = null
    replyDraft.value = ''
    replyError.value = ''
}

const submitReply = async () => {
    const articleId = props.article?.id
    const target = replyTarget.value
    const content = replyDraft.value.trim()
    if (!articleId || !target || !content || replySubmitting.value) return

    if (!canInteract.value) {
        goLogin()
        return
    }

    replyError.value = ''
    replySubmitting.value = true
    try {
        // parentId 指向用户实际点击的评论；后端会归一化到根评论，
        // 数据库仍保持两级结构，并记录实际回复目标。
        const result = await createPublicComment({
            articleId,
            content,
            parentId: target.commentId
        })
        if (result.code === 200) {
            const rootId = target.rootId
            replyTarget.value = null
            replyDraft.value = ''
            await loadComments(articleId)
            const next = new Set(expandedThreads.value)
            next.add(rootId)
            expandedThreads.value = next
            emit('interaction-change', {
                likes: likeState.value.likes,
                comments: Math.max(commentTotal.value, (props.article?.comments ?? 0) + 1)
            })
            proxy?.$message?.({ type: 'success', message: '回复已发表' })
        }
    } catch (error) {
        replyError.value = getRequestErrorMessage(error, '回复失败，请稍后重试')
    } finally {
        replySubmitting.value = false
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
        expandedThreads.value = new Set()
        activeCommentMenu.value = null
        commentLikeBusyIds.value = new Set()
        replyTarget.value = null
        replyDraft.value = ''
        replyError.value = ''
        replySubmitting.value = false
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
        // 换文章时清空展开状态，避免上一篇的展开记录串到下一篇
        expandedThreads.value = new Set()
        activeCommentMenu.value = null
        commentLikeBusyIds.value = new Set()
        replyTarget.value = null
        replyDraft.value = ''
        replyError.value = ''
        replySubmitting.value = false
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
    padding: 4px 4px 8px;
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

// 元信息条：与正文阅读区同宽居中，视觉上与正文对齐
.detail-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 720px;
    margin: 0 auto;
    padding-bottom: 16px;
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

// 头图：宽幅卡片，居中，四周留白，不再铺满弹窗
.detail-cover-figure {
    margin: 0 auto 30px;
    display: flex;
    justify-content: center;
}

.detail-cover {
    display: block;
    // 头图按 16:9 裁切，最大宽度收窄到阅读区，避免超宽扁平铺开
    width: 100%;
    max-width: 620px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 14px;
    border: 1px solid @line-color-s;
    box-shadow: @shadow-s;
}

// 阅读区：行宽收窄居中，长文阅读节奏更舒适
.detail-reader {
    max-width: 720px;
    margin: 0 auto;
}

// 导语：衬线斜排的引言块，与正文拉开层次
.detail-intro {
    margin: 0 0 24px;
    padding: 0 0 0 18px;
    border-left: 3px solid var(--pcolor);
}

.detail-intro-text {
    margin: 0;
    font-family: var(--portal-serif);
    font-size: 16px;
    line-height: 1.8;
    color: @font-color-m;
}

.detail-html {
    font-size: 15.5px;
    line-height: 1.95;
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

    // 正文图：居中卡片式，不再铺满整行
    :deep(img) {
        display: block;
        // 编辑器保存的内联 width/height 会覆盖 CSS，这里强制兜底
        width: auto !important;
        height: auto !important;
        // 再收一档宽度，让大图以“照片卡片”的形式出现，而不是铺满正文
        max-width: min(88%, 620px) !important;
        // 竖长图限高但不裁切，保持原始比例
        max-height: 380px;
        object-fit: contain;
        margin: 28px auto;
        border-radius: 12px;
        border: 1px solid @line-color-s;
        box-shadow: 0 10px 28px color-mix(in srgb, @font-color-l 10%, transparent);
        cursor: zoom-in;
        transition: transform 0.25s ease, box-shadow 0.25s ease;

        &:hover {
            transform: translateY(-2px);
            box-shadow: @shadow-m;
        }
    }

    // 图床/编辑器常把图片单独包在 p 里，去掉段间距避免图片上下空档过大
    :deep(p:has(> img:only-child)) {
        margin: 0;
    }

    :deep(ul),
    :deep(ol) {
        margin: 0 0 1em;
        padding-left: 1.6em;
    }

    :deep(li) {
        margin: 0.3em 0;
    }

    :deep(hr) {
        margin: 2em auto;
        width: 40%;
        border: none;
        border-top: 1px solid @line-color-s;
    }

    :deep(table) {
        width: 100%;
        margin: 1.4em 0;
        border-collapse: collapse;
        font-size: 0.94em;

        th,
        td {
            padding: 8px 12px;
            border: 1px solid @line-color-s;
            text-align: left;
        }

        th {
            background: @bg-color-s;
            font-weight: 600;
        }
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

// 评论区：与正文阅读区同宽居中
.comment-section {
    max-width: 720px;
    margin: 32px auto 0;
    padding-top: 22px;
    border-top: 1px solid @line-color-s;

    .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        font-family: var(--portal-serif);
        font-size: 16px;
        font-weight: 600;
        color: @font-color-l;
    }

    .comment-count {
        min-width: 20px;
        padding: 0 8px;
        border-radius: 999px;
        background: var(--pcolor1);
        color: @pcolor;
        font-size: 12px;
        font-weight: 600;
        line-height: 20px;
        text-align: center;
    }

    .empty-comments {
        padding: 20px 0;
        color: @font-color-s;
        font-size: @size-s;
    }
}

// 发表评论
.comment-compose {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
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

// 评论列表：用分隔线而不是卡片，阅读节奏更连贯
.comment-list {
    display: flex;
    flex-direction: column;
}

.comment-thread {
    display: flex;
    gap: 12px;
    padding: 16px 0;

    & + & {
        border-top: 1px solid @line-color-s;
    }
}

.comment-main {
    flex: 1;
    min-width: 0;
}

.comment-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;

    .comment-author-line {
        display: flex;
        flex: 1;
        flex-wrap: wrap;
        min-width: 0;
        align-items: baseline;
        gap: 8px;
    }

    .comment-head-right {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 8px;
        margin-left: auto;
    }

    .comment-user {
        font-size: 14px;
        font-weight: 600;
        color: @font-color-l;
    }

    .reply-to {
        font-size: 12px;
        color: @font-color-s;
    }

    time {
        font-size: 12px;
        color: @font-color-s;
        font-variant-numeric: tabular-nums;
    }
}

.comment-like {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: @font-color-s;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;

    .yk-icon {
        width: 13px;
        height: 13px;
    }

    &:hover:not(:disabled) {
        border-color: @pcolor;
        color: @pcolor;
    }

    &.liked {
        border-color: @pcolor;
        background: var(--pcolor1);
        color: @pcolor;
        font-weight: 600;
    }

    &.busy,
    &:disabled {
        cursor: progress;
        opacity: 0.65;
    }
}

.comment-content {
    margin: 6px 0 0;
    font-size: 14.5px;
    line-height: 1.8;
    color: @font-color-m;
    word-break: break-word;
}

.comment-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 24px;
    margin-top: 8px;
}

.comment-action-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}

.comment-reply-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: transparent;
    color: @font-color-s;
    font-size: 12.5px;
    cursor: pointer;
    transition: color 0.2s ease;

    .yk-icon {
        width: 13px;
        height: 13px;
    }

    &:hover {
        color: @pcolor;
    }
}

.inline-reply-compose {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-top: 10px;
    padding: 12px;
    border: 1px solid @line-color-s;
    border-radius: 12px;
    background: @bg-color-s;

    &.is-nested {
        background: color-mix(in srgb, @bg-color-s 72%, #fff 28%);
    }
}

.inline-reply-title {
    color: @font-color-s;
    font-size: 12.5px;

    strong {
        color: @font-color-l;
        font-weight: 600;
    }
}

.inline-reply-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.inline-reply-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

// 展开 / 收起二级评论
.reply-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: @pcolor;
    font-size: 12.5px;
    cursor: pointer;
    transition: opacity 0.2s ease;

    .yk-icon {
        width: 13px;
        height: 13px;
    }

    &:hover {
        opacity: 0.75;
    }
}

.comment-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: @font-color-s;
    cursor: pointer;
    transition: color 0.2s ease, background-color 0.2s ease;

    .yk-icon {
        width: 17px;
        height: 17px;
    }

    &:hover {
        background: @bg-color-s;
        color: @font-color-l;
    }
}

.comment-menu {
    display: flex;
    flex-direction: column;
    min-width: 92px;
    padding: 4px;

    button {
        display: flex;
        align-items: center;
        gap: 7px;
        width: 100%;
        padding: 7px 9px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: @font-color-m;
        font-size: 13px;
        text-align: left;
        white-space: nowrap;
        cursor: pointer;

        .yk-icon {
            width: 14px;
            height: 14px;
        }

        &:hover:not(:disabled) {
            background: @bg-color-s;
            color: @pcolor;
        }

        &.is-danger {
            color: @ecolor;
        }

        &:disabled {
            color: @font-color-s;
            cursor: not-allowed;
            opacity: 0.5;
        }
    }
}

// 二级回复：浅底 + 左侧强调线，比独立卡片更轻
.reply-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
    padding: 12px 14px 12px 16px;
    border-left: 2px solid @pcolor;
    border-radius: 0 12px 12px 0;
    background: @bg-color-s;
}

.reply-item {
    display: flex;
    gap: 8px;

    & + & {
        padding-top: 12px;
        border-top: 1px dashed @line-color-s;
    }
}

.reply-body {
    flex: 1;
    min-width: 0;
}

// 窄屏：阅读区放开到容器宽度，头图改为 16:10 减少留白
@media (max-width: 640px) {
    .detail-reader,
    .detail-meta,
    .comment-section {
        max-width: 100%;
    }

    .detail-cover {
        aspect-ratio: 16 / 10;
        border-radius: 10px;
    }

    .detail-html :deep(img) {
        max-width: 100% !important;
        max-height: 340px;
        margin: 22px auto;
    }

    .detail-html {
        font-size: 15px;
        line-height: 1.85;
    }
}
</style>
