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
                <ContentDetailHero :title="article.title" :introduce="article.introduce || ''"
                    :cover="article.cover || ''" :badges="heroBadges" :labels="labels" />

                <!-- 数据概览：与前台文章详情共用统计条 -->
                <ContentStatBar class="article-detail-stats" :views="article.views"
                    :comments="commentTotal" :meta-chips="metaChips" />

                <!-- 管理操作：前台没有这一组，后台按权限展示 -->
                <div class="article-detail-toolbar">
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
                        <ContentCommentThread v-for="thread in threads" :key="thread.root.id"
                            :root="thread.root" :replies="thread.replies"
                            :expanded="isExpanded(thread.root.id)" :can-like="true" :can-reply="true"
                            :can-report="true" :can-delete="true"
                            :can-confirm-delete="canDeleteComment(thread.root)"
                            :delete-confirming="deleteConfirmId === thread.root.id"
                            :delete-confirming-reply-id="deleteConfirmId"
                            :can-delete-reply="canDeleteCommentById"
                            :is-reply-like-busy="isCommentLikeBusy"
                            :like-busy="isCommentLikeBusy(thread.root.id)" :like-title="'点赞 / 取消点赞'"
                            :menu-open="activeCommentMenu === thread.root.id"
                            :reply-menu-open="activeCommentMenu" @toggle="toggleReplies(thread.root.id)"
                            @reply="startReply(thread.root.id)" @like="handleCommentLike(thread.root)"
                            @like-reply="handleReplyLike" @report="reportCommentItem(thread.root)"
                            @report-reply="reportCommentById"
                            @delete="requestDeleteComment(thread.root.id)" @delete-reply="requestDeleteComment"
                            @update:menu-open="setCommentMenu(thread.root.id, $event)"
                            @update:reply-menu-open="setReplyMenu($event)">
                            <template #composer>
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
                            </template>
                        </ContentCommentThread>
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
import ContentDetailHero from '../components/content/ContentDetailHero.vue'
import ContentCommentThread from '../components/content/ContentCommentThread.vue'
import ContentStatBar from '../components/content/ContentStatBar.vue'

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
    () => String(article.value?.subsetName ||
        subsetStore.subsetName(article.value?.subsetId ?? undefined) ||
        '未分类')
)

// 统计条左侧：分类与状态，与前台文章详情保持同一套标签语言
const metaChips = computed(() => {
    const chips: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning' }[] = [
        { text: subsetName.value, tone: 'accent' }
    ]
    chips.push({
        text: stateLabel.value,
        tone: article.value?.state === 'published' ? 'success' : 'warning'
    })
    return chips
})

// 头部与前台文章详情共用同一组标签语义：分类、状态、日期
const heroBadges = computed(() => {
    const badges: { text: string; tone?: 'plain' | 'accent' | 'success' | 'warning' }[] = [
        { text: subsetName.value, tone: 'accent' }
    ]
    badges.push({
        text: stateLabel.value,
        tone: article.value?.state === 'published' ? 'success' : 'warning'
    })
    badges.push({ text: articleDate.value, tone: 'plain' })
    return badges
})

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

// 二级回复的菜单沿用一级的 open id 空间，这里单独处理开关
const setReplyMenu = (payload: { id: number; open: boolean }): void => {
    setCommentMenu(payload.id, payload.open)
}

// 菜单里逐条判定删除权限，未授权时置灰而不是隐藏
const canDeleteCommentById = (id: number): boolean => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    return target ? canDeleteComment(target) : false
}

const handleReplyLike = (id: number): void => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (target) void handleCommentLike(target)
}

const reportCommentById = (id: number): void => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (target) void reportCommentItem(target)
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

    // 统计条：与操作区之间用细线分隔，形成「数据 / 操作」两段
    &-stats {
        padding-bottom: @space-m;
        border-bottom: 1px solid var(--admin-line, var(--gray1));
    }

    // 操作区：靠右，不和数据抢注意力
    &-toolbar {
        display: flex;
        justify-content: flex-end;
        margin-top: calc(@space-m * -1);
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

        // 排版由共享组件提供，后台侧沿用 --admin-* 默认 token
        :deep(.cc-thread) {
            padding: @space-l 0;
        }
    }

    // 回复输入：紧贴该条评论下方，输入框自带样式，这里只负责排版
    .reply-composer {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: @space-m;
    }
}

@media (max-width: 900px) {
    .article-detail {
        &-layout {
            grid-template-columns: minmax(0, 1fr);
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
        &-aside {
            grid-template-columns: minmax(0, 1fr);
        }
    }
}
</style>
