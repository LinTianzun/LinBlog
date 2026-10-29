<!--
    后台内容评论区：图库与随笔详情共用。
    交互能力对齐后台文章详情：发表、回复、点赞、举报、删除与两级展开。
    数据源和删除接口按 targetType 分流，排版始终复用 ContentCommentThread。
-->
<template>
    <section class="admin-comment-section">
        <header class="admin-comment-head">
            <h2 class="admin-comment-title">
                评论
                <span class="admin-comment-count">{{ commentTotal }}</span>
            </h2>
            <span class="admin-comment-hint">支持两级评论，回复请针对已有评论</span>
        </header>

        <div v-if="canInteract" class="admin-comment-composer">
            <yk-avatar :size="40" :img-url="composerAvatar || undefined" class="admin-comment-avatar" />
            <div class="admin-comment-composer-main">
                <yk-text-area v-model="commentDraft" :max-length="512" show-word-limit
                    :auto-size="{ minRows: 2, maxRows: 5 }" placeholder="写下你的评论…"
                    @keydown.ctrl.enter="submitComment" />
                <div class="admin-comment-composer-footer">
                    <span>Ctrl + Enter 快速发送</span>
                    <yk-button type="primary" size="s" :loading="commentSubmitting"
                        :disabled="!commentDraft.trim()" @click="submitComment">
                        发表评论
                    </yk-button>
                </div>
            </div>
        </div>
        <p v-else class="admin-comment-readonly">当前账号没有发表评论的权限，仅可查看评论区。</p>
        <p v-if="commentError" class="admin-comment-error">{{ commentError }}</p>

        <div v-if="loading" class="admin-comment-state">
            <yk-spinner size="s" />
            <yk-text type="secondary">正在加载评论...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="admin-comment-state">
            <yk-text type="secondary">{{ errorMessage }}</yk-text>
            <yk-button type="secondary" size="s" @click="loadComments">重新加载</yk-button>
        </div>

        <yk-empty v-else-if="threads.length === 0" description="还没有评论" />

        <div v-else class="admin-comment-list">
            <ContentCommentThread v-for="thread in threads" :key="thread.root.id" :root="thread.root"
                :replies="thread.replies" :expanded="isExpanded(thread.root.id)" :can-like="canLike"
                :can-reply="canInteract" :can-report="canReport" :can-delete="canDeleteAny"
                :current-user-id="currentUser?.id"
                :can-confirm-delete="canDeleteComment(thread.root)"
                :delete-confirming="deleteConfirmId === thread.root.id"
                :delete-confirming-reply-id="deleteConfirmId"
                :can-delete-reply="canDeleteCommentById"
                :is-reply-like-busy="isCommentLikeBusy"
                :like-busy="isCommentLikeBusy(thread.root.id)"
                :like-title="canLike ? '点赞 / 取消点赞' : '当前账号无点赞权限'"
                :menu-open="activeCommentMenu === thread.root.id"
                :reply-menu-open="activeCommentMenu"
                @toggle="toggleReplies(thread.root.id)" @reply="startReply(thread.root)"
                @reply-to="startReplyById" @like="handleCommentLike(thread.root)"
                @like-reply="handleReplyLike" @report="reportCommentItem(thread.root)"
                @report-reply="reportCommentById"
                @delete="requestDeleteComment(thread.root.id)" @delete-reply="requestDeleteComment"
                @update:menu-open="setCommentMenu(thread.root.id, $event)"
                @update:reply-menu-open="setReplyMenu($event)">
                <template #composer>
                    <div v-if="replyTarget?.commentId === thread.root.id" class="admin-reply-composer">
                        <div class="admin-reply-title">
                            回复 <strong>{{ replyTarget.targetUserName }}</strong>
                        </div>
                        <yk-text-area v-model="replyDraft" :max-length="512" show-word-limit
                            :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="写下你的回复…"
                            @keydown.ctrl.enter="submitReply" />
                        <div class="admin-reply-footer">
                            <span>Ctrl + Enter 快速发送</span>
                            <yk-space size="s">
                                <yk-button size="s" type="secondary" @click="cancelReply">取消</yk-button>
                                <yk-button size="s" type="primary" :loading="replySubmitting"
                                    :disabled="!replyDraft.trim()" @click="submitReply">
                                    回复
                                </yk-button>
                            </yk-space>
                        </div>
                        <p v-if="replyError" class="admin-comment-error">{{ replyError }}</p>
                    </div>
                </template>

                <template #reply-composer="{ reply }">
                    <div v-if="replyTarget?.commentId === reply.id" class="admin-reply-composer is-nested">
                        <div class="admin-reply-title">
                            回复 <strong>{{ replyTarget.targetUserName }}</strong>
                        </div>
                        <yk-text-area v-model="replyDraft" :max-length="512" show-word-limit
                            :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="写下你的回复…"
                            @keydown.ctrl.enter="submitReply" />
                        <div class="admin-reply-footer">
                            <span>Ctrl + Enter 快速发送</span>
                            <yk-space size="s">
                                <yk-button size="s" type="secondary" @click="cancelReply">取消</yk-button>
                                <yk-button size="s" type="primary" :loading="replySubmitting"
                                    :disabled="!replyDraft.trim()" @click="submitReply">
                                    回复
                                </yk-button>
                            </yk-space>
                        </div>
                        <p v-if="replyError" class="admin-comment-error">{{ replyError }}</p>
                    </div>
                </template>
            </ContentCommentThread>
        </div>

        <CommentReportDialog :open="reportDialogVisible" :submitting="reportSubmitting"
            :comment-content="reportTarget?.content || ''"
            @update:open="updateReportDialog" @submit="submitReport" />
    </section>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import ContentCommentThread from './ContentCommentThread.vue'
import CommentReportDialog from './CommentReportDialog.vue'
import { buildCommentThreads } from './comment.ts'
import { useSessionStore } from '../../store/session.ts'
import {
    createComment,
    deleteComment,
    deleteInteractionComment,
    getComments,
    getRequestErrorMessage,
    reportComment,
    toggleCommentLike,
    type CommentReportReason,
    type CommentItem,
} from '../../api/comment.ts'
import {
    createDiaryComment,
    getDiaryComments,
    type DiaryComment,
} from '../../api/portal.ts'

type CommentRow = CommentItem | DiaryComment
type ReplyTarget = {
    commentId: number
    rootId: number
    targetUserName: string
}

type MessageProxy = {
    $message?: (options: {
        type: 'primary' | 'warning' | 'error' | 'success'
        message: string
    }) => void
}

const props = withDefaults(defineProps<{
    targetType: 'article' | 'diary'
    targetId: number
    initialTotal?: number
}>(), {
    initialTotal: 0,
})

const emit = defineEmits<{
    (event: 'comments-change', total: number): void
    (event: 'changed', total: number): void
}>()

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined
const session = useSessionStore()

const comments = ref<CommentRow[]>([])
const commentTotal = ref(props.initialTotal)
const loading = ref(false)
const errorMessage = ref('')
const expandedThreads = ref<Set<number>>(new Set())
const activeCommentMenu = ref<number | null>(null)
const commentLikeBusyIds = ref<Set<number>>(new Set())
const deleteConfirmId = ref<number | null>(null)
const reportTarget = ref<CommentRow | null>(null)
const reportDialogVisible = ref(false)
const reportSubmitting = ref(false)

const commentDraft = ref('')
const commentSubmitting = ref(false)
const commentError = ref('')
const replyTarget = ref<ReplyTarget | null>(null)
const replyDraft = ref('')
const replySubmitting = ref(false)
const replyError = ref('')

const canInteract = computed(() => session.can('comment.create'))
const canLike = computed(() => session.can('comment.like'))
const canReport = computed(() => session.can('comment.report'))
const canDeleteAny = computed(
    () => session.can('comment.moderate') || session.can('comment.manageOwn')
)

const readCurrentUser = (): { id: number; imgurl?: string } | null => {
    try {
        const saved = localStorage.getItem('userInfo')
        if (!saved) return null
        const user = JSON.parse(saved) as { id?: number; imgurl?: string }
        return user.id ? { id: Number(user.id), imgurl: user.imgurl } : null
    } catch {
        return null
    }
}

const currentUser = ref(readCurrentUser())
const composerAvatar = computed(() => currentUser.value?.imgurl || '')
const threads = computed(() => buildCommentThreads(comments.value))

const isExpanded = (commentId: number) => expandedThreads.value.has(commentId)

const toggleReplies = (commentId: number): void => {
    const next = new Set(expandedThreads.value)
    if (next.has(commentId)) next.delete(commentId)
    else next.add(commentId)
    expandedThreads.value = next
}

const expandThread = (commentId: number): void => {
    const next = new Set(expandedThreads.value)
    next.add(commentId)
    expandedThreads.value = next
}

const isCommentLikeBusy = (commentId: number) => commentLikeBusyIds.value.has(commentId)

const setCommentLikeBusy = (commentId: number, busy: boolean): void => {
    const next = new Set(commentLikeBusyIds.value)
    if (busy) next.add(commentId)
    else next.delete(commentId)
    commentLikeBusyIds.value = next
}

const setCommentMenu = (commentId: number, open: boolean): void => {
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

const setReplyMenu = (payload: { id: number; open: boolean }): void => {
    setCommentMenu(payload.id, payload.open)
}

const canDeleteComment = (comment: CommentRow): boolean => {
    if (session.can('comment.moderate')) return true
    if (!session.can('comment.manageOwn')) return false
    return Number(comment.userId) === Number(currentUser.value?.id)
}

const canDeleteCommentById = (id: number): boolean => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    return target ? canDeleteComment(target) : false
}

const showMessage = (
    type: 'primary' | 'warning' | 'error' | 'success',
    message: string
): void => {
    proxy?.$message?.({ type, message })
}

const fetchRows = async (): Promise<{ list: CommentRow[]; total: number }> => {
    if (props.targetType === 'diary') {
        const result = await getDiaryComments(props.targetId, 1, 50)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '评论加载失败')
        }
        return { list: result.data.list as DiaryComment[], total: result.data.total }
    }

    const result = await getComments({ articleId: props.targetId, page: 1, pageSize: 50 })
    if (result.code !== 200 || !result.data) {
        throw new Error(result.message || '评论加载失败')
    }
    return { list: result.data.list as CommentItem[], total: result.data.total }
}

const loadComments = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await fetchRows()
        comments.value = result.list
        commentTotal.value = Math.max(result.total, result.list.length)
        emit('comments-change', commentTotal.value)
    } catch (error) {
        comments.value = []
        errorMessage.value = getRequestErrorMessage(error, '评论加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

const createRow = async (content: string, parentId?: number) => {
    if (props.targetType === 'diary') {
        return createDiaryComment(props.targetId, content, parentId)
    }
    return createComment({
        articleId: props.targetId,
        content,
        ...(parentId ? { parentId } : {}),
    })
}

const submitComment = async (): Promise<void> => {
    const content = commentDraft.value.trim()
    if (!content || commentSubmitting.value || !canInteract.value) return

    commentError.value = ''
    commentSubmitting.value = true
    try {
        const result = await createRow(content)
        if (result.code !== 200) {
            throw new Error(result.message || '评论失败')
        }
        commentDraft.value = ''
        await loadComments()
        showMessage('success', '评论已发表')
        emit('changed', commentTotal.value)
    } catch (error) {
        commentError.value = getRequestErrorMessage(error, '评论失败，请稍后重试')
    } finally {
        commentSubmitting.value = false
    }
}

const startReply = (comment: CommentRow): void => {
    if (!canInteract.value) {
        showMessage('warning', '当前账号没有回复评论的权限')
        return
    }
    const rootId = Number(comment.parentId || comment.id)
    activeCommentMenu.value = null
    deleteConfirmId.value = null
    replyTarget.value = {
        commentId: Number(comment.id),
        rootId,
        targetUserName: comment.userName || '该用户',
    }
    replyDraft.value = ''
    replyError.value = ''
    expandThread(rootId)
}

const startReplyById = (id: number): void => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (target) startReply(target)
}

const cancelReply = (): void => {
    replyTarget.value = null
    replyDraft.value = ''
    replyError.value = ''
}

const submitReply = async (): Promise<void> => {
    const target = replyTarget.value
    const content = replyDraft.value.trim()
    if (!target || !content || replySubmitting.value || !canInteract.value) return

    replyError.value = ''
    replySubmitting.value = true
    try {
        const result = await createRow(content, target.commentId)
        if (result.code !== 200) {
            throw new Error(result.message || '回复失败')
        }
        replyDraft.value = ''
        replyTarget.value = null
        await loadComments()
        expandThread(target.rootId)
        showMessage('success', '回复已发表')
        emit('changed', commentTotal.value)
    } catch (error) {
        replyError.value = getRequestErrorMessage(error, '回复失败，请稍后重试')
    } finally {
        replySubmitting.value = false
    }
}

const handleCommentLike = async (comment: CommentRow): Promise<void> => {
    if (!canLike.value) {
        showMessage('warning', '当前账号没有点赞评论的权限')
        return
    }
    if (isCommentLikeBusy(comment.id)) return

    setCommentLikeBusy(comment.id, true)
    try {
        const result = await toggleCommentLike({
            commentType: props.targetType,
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

const handleReplyLike = (id: number): void => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (target) void handleCommentLike(target)
}

const reportCommentItem = (comment: CommentRow): void => {
    activeCommentMenu.value = null
    deleteConfirmId.value = null
    if (!canReport.value) {
        showMessage('warning', '当前账号没有举报评论的权限')
        return
    }

    reportTarget.value = comment
    reportDialogVisible.value = true
}

const updateReportDialog = (open: boolean): void => {
    if (!open && reportSubmitting.value) return
    reportDialogVisible.value = open
    if (!open) reportTarget.value = null
}

const submitReport = async (payload: {
    reason: CommentReportReason
    detail: string
}): Promise<void> => {
    const target = reportTarget.value
    if (!target || reportSubmitting.value) return

    reportSubmitting.value = true
    try {
        const result = await reportComment({
            commentType: props.targetType,
            commentId: target.id,
            reason: payload.reason,
            ...(payload.detail ? { detail: payload.detail } : {}),
        })
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '举报评论失败')
        }
        target.complaint = result.data.complaint
        reportDialogVisible.value = false
        reportTarget.value = null
        showMessage(
            result.data.already ? 'primary' : 'success',
            result.message || (result.data.already ? '你已举报过该评论' : '举报成功，感谢反馈')
        )
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '举报评论失败，请稍后重试'))
    } finally {
        reportSubmitting.value = false
    }
}

const reportCommentById = (id: number): void => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (target) void reportCommentItem(target)
}

const requestDeleteComment = (id: number): void => {
    if (deleteConfirmId.value !== id) {
        deleteConfirmId.value = id
        return
    }
    void removeComment(id)
}

const removeComment = async (id: number): Promise<void> => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (!target || !canDeleteComment(target)) {
        showMessage('warning', '只能删除自己的评论')
        return
    }

    activeCommentMenu.value = null
    deleteConfirmId.value = null
    try {
        const result = props.targetType === 'diary'
            ? await deleteInteractionComment({ commentType: 'diary', commentId: id })
            : await deleteComment(id)
        if (result.code !== 200) {
            throw new Error(result.message || '删除失败')
        }
        await loadComments()
        showMessage('success', result.message || '评论已删除')
        emit('changed', commentTotal.value)
    } catch (error) {
        showMessage('error', getRequestErrorMessage(error, '删除评论失败，请稍后重试'))
    }
}

const resetState = (): void => {
    comments.value = []
    commentTotal.value = props.initialTotal
    expandedThreads.value = new Set()
    activeCommentMenu.value = null
    commentLikeBusyIds.value = new Set()
    deleteConfirmId.value = null
    reportTarget.value = null
    reportDialogVisible.value = false
    reportSubmitting.value = false
    commentDraft.value = ''
    commentSubmitting.value = false
    commentError.value = ''
    replyTarget.value = null
    replyDraft.value = ''
    replySubmitting.value = false
    replyError.value = ''
}

watch(() => [props.targetType, props.targetId] as const, () => {
    resetState()
    currentUser.value = readCurrentUser()
    void loadComments()
}, { immediate: true })
</script>

<style lang="less" scoped>
.admin-comment-section {
    padding-top: @space-l;
    border-top: 1px solid var(--admin-line, var(--gray1));
}

.admin-comment-head {
    display: flex;
    flex-wrap: wrap;
    gap: @space-s;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: @space-l;
}

.admin-comment-title {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    margin: 0;
    color: var(--admin-ink, @font-color-l);
    font-size: 17px;
    font-weight: 600;
}

.admin-comment-count {
    min-width: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--admin-accent-soft, var(--pcolor1));
    color: var(--admin-accent, @pcolor);
    font-size: 12px;
    font-weight: 600;
    line-height: 20px;
    text-align: center;
}

.admin-comment-hint,
.admin-comment-readonly {
    color: var(--admin-muted, @font-color-s);
    font-size: @size-ss;
}

.admin-comment-readonly {
    margin: 0 0 @space-l;
    padding: @space-s @space-m;
    border: 1px dashed var(--admin-line, var(--gray2));
    border-radius: 10px;
}

.admin-comment-composer {
    display: flex;
    gap: @space-m;
    align-items: flex-start;
    margin-bottom: @space-l;
}

.admin-comment-avatar {
    flex: none;
}

.admin-comment-composer-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
}

.admin-comment-composer-footer,
.admin-reply-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: @space-s;
    color: var(--admin-muted, @font-color-s);
    font-size: @size-ss;
}

.admin-comment-error {
    margin: 8px 0 0;
    color: @ecolor;
    font-size: @size-ss;
}

.admin-comment-state {
    display: flex;
    min-height: 180px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: @space-m;
}

.admin-comment-list {
    display: flex;
    flex-direction: column;

    :deep(.cc-thread) {
        padding: @space-l 0;
    }
}

.admin-reply-composer {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-top: @space-m;
    padding: @space-m;
    border: 1px solid var(--admin-line, var(--gray1));
    border-radius: 12px;
    background: var(--admin-surface-soft, var(--bgColor2));

    &.is-nested {
        margin-top: 10px;
    }
}

.admin-reply-title {
    color: var(--admin-muted, @font-color-s);
    font-size: 12.5px;

    strong {
        color: var(--admin-ink, @font-color-l);
        font-weight: 600;
    }
}

@media (max-width: 640px) {
    .admin-comment-composer {
        gap: @space-s;
    }

    .admin-comment-composer-footer,
    .admin-reply-footer {
        align-items: flex-start;
        flex-direction: column;
    }
}
</style>
