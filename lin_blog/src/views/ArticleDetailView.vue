<template>
    <yk-modal :model-value="props.modelValue" size="xl" title="文章详情" :show-footer="false"
        :closeable="true" content-height="calc(100vh - 148px)" @update:model-value="handleVisibleChange">
        <div class="article-detail">
            <div v-if="loading" class="article-detail-state">
                <yk-spinner size="m" />
                <yk-text type="secondary">正在加载文章...</yk-text>
            </div>

            <div v-else-if="errorMessage" class="article-detail-state">
                <yk-empty description="文章加载失败">
                    <yk-text type="secondary">{{ errorMessage }}</yk-text>
                    <yk-space>
                        <yk-button type="secondary" @click="loadArticle">重新加载</yk-button>
                        <yk-button @click="closeModal">关闭</yk-button>
                    </yk-space>
                </yk-empty>
            </div>

            <article v-else-if="article" class="article-detail-article">
                <!-- 顶部：标题信息 + 封面 -->
                <header class="article-detail-hero" :class="{ 'is-text-only': !article.cover }">
                    <div class="article-detail-heading">
                        <div class="article-detail-kicker">
                            <yk-tag :class="`state-${article.state}`">{{ stateLabel }}</yk-tag>
                            <span>{{ subsetName }}</span>
                            <span class="article-detail-dot"></span>
                            <span>{{ articleDate }}</span>
                        </div>

                        <h1>{{ article.title }}</h1>
                        <p v-if="article.introduce" class="article-detail-introduce">
                            {{ article.introduce }}
                        </p>

                        <yk-space v-if="labels.length" wrap size="s" class="article-detail-labels">
                            <yk-tag v-for="label in labels" :key="label" shape="round">
                                {{ label }}
                            </yk-tag>
                        </yk-space>
                    </div>

                    <figure v-if="article.cover" class="article-detail-cover">
                        <yk-image :src="article.cover" width="100%" height="100%" fit="cover"
                            :preview="true" :is-lazy="true" />
                    </figure>
                </header>

                <!-- 工具栏：数据概览 + 操作 -->
                <div class="article-detail-toolbar">
                    <div class="article-detail-metrics">
                        <span><IconEyeOutline />{{ article.views }} 次浏览</span>
                        <span><IconLikeOutline />{{ article.likes }} 次点赞</span>
                        <span><IconCommentOutline />{{ article.comments }} 条评论</span>
                    </div>

                    <yk-space size="s" wrap>
                        <yk-button v-if="canEdit" type="secondary" @click="openEditor">
                            编辑
                        </yk-button>
                        <yk-button v-if="canPublish && article.state !== 'published'"
                            :loading="statusUpdating" @click="changeState('published')">
                            发布
                        </yk-button>
                        <yk-button v-if="canPublish && article.state === 'published'"
                            type="secondary" :loading="statusUpdating" @click="changeState('draft')">
                            撤回
                        </yk-button>
                        <yk-popconfirm v-if="canDelete" placement="bottomRight" trigger="click"
                            title="确认删除" content="删除将不可恢复" @confirm="removeArticle">
                            <yk-button type="secondary">删除</yk-button>
                        </yk-popconfirm>
                    </yk-space>
                </div>

                <!-- 正文 + 侧栏信息 -->
                <div class="article-detail-layout">
                    <div class="article-detail-content" v-html="safeContent"></div>

                    <aside class="article-detail-aside">
                        <div class="article-detail-aside-title">文章信息</div>
                        <div class="article-detail-info">
                            <span class="article-detail-info-label">所属分类</span>
                            <strong>{{ subsetName }}</strong>
                        </div>
                        <div class="article-detail-info">
                            <span class="article-detail-info-label">创建时间</span>
                            <strong>{{ formatArticleDate(article.createdAt) }}</strong>
                        </div>
                        <div v-if="article.publishedAt" class="article-detail-info">
                            <span class="article-detail-info-label">发布时间</span>
                            <strong>{{ formatArticleDate(article.publishedAt) }}</strong>
                        </div>
                        <div class="article-detail-info">
                            <span class="article-detail-info-label">文章状态</span>
                            <strong>{{ stateLabel }}</strong>
                        </div>
                        <div class="article-detail-info">
                            <span class="article-detail-info-label">文章标识</span>
                            <strong>#{{ article.id }}</strong>
                        </div>
                    </aside>
                </div>

                <!-- 评论区 -->
                <section class="article-detail-comments">
                    <header class="comments-head">
                        <h2 class="comments-title">
                            评论
                            <span class="comments-count">{{ commentTotal }}</span>
                        </h2>
                        <span class="comments-hint">支持两级评论，回复请针对一级评论</span>
                    </header>

                    <div class="comment-composer">
                        <yk-avatar :size="40" :img-url="composerAvatar || undefined" class="composer-avatar" />
                        <div class="composer-main">
                            <yk-text-area v-model="newCommentDraft" :max-length="512" show-word-limit
                                :auto-size="{ minRows: 2, maxRows: 5 }" placeholder="写下你的评论…"
                                @keydown.ctrl.enter="submitComment(0)" />
                            <div class="composer-footer">
                                <span class="composer-hint">Ctrl + Enter 快速发送</span>
                                <yk-button type="primary" size="s" :loading="commentSubmitting === 0"
                                    :disabled="!newCommentDraft.trim()" @click="submitComment(0)">
                                    发表评论
                                </yk-button>
                            </div>
                        </div>
                    </div>
                    <p v-if="commentError" class="compose-error">{{ commentError }}</p>

                    <div v-if="commentsLoading" class="comments-state">
                        <yk-spinner size="s" />
                        <yk-text type="secondary">正在加载评论...</yk-text>
                    </div>

                    <div v-else-if="commentsError" class="comments-state">
                        <yk-text type="secondary">{{ commentsError }}</yk-text>
                        <yk-button type="secondary" size="s" @click="loadComments">重新加载</yk-button>
                    </div>

                    <yk-empty v-else-if="threads.length === 0" description="还没有评论" />

                    <div v-else class="comment-list">
                        <article v-for="thread in threads" :key="thread.root.id" class="comment-thread">
                            <yk-avatar :size="38" :img-url="thread.root.userAvatar || undefined"
                                class="comment-avatar" />
                            <div class="thread-body">
                                <div class="thread-head">
                                    <span class="comment-user">{{ thread.root.userName || '未知用户' }}</span>
                                    <div class="comment-head-right">
                                        <time>{{ formatDateTime(thread.root.createdAt) }}</time>
                                        <button type="button" class="comment-like"
                                            :class="{ liked: thread.root.liked, busy: isCommentLikeBusy(thread.root.id) }"
                                            :disabled="isCommentLikeBusy(thread.root.id)"
                                            title="点赞 / 取消点赞"
                                            @click="handleCommentLike(thread.root)">
                                            <IconLikeFill v-if="thread.root.liked" />
                                            <IconLikeOutline v-else />
                                            {{ thread.root.likes }}
                                        </button>
                                    </div>
                                </div>
                                <p class="comment-content">{{ thread.root.content }}</p>

                                <div class="thread-actions">
                                    <div class="thread-actions-left">
                                        <button type="button" class="comment-action"
                                            @click="startReply(thread.root.id)">
                                            <IconCommentOutline />回复
                                        </button>
                                        <button v-if="thread.replies.length" type="button"
                                            class="comment-action reply-toggle"
                                            @click="toggleReplies(thread.root.id)">
                                            <template v-if="isExpanded(thread.root.id)">
                                                <IconUpOutline />收起回复
                                            </template>
                                            <template v-else>
                                                <IconDownOutline />展开 {{ thread.replies.length }} 条回复
                                            </template>
                                        </button>
                                    </div>

                                    <yk-popover :open="activeCommentMenu === thread.root.id"
                                        trigger="click" placement="bottomRight" :arrow="false"
                                        overlay-class="comment-action-popover"
                                        @update:open="(open: boolean) => setCommentMenu(thread.root.id, open)">
                                        <button type="button" class="comment-more" title="更多操作"
                                            aria-label="更多操作">
                                            <IconMoreOutline />
                                        </button>
                                        <template #popover>
                                            <div class="comment-menu">
                                                <button type="button"
                                                    :disabled="!canDeleteComment(thread.root)"
                                                    :class="{ 'is-danger': deleteConfirmId === thread.root.id }"
                                                    @click="requestDeleteComment(thread.root.id)">
                                                    <IconDeleteOutline />{{ deleteConfirmId === thread.root.id ? '确认删除' : '删除' }}
                                                </button>
                                                <button type="button" @click="reportCommentItem(thread.root)">
                                                    <IconWarningOutline />举报
                                                </button>
                                            </div>
                                        </template>
                                    </yk-popover>
                                </div>

                                <div v-if="replyTarget === thread.root.id" class="reply-composer">
                                    <yk-text-area v-model="replyDraft" :max-length="512" show-word-limit
                                        :auto-size="{ minRows: 2, maxRows: 4 }"
                                        :placeholder="`回复 ${thread.root.userName || '该用户'}`"
                                        @keydown.ctrl.enter="submitComment(thread.root.id)" />
                                    <div class="composer-footer">
                                        <span class="composer-hint">Ctrl + Enter 快速发送</span>
                                        <yk-space size="s">
                                            <yk-button size="s" type="secondary" @click="cancelReply">
                                                取消
                                            </yk-button>
                                            <yk-button size="s" type="primary"
                                                :loading="commentSubmitting === thread.root.id"
                                                :disabled="!replyDraft.trim()"
                                                @click="submitComment(thread.root.id)">
                                                回复
                                            </yk-button>
                                        </yk-space>
                                    </div>
                                </div>

                                <div v-if="thread.replies.length && isExpanded(thread.root.id)"
                                    class="reply-list">
                                    <div v-for="reply in thread.replies" :key="reply.id" class="reply-item">
                                        <yk-avatar :size="26" :img-url="reply.userAvatar || undefined" />
                                        <div class="reply-body">
                                            <div class="thread-head">
                                                <div class="comment-author-line">
                                                    <span class="comment-user">{{ reply.userName || '未知用户' }}</span>
                                                    <span class="reply-to">回复 {{ thread.root.userName || '该用户' }}</span>
                                                </div>
                                                <div class="comment-head-right">
                                                    <time>{{ formatDateTime(reply.createdAt) }}</time>
                                                    <button type="button" class="comment-like"
                                                        :class="{ liked: reply.liked, busy: isCommentLikeBusy(reply.id) }"
                                                        :disabled="isCommentLikeBusy(reply.id)"
                                                        title="点赞 / 取消点赞"
                                                        @click="handleCommentLike(reply)">
                                                        <IconLikeFill v-if="reply.liked" />
                                                        <IconLikeOutline v-else />
                                                        {{ reply.likes }}
                                                    </button>
                                                </div>
                                            </div>
                                            <p class="comment-content">{{ reply.content }}</p>
                                            <div class="thread-actions is-reply">
                                                <yk-popover :open="activeCommentMenu === reply.id"
                                                    trigger="click" placement="bottomRight" :arrow="false"
                                                    overlay-class="comment-action-popover"
                                                    @update:open="(open: boolean) => setCommentMenu(reply.id, open)">
                                                    <button type="button" class="comment-more"
                                                        title="更多操作" aria-label="更多操作">
                                                        <IconMoreOutline />
                                                    </button>
                                                    <template #popover>
                                                        <div class="comment-menu">
                                                            <button type="button"
                                                                :disabled="!canDeleteComment(reply)"
                                                                :class="{ 'is-danger': deleteConfirmId === reply.id }"
                                                                @click="requestDeleteComment(reply.id)">
                                                                <IconDeleteOutline />{{ deleteConfirmId === reply.id ? '确认删除' : '删除' }}
                                                            </button>
                                                            <button type="button"
                                                                @click="reportCommentItem(reply)">
                                                                <IconWarningOutline />举报
                                                            </button>
                                                        </div>
                                                    </template>
                                                </yk-popover>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>
                </section>
            </article>
        </div>
    </yk-modal>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
import type { ArticleItem, ArticleState } from '../api/article'
import {
    deleteArticle,
    formatArticleDate,
    getArticleById,
    getArticleErrorMessage,
    getArticleStateLabel,
    parseArticleLabels,
    updateArticleStatus,
} from '../api/article'
import {
    createComment,
    deleteComment,
    getComments,
    getRequestErrorMessage,
    reportComment,
    toggleCommentLike,
    type CommentItem,
} from '../api/comment'
import { useSubsetStore } from '../store/subset'
import { useSessionStore } from '../store/session.ts'
import { useContentAccess } from '../utils/contentAccess.ts'

type Props = {
    modelValue?: boolean
    articleId?: number | null
}

type DetailChangedEvent = {
    type: 'updated' | 'deleted'
    articleId: number
}

type MessageProxy = {
    $message?: (options: {
        type: 'primary' | 'warning' | 'error' | 'success'
        message: string
    }) => void
}

type CommentThread = {
    root: CommentItem
    replies: CommentItem[]
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: false,
    articleId: null,
})

const emits = defineEmits<{
    'update:modelValue': [value: boolean]
    changed: [event: DetailChangedEvent]
}>()

const router = useRouter()
const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined
const subsetStore = useSubsetStore()
const session = useSessionStore()

const article = ref<ArticleItem | null>(null)
const loading = ref(false)
const statusUpdating = ref(false)
const errorMessage = ref('')

// 评论区状态
const comments = ref<CommentItem[]>([])
const commentsLoading = ref(false)
const commentsError = ref('')
const commentTotal = ref(0)
const newCommentDraft = ref('')
const replyTarget = ref<number | null>(null)
const replyDraft = ref('')
// 0 表示顶部「发表评论」，大于 0 表示正在回复该一级评论
const commentSubmitting = ref<number | null>(null)
const commentError = ref('')
const expandedThreads = ref<Set<number>>(new Set())
const activeCommentMenu = ref<number | null>(null)
const commentLikeBusyIds = ref<Set<number>>(new Set())
const deleteConfirmId = ref<number | null>(null)

const currentUser = (() => {
    try {
        const saved = localStorage.getItem('userInfo')
        return saved
            ? JSON.parse(saved) as { id?: number; user_type?: string; imgurl?: string }
            : null
    } catch {
        return null
    }
})()

const composerAvatar = currentUser?.imgurl || ''
const stateLabel = computed(() => getArticleStateLabel(article.value?.state))
const labels = computed(() => parseArticleLabels(article.value?.label))
const articleDate = computed(() => formatArticleDate(
    article.value?.publishedAt || article.value?.createdAt
))
const subsetName = computed(
    () => article.value?.subsetName ||
        subsetStore.subsetName(article.value?.subsetId ?? undefined) ||
        '未分类'
)
const access = useContentAccess('article')
const canPublish = access.canPublish
const canEdit = computed(() => access.canEdit(article.value))
const canDelete = computed(() => access.canDelete(article.value))

// 评论删除：comment.moderate 可删任意评论，comment.manageOwn 只能删本人评论
const canDeleteComment = (comment: CommentItem): boolean => {
    if (session.can('comment.moderate')) return true
    if (!session.can('comment.manageOwn')) return false
    return Boolean(currentUser) && Number(comment.userId) === Number(currentUser?.id)
}

const safeContent = computed(() => {
    const html = article.value?.content || '<p>暂无正文</p>'
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
    })
})

// 一级评论按最新在前，二级回复按时间正序挂在所属评论下
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
    const next = new Set(expandedThreads.value)
    if (next.has(commentId)) next.delete(commentId)
    else next.add(commentId)
    expandedThreads.value = next
}

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
        deleteConfirmId.value = null
        return
    }
    if (activeCommentMenu.value === commentId) {
        activeCommentMenu.value = null
        deleteConfirmId.value = null
    }
}

const showMessage = (
    type: 'primary' | 'warning' | 'error' | 'success',
    message: string
): void => {
    proxy?.$message?.({ type, message })
}

const describeError = (error: unknown, fallback: string): string => {
    const responseMessage = getArticleErrorMessage(error, '')
    if (responseMessage) return responseMessage
    return error instanceof Error && error.message ? error.message : fallback
}

const formatDateTime = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

const closeModal = (): void => {
    emits('update:modelValue', false)
}

const handleVisibleChange = (visible: boolean): void => {
    emits('update:modelValue', visible)
}

const loadArticle = async (): Promise<void> => {
    const id = Number(props.articleId)
    if (!Number.isInteger(id) || id <= 0) {
        article.value = null
        errorMessage.value = '文章ID无效'
        return
    }

    loading.value = true
    errorMessage.value = ''
    article.value = null
    expandedThreads.value = new Set()
    activeCommentMenu.value = null
    commentLikeBusyIds.value = new Set()
    deleteConfirmId.value = null

    try {
        const result = await getArticleById(id)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '文章加载失败')
        }
        article.value = result.data
        commentTotal.value = result.data.comments || 0
        await loadComments()
    } catch (error) {
        errorMessage.value = describeError(error, '文章加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

const loadComments = async (): Promise<void> => {
    const id = Number(props.articleId)
    if (!Number.isInteger(id) || id <= 0) return

    commentsLoading.value = true
    commentsError.value = ''

    try {
        // 一页 50 条是接口上限，文章详情的评论量远低于此
        const result = await getComments({ articleId: id, page: 1, pageSize: 50 })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '评论加载失败')
        }
        comments.value = result.data.list
        commentTotal.value = Math.max(result.data.total, comments.value.length)
    } catch (error) {
        comments.value = []
        commentsError.value = getRequestErrorMessage(error, '评论加载失败，请稍后重试')
    } finally {
        commentsLoading.value = false
    }
}

const startReply = (commentId: number): void => {
    replyTarget.value = commentId
    replyDraft.value = ''
    commentError.value = ''
}

const cancelReply = (): void => {
    replyTarget.value = null
    replyDraft.value = ''
}

const submitComment = async (parentId: number): Promise<void> => {
    if (!article.value || commentSubmitting.value !== null) return

    const content = (parentId > 0 ? replyDraft.value : newCommentDraft.value).trim()
    if (!content) return

    commentError.value = ''
    commentSubmitting.value = parentId
    try {
        const result = await createComment({
            articleId: article.value.id,
            content,
            parentId,
        })
        if (result.code !== 200) {
            throw new Error(result.message || '评论失败')
        }

        if (parentId > 0) {
            replyDraft.value = ''
            replyTarget.value = null
        } else {
            newCommentDraft.value = ''
        }

        await loadComments()
        // article.comments 是展示用冗余计数，本地同步 +1 避免整篇重新拉取
        article.value.comments = Number(article.value.comments || 0) + 1
        commentTotal.value = Math.max(commentTotal.value, comments.value.length)
        showMessage('success', parentId > 0 ? '回复已发表' : '评论已发表')
        emits('changed', { type: 'updated', articleId: article.value.id })
    } catch (error) {
        commentError.value = getRequestErrorMessage(error, '评论失败，请稍后重试')
    } finally {
        commentSubmitting.value = null
    }
}

const handleCommentLike = async (comment: CommentItem): Promise<void> => {
    if (isCommentLikeBusy(comment.id)) return

    setCommentLikeBusy(comment.id, true)
    try {
        const result = await toggleCommentLike({
            commentType: 'article',
            commentId: comment.id,
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '点赞评论失败')
        }
        comment.liked = result.data.liked
        comment.likes = result.data.likes
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '点赞评论失败，请稍后重试'))
    } finally {
        setCommentLikeBusy(comment.id, false)
    }
}

const reportCommentItem = async (comment: CommentItem): Promise<void> => {
    activeCommentMenu.value = null
    deleteConfirmId.value = null
    try {
        const result = await reportComment({
            commentType: 'article',
            commentId: comment.id,
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '举报评论失败')
        }
        comment.complaint = result.data.complaint
        showMessage(
            result.data.already ? 'primary' : 'success',
            result.message || (result.data.already ? '你已举报过该评论' : '举报成功，感谢反馈')
        )
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '举报评论失败，请稍后重试'))
    }
}

const requestDeleteComment = (commentId: number): void => {
    if (deleteConfirmId.value !== commentId) {
        deleteConfirmId.value = commentId
        return
    }
    void removeComment(commentId)
}

const removeComment = async (commentId: number): Promise<void> => {
    activeCommentMenu.value = null
    deleteConfirmId.value = null
    const target = comments.value.find(comment => Number(comment.id) === Number(commentId))
    if (!target || !canDeleteComment(target)) {
        showMessage('warning', '只能删除自己的评论')
        return
    }

    try {
        const result = await deleteComment(commentId)
        if (result.code !== 200) {
            throw new Error(result.message || '删除失败')
        }
        await loadComments()
        expandedThreads.value = new Set()
        const deleted = Number(result.data?.deleted || 1)
        if (article.value) {
            article.value.comments = Math.max(Number(article.value.comments || 0) - deleted, 0)
        }
        showMessage('success', result.message || '评论已删除')
        if (article.value) {
            emits('changed', { type: 'updated', articleId: article.value.id })
        }
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '删除失败，请稍后重试'))
    }
}

const openEditor = (): void => {
    if (!article.value) return
    const id = article.value.id
    closeModal()
    void router.push(`/editarticle/${id}`)
}

const changeState = async (state: ArticleState): Promise<void> => {
    if (!article.value || statusUpdating.value) return

    statusUpdating.value = true
    try {
        const result = await updateArticleStatus(article.value.id, state)
        if (result.code !== 200) {
            throw new Error(result.message || '文章状态修改失败')
        }
        showMessage('success', result.message || '文章状态已更新')
        emits('changed', { type: 'updated', articleId: article.value.id })
        await loadArticle()
    } catch (error) {
        showMessage('error', describeError(error, '状态修改失败，请稍后重试'))
    } finally {
        statusUpdating.value = false
    }
}

const removeArticle = async (): Promise<void> => {
    if (!article.value) return
    const id = article.value.id

    try {
        const result = await deleteArticle(id)
        if (result.code !== 200) {
            throw new Error(result.message || '文章删除失败')
        }
        showMessage('success', '文章已删除')
        emits('changed', { type: 'deleted', articleId: id })
        closeModal()
    } catch (error) {
        showMessage('error', describeError(error, '文章删除失败，请稍后重试'))
    }
}

watch(
    [() => props.modelValue, () => props.articleId],
    ([visible, articleId]) => {
        if (visible && articleId) {
            void loadArticle()
            return
        }
        if (!visible) {
            // 关闭后重置互动状态，避免下次打开残留上一篇的评论与草稿
            comments.value = []
            commentTotal.value = 0
            newCommentDraft.value = ''
            replyDraft.value = ''
            replyTarget.value = null
            commentError.value = ''
            commentsError.value = ''
            expandedThreads.value = new Set()
            activeCommentMenu.value = null
            commentLikeBusyIds.value = new Set()
            deleteConfirmId.value = null
        }
    },
    { immediate: true }
)
</script>

<style lang="less" scoped>
.article-detail {
    min-height: 360px;

    &-state {
        min-height: 360px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    &-article {
        display: flex;
        flex-direction: column;
        gap: @space-xl;
    }

    // 顶部：信息区与封面并排，封面比例固定，避免超宽铺满
    &-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
        gap: clamp(20px, 3vw, 44px);
        align-items: center;
        padding: clamp(22px, 3vw, 36px);
        border-radius: 20px;
        background:
            radial-gradient(circle at 94% 2%, rgba(43, 90, 237, 0.16), transparent 42%),
            linear-gradient(135deg, @bg-color-l 0%, @bg-color-s 100%);

        &.is-text-only {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    &-heading {
        min-width: 0;

        h1 {
            margin: @space-m 0 @space-s;
            color: @font-color-l;
            font-size: clamp(22px, 2.4vw, 30px);
            line-height: 1.32;
            letter-spacing: -0.01em;
            overflow-wrap: anywhere;
        }
    }

    &-kicker {
        display: flex;
        flex-wrap: wrap;
        gap: @space-s;
        align-items: center;
        color: @font-color-s;
        font-size: @size-s;
        letter-spacing: 0.03em;
    }

    &-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: @font-color-s;
        opacity: 0.5;
    }

    &-introduce {
        max-width: 720px;
        margin: 0;
        .font-m();
        color: @font-color-s;
        line-height: 1.8;
        overflow-wrap: anywhere;
    }

    &-labels {
        margin-top: @space-m;
    }

    &-cover {
        margin: 0;
        overflow: hidden;
        aspect-ratio: 4 / 3;
        border-radius: 14px;
        background: @bg-color-s;
        box-shadow: 0 14px 34px rgba(21, 38, 79, 0.14);

        :deep(.yk-image) {
            height: 100%;
        }
    }

    // 工具栏：浅底色让数据与操作从正文中分离出来
    &-toolbar {
        display: flex;
        gap: @space-l;
        align-items: center;
        justify-content: space-between;
        padding: @space-m @space-l;
        border: 1px solid @line-color-s;
        border-radius: @radius-m;
        background: @bg-color-s;
    }

    &-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: @space-l;
        color: @font-color-s;
        font-size: @size-s;

        span {
            display: inline-flex;
            gap: 6px;
            align-items: center;
        }

        .yk-icon {
            width: 16px;
            height: 16px;
        }
    }

    &-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 200px;
        gap: clamp(24px, 4vw, 56px);
        align-items: start;
    }

    &-content {
        min-width: 0;
        color: @font-color-l;
        font-size: 15.5px;
        line-height: 1.9;
        overflow-wrap: anywhere;

        :deep(> :first-child) {
            margin-top: 0;
        }

        :deep(h1),
        :deep(h2),
        :deep(h3),
        :deep(h4) {
            margin: 1.6em 0 0.65em;
            color: @font-color-l;
            line-height: 1.35;
        }

        :deep(p) {
            margin: 0 0 1.15em;
        }

        :deep(img),
        :deep(video) {
            max-width: 100%;
            height: auto;
            margin: @space-l 0;
            border-radius: @radius-m;
        }

        :deep(pre) {
            overflow-x: auto;
            padding: @space-l;
            border-radius: @radius-m;
            background: #151b2b;
            color: #eef2ff;
        }

        :deep(code) {
            padding: 2px 6px;
            border-radius: 6px;
            background: @bg-color-s;
            font-size: 0.9em;
        }

        :deep(pre code) {
            padding: 0;
            background: transparent;
        }

        :deep(blockquote) {
            margin: @space-l 0;
            padding: @space-m @space-l;
            border-left: 4px solid @pcolor;
            background: @bg-color-s;
            color: @font-color-s;
        }

        :deep(a) {
            color: @pcolor;
        }
    }

    &-aside {
        position: sticky;
        top: 0;
        display: flex;
        flex-direction: column;
        gap: @space-l;
        padding: @space-l;
        border: 1px solid @line-color-s;
        border-radius: @radius-m;
        background: @bg-color-s;
    }

    &-aside-title {
        padding-bottom: @space-s;
        border-bottom: 1px solid @line-color-m;
        color: @font-color-l;
        font-size: @size-s;
        font-weight: 600;
        letter-spacing: 0.08em;
    }

    &-info {
        display: flex;
        flex-direction: column;
        gap: 4px;

        strong {
            color: @font-color-l;
            font-size: @size-m;
            font-weight: 500;
            overflow-wrap: anywhere;
        }

        &-label {
            color: @font-color-s;
            font-size: @size-ss;
        }
    }

    // 评论区
    &-comments {
        margin-top: @space-l;
        padding-top: @space-xl;
        border-top: 1px solid @line-color-m;
    }

    .comments-head {
        display: flex;
        flex-wrap: wrap;
        gap: @space-s;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: @space-l;
    }

    .comments-title {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        margin: 0;
        color: @font-color-l;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0.01em;
    }

    .comments-count {
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

    .comments-hint {
        color: @font-color-s;
        font-size: @size-ss;
    }

    // 发布框：头像 + 输入框并排，输入框自带底色与聚焦描边，不再套外层边框
    .comment-composer {
        display: flex;
        gap: @space-m;
        align-items: flex-start;
    }

    .composer-main {
        display: flex;
        flex: 1;
        min-width: 0;
        flex-direction: column;
        gap: 8px;
    }

    .composer-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: @space-s;
    }

    .composer-hint {
        color: @font-color-s;
        font-size: @size-ss;
    }

    .compose-error {
        margin: 8px 0 0 52px;
        color: @ecolor;
        font-size: @size-ss;
    }

    .comments-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: @space-s;
        padding: @space-xl 0;
    }

    // 评论列表：用分隔线而不是卡片，避免弹窗里出现层层边框
    .comment-list {
        display: flex;
        flex-direction: column;
        margin-top: @space-l;
    }

    .comment-thread {
        display: flex;
        gap: @space-m;
        padding: @space-l 0;

        & + & {
            border-top: 1px solid @line-color-s;
        }
    }

    .thread-body {
        flex: 1;
        min-width: 0;
    }

    .thread-head {
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
            color: @font-color-l;
            font-size: 14px;
            font-weight: 600;
        }

        .reply-to {
            color: @font-color-s;
            font-size: 12px;
        }

        time {
            color: @font-color-s;
            font-size: 12px;
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
        color: @font-color-m;
        line-height: 1.75;
        word-break: break-word;
    }

    .thread-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: @space-l;
        margin-top: 8px;

        &.is-reply {
            justify-content: flex-end;
        }
    }

    .thread-actions-left {
        display: flex;
        flex-wrap: wrap;
        gap: @space-l;
        align-items: center;
    }

    .comment-action {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        padding: 0;
        border: none;
        background: transparent;
        color: @font-color-s;
        font-size: 12px;
        cursor: pointer;
        transition: color 0.2s ease;

        .yk-icon {
            width: 13px;
            height: 13px;
        }

        &:hover {
            color: @pcolor;
        }

        &.is-danger:hover {
            color: @ecolor;
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
            gap: 7px;
            align-items: center;
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

    // 回复输入：紧贴该条评论下方，输入框自带样式，这里只负责排版
    .reply-composer {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: @space-m;
    }

    // 二级回复：浅底 + 左侧强调线，比独立卡片更轻
    .reply-list {
        display: flex;
        flex-direction: column;
        gap: @space-m;
        margin-top: @space-m;
        padding: @space-m @space-m @space-m @space-l;
        border-left: 2px solid @pcolor;
        border-radius: 0 12px 12px 0;
        background: @bg-color-s;
    }

    .reply-item {
        display: flex;
        gap: @space-s;

        & + & {
            padding-top: @space-m;
            border-top: 1px dashed @line-color-s;
        }
    }

    .reply-body {
        flex: 1;
        min-width: 0;
    }

    .state-published {
        color: #1f8a5b;
        background: rgba(31, 157, 99, 0.12);
    }

    .state-rejected {
        color: #c63e32;
        background: rgba(218, 80, 66, 0.12);
    }
}

@media (max-width: 900px) {
    .article-detail {
        &-hero,
        &-layout {
            grid-template-columns: minmax(0, 1fr);
        }

        &-cover {
            order: -1;
            width: 100%;
            max-width: 420px;
        }

        &-toolbar {
            align-items: flex-start;
            flex-direction: column;
        }

        &-aside {
            position: static;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: @space-m;
        }

        &-aside-title {
            grid-column: 1 / -1;
        }
    }
}

@media (max-width: 560px) {
    .article-detail {
        &-hero {
            padding: @space-l;
        }

        &-aside {
            grid-template-columns: minmax(0, 1fr);
        }

        .reply-list {
            padding-left: @space-m;
        }
    }
}
</style>
