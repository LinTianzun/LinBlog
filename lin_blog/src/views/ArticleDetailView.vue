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
                    <div class="comments-head">
                        <div class="comments-title">
                            评论
                            <span class="comments-count">{{ commentTotal }} 条</span>
                        </div>
                        <yk-text type="secondary" class="comments-hint">
                            仅支持两级评论，回复请针对一级评论
                        </yk-text>
                    </div>

                    <div class="comment-compose">
                        <yk-text-area v-model="newCommentDraft" :max-length="512" show-word-limit
                            :auto-size="{ minRows: 2, maxRows: 5 }" placeholder="写下你的评论…"
                            @keydown.ctrl.enter="submitComment(0)" />
                        <div class="compose-actions">
                            <span class="compose-hint">Ctrl + Enter 快速发送</span>
                            <yk-button type="primary" size="s" :loading="commentSubmitting === 0"
                                :disabled="!newCommentDraft.trim()" @click="submitComment(0)">
                                发表评论
                            </yk-button>
                        </div>
                        <p v-if="commentError" class="compose-error">{{ commentError }}</p>
                    </div>

                    <div v-if="commentsLoading" class="comments-state">
                        <yk-spinner size="s" />
                        <yk-text type="secondary">正在加载评论...</yk-text>
                    </div>

                    <div v-else-if="commentsError" class="comments-state">
                        <yk-text type="secondary">{{ commentsError }}</yk-text>
                        <yk-button type="secondary" size="s" @click="loadComments">重新加载</yk-button>
                    </div>

                    <yk-empty v-else-if="threads.length === 0" description="还没有评论" />

                    <div v-else class="comment-threads">
                        <div v-for="thread in threads" :key="thread.root.id" class="comment-thread">
                            <div class="comment-item is-root">
                                <yk-avatar :size="36" :img-url="thread.root.userAvatar || undefined" />
                                <div class="comment-main">
                                    <div class="comment-head">
                                        <span class="comment-user">{{ thread.root.userName || '未知用户' }}</span>
                                        <time>{{ formatDateTime(thread.root.createdAt) }}</time>
                                    </div>
                                    <p class="comment-content">{{ thread.root.content }}</p>
                                    <div class="comment-actions">
                                        <yk-text type="primary" @click="startReply(thread.root.id)">
                                            回复
                                        </yk-text>
                                        <yk-popconfirm placement="bottomRight" trigger="click"
                                            title="确认删除" content="删除后不可恢复"
                                            @confirm="removeComment(thread.root.id)">
                                            <yk-text type="secondary">删除</yk-text>
                                        </yk-popconfirm>
                                    </div>

                                    <div v-if="replyTarget === thread.root.id" class="reply-compose">
                                        <yk-text-area v-model="replyDraft" :max-length="512" show-word-limit
                                            :auto-size="{ minRows: 2, maxRows: 4 }"
                                            :placeholder="`回复 ${thread.root.userName || '该用户'}`"
                                            @keydown.ctrl.enter="submitComment(thread.root.id)" />
                                        <div class="compose-actions">
                                            <span class="compose-hint">Ctrl + Enter 快速发送</span>
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
                                </div>
                            </div>

                            <div v-if="thread.replies.length" class="comment-replies">
                                <div v-for="reply in thread.replies" :key="reply.id" class="comment-item is-reply">
                                    <yk-avatar :size="28" :img-url="reply.userAvatar || undefined" />
                                    <div class="comment-main">
                                        <div class="comment-head">
                                            <span class="comment-user">{{ reply.userName || '未知用户' }}</span>
                                            <span class="comment-reply-to">
                                                回复 {{ thread.root.userName || '该用户' }}
                                            </span>
                                            <time>{{ formatDateTime(reply.createdAt) }}</time>
                                        </div>
                                        <p class="comment-content">{{ reply.content }}</p>
                                        <div class="comment-actions">
                                            <yk-popconfirm placement="bottomRight" trigger="click"
                                                title="确认删除" content="删除后不可恢复"
                                                @confirm="removeComment(reply.id)">
                                                <yk-text type="secondary">删除</yk-text>
                                            </yk-popconfirm>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
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
    type CommentItem,
} from '../api/comment'
import { useSubsetStore } from '../store/subset'

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

const currentUser = (() => {
    try {
        const saved = localStorage.getItem('userInfo')
        return saved ? JSON.parse(saved) as { id?: number; user_type?: string } : null
    } catch {
        return null
    }
})()

const currentRole = currentUser?.user_type || ''
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
const canPublish = computed(() => ['admin', 'editor'].includes(currentRole))
const canEdit = computed(() => {
    if (!article.value) return false
    if (['admin', 'editor'].includes(currentRole)) return true
    return currentRole === 'normal' &&
        Number(article.value.userId) === Number(currentUser?.id) &&
        ['draft', 'rejected'].includes(article.value.state)
})
const canDelete = computed(() => {
    if (!article.value) return false
    if (['admin', 'editor'].includes(currentRole)) return true
    return currentRole === 'normal' &&
        Number(article.value.userId) === Number(currentUser?.id)
})
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

const removeComment = async (commentId: number): Promise<void> => {
    try {
        const result = await deleteComment(commentId)
        if (result.code !== 200) {
            throw new Error(result.message || '删除失败')
        }
        await loadComments()
        if (article.value) {
            article.value.comments = Math.max(Number(article.value.comments || 0) - 1, 0)
        }
        showMessage('success', '评论已删除')
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
        padding-top: @space-l;
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
        gap: @space-s;
        align-items: center;
        color: @font-color-l;
        font-size: 17px;
        font-weight: 600;
    }

    .comments-count {
        padding: 1px 9px;
        border-radius: 999px;
        background: var(--pcolor1);
        color: @pcolor;
        font-size: @size-ss;
        font-weight: 500;
    }

    .comments-hint {
        font-size: @size-ss;
    }

    .comment-compose {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: @space-xl;
    }

    .compose-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: @space-s;
    }

    .compose-hint {
        color: @font-color-s;
        font-size: @size-ss;
    }

    .compose-error {
        margin: 0;
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

    .comment-threads {
        display: flex;
        flex-direction: column;
        gap: @space-l;
    }

    .comment-thread {
        padding: @space-l;
        border: 1px solid @line-color-s;
        border-radius: @radius-m;
        background: @bg-color-l;
    }

    .comment-item {
        display: flex;
        gap: @space-m;

        .comment-main {
            flex: 1;
            min-width: 0;
        }

        .comment-head {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            gap: @space-s;

            .comment-user {
                color: @font-color-l;
                font-weight: 600;
            }

            .comment-reply-to {
                color: @font-color-s;
                font-size: @size-ss;
            }

            time {
                color: @font-color-s;
                font-size: @size-ss;
            }
        }

        .comment-content {
            margin: 6px 0 0;
            color: @font-color-m;
            line-height: 1.75;
            word-break: break-word;
        }

        .comment-actions {
            display: flex;
            gap: @space-m;
            margin-top: 6px;
            font-size: @size-ss;
            cursor: pointer;
        }
    }

    .comment-replies {
        display: flex;
        flex-direction: column;
        gap: @space-m;
        margin: @space-m 0 0 48px;
        padding: @space-m 0 0 @space-m;
        border-left: 2px solid @line-color-m;

        .comment-item.is-reply + .comment-item.is-reply {
            padding-top: @space-m;
            border-top: 1px dashed @line-color-s;
        }
    }

    .reply-compose {
        display: flex;
        flex-direction: column;
        gap: @space-s;
        margin-top: @space-m;
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

        .comment-replies {
            margin-left: @space-m;
        }
    }
}
</style>
