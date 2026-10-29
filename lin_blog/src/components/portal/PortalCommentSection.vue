<template>
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
                <yk-button v-else type="primary" size="s" @click="emit('need-login')">
                    登录后评论
                </yk-button>
            </div>
            <p v-if="commentError" class="compose-error">{{ commentError }}</p>
        </div>

        <div v-if="!threads.length" class="empty-comments">还没有评论，来抢沙发吧。</div>

        <div v-else class="comment-list">
            <ContentCommentThread v-for="thread in threads" :key="thread.root.id" :root="thread.root"
                :replies="thread.replies" :expanded="isExpanded(thread.root.id)"
                :can-like="true" :can-reply="true" :can-report="canReport" :can-delete="true"
                :current-user-id="currentUser?.id"
                :can-confirm-delete="canDeleteComment(thread.root)"
                :delete-confirming="deleteConfirmId === thread.root.id"
                :delete-confirming-reply-id="deleteConfirmId"
                :can-delete-reply="canDeleteReplyInThread"
                :is-reply-like-busy="isCommentLikeBusy" :like-busy="isCommentLikeBusy(thread.root.id)"
                :like-title="canInteract ? '点赞 / 取消点赞' : '登录后可点赞'"
                :menu-open="activeCommentMenu === thread.root.id"
                :reply-menu-open="activeCommentMenu" @toggle="toggleReplies(thread.root.id)"
                @reply="startReply(thread.root, thread.root)" @like="handleCommentLike(thread.root)"
                @like-reply="handleReplyLike" @report="handleReport(thread.root)"
                @report-reply="handleReportById" @delete="requestDeleteComment(thread.root.id)"
                @delete-reply="requestDeleteComment"
                @update:menu-open="setCommentMenu(thread.root.id, $event)"
                @update:reply-menu-open="setReplyMenu($event)">
                <template #composer>
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
                </template>

                <template #reply-composer="{ reply }">
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
                </template>
            </ContentCommentThread>
        </div>

        <CommentReportDialog :open="reportDialogVisible" :submitting="reportSubmitting"
            :comment-content="reportTarget?.content || ''"
            @update:open="updateReportDialog" @submit="submitReport" />
    </div>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import ContentCommentThread from '../content/ContentCommentThread.vue'
import CommentReportDialog from '../content/CommentReportDialog.vue'
import {
    createDiaryComment,
    createPublicComment,
    getDiaryComments,
    getPublicComments,
    type DiaryComment,
    type PortalComment
} from '../../api/portal'
import { buildCommentThreads } from '../content/comment.ts'
import {
    getRequestErrorMessage,
    reportComment,
    toggleCommentLike,
    deleteInteractionComment,
    type CommentReportReason,
} from '../../api/comment'
import { useSessionStore } from '../../store/session.ts'

type CommentRow = PortalComment | DiaryComment

type ReplyTarget = {
    commentId: number
    rootId: number
    targetUserName: string
}

type CommentThread = {
    root: CommentRow
    replies: CommentRow[]
}

const props = defineProps<{
    // article：文章/图库（共用文章评论表）；diary：随笔（独立评论表）
    targetType: 'article' | 'diary'
    targetId: number | null
}>()

const emit = defineEmits<{
    // 评论发表成功后回传最新总数，弹窗用它维护列表卡片计数
    (e: 'comments-change', total: number): void
    (e: 'need-login'): void
}>()

const comments = ref<CommentRow[]>([])
const commentTotal = ref(0)
// 二级评论默认收起，按一级评论 ID 记录展开状态
const expandedThreads = ref<Set<number>>(new Set())
const activeCommentMenu = ref<number | null>(null)
const commentLikeBusyIds = ref<Set<number>>(new Set())
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
// 删除需二次确认：首次点击标记待确认，再点一次才真正删除
const deleteConfirmId = ref<number | null>(null)

const proxy = getCurrentInstance()?.proxy
const session = useSessionStore()

// 互动能力按 comment.create 权限判定，游客角色默认没有该权限
const canInteract = computed(
    () => Boolean(localStorage.getItem('token')) && session.can('comment.create')
)
// 游客保留举报入口以便提示登录；已登录但无权限时直接隐藏。
const canReport = computed(
    () => !localStorage.getItem('token') || session.can('comment.report')
)

// 当前登录用户：仅用于判断某条评论是否属于本人（能否删除交给权限矩阵）
const readCurrentUser = (): { id: number } | null => {
    try {
        const saved = localStorage.getItem('userInfo')
        if (!saved) return null
        const user = JSON.parse(saved) as { id?: number }
        if (!user.id) return null
        return { id: Number(user.id) }
    } catch {
        return null
    }
}

const currentUser = ref(readCurrentUser())

const canDeleteComment = (comment: CommentRow): boolean => {
    if (session.can('comment.moderate')) return true
    if (!session.can('comment.manageOwn')) return false
    return Number(comment.userId) === Number(currentUser.value?.id)
}

// 一级评论按时间倒序，二级回复按时间正序挂在所属评论下
const threads = computed<CommentThread[]>(() => {
    return buildCommentThreads(comments.value)
})

const isExpanded = (commentId: number) => expandedThreads.value.has(commentId)

const toggleReplies = (commentId: number) => {
    // 直接改 Set 不会触发更新，这里复制一份再赋值
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
        return
    }
    if (activeCommentMenu.value === commentId) {
        activeCommentMenu.value = null
    }
}

// 二级回复的菜单与一级共用同一个 open id 空间，这里单独处理开关
const setReplyMenu = (payload: { id: number; open: boolean }): void => {
    setCommentMenu(payload.id, payload.open)
}

// 菜单里的删除按钮对每条评论单独判定，未授权时置灰而不是隐藏
const canDeleteReplyInThread = (id: number): boolean => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    return target ? canDeleteComment(target) : false
}

const handleReplyLike = (id: number): void => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (target) void handleCommentLike(target)
}

const handleReportById = (id: number): void => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (target) void handleReport(target)
}

const resetComposer = () => {
    commentDraft.value = ''
    commentError.value = ''
    commentSubmitting.value = false
    replyTarget.value = null
    replyDraft.value = ''
    replyError.value = ''
    replySubmitting.value = false
}

const loadComments = async (targetId: number) => {
    try {
        // 一页 50 条是接口上限，门户详情一次取满，避免二级回复被分页截断
        const result = props.targetType === 'diary'
            ? await getDiaryComments(targetId, 1, 50)
            : await getPublicComments(targetId, 1, 50)
        if (result.code === 200) {
            comments.value = (result.data?.list || []) as CommentRow[]
            commentTotal.value = result.data?.total || 0
        }
    } catch {
        // 评论区加载失败不打断正文展示
    }
}

const createComment = (content: string, parentId?: number) => {
    const targetId = props.targetId
    if (!targetId) return null
    if (props.targetType === 'diary') {
        return createDiaryComment(targetId, content, parentId)
    }
    return createPublicComment({ articleId: targetId, content, parentId })
}

const handleCommentLike = async (comment: CommentRow) => {
    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可点赞评论' })
        return
    }
    if (isCommentLikeBusy(comment.id)) return

    setCommentLikeBusy(comment.id, true)
    try {
        const result = await toggleCommentLike({
            commentType: props.targetType,
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

const handleReport = (comment: CommentRow) => {
    activeCommentMenu.value = null
    deleteConfirmId.value = null
    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可举报评论' })
        return
    }
    if (!canReport.value) {
        proxy?.$message?.({ type: 'warning', message: '当前账号没有举报评论的权限' })
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
        if (result.code === 200 && result.data) {
            target.complaint = result.data.complaint
            reportDialogVisible.value = false
            reportTarget.value = null
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
    } finally {
        reportSubmitting.value = false
    }
}

const startReply = (target: CommentRow, root: CommentRow) => {
    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可回复评论' })
        return
    }
    activeCommentMenu.value = null
    deleteConfirmId.value = null
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

// 首次点击标记待确认，再次点击才真正删除，避免误删
const requestDeleteComment = (commentId: number) => {
    if (deleteConfirmId.value !== commentId) {
        deleteConfirmId.value = commentId
        return
    }
    void removeComment(commentId)
}

const removeComment = async (commentId: number) => {
    const target = comments.value.find(item => Number(item.id) === Number(commentId))
    if (!target || !canDeleteComment(target)) {
        proxy?.$message?.({ type: 'primary', message: '只能删除自己的评论' })
        return
    }

    activeCommentMenu.value = null
    deleteConfirmId.value = null
    try {
        const result = await deleteInteractionComment({
            commentType: props.targetType,
            commentId
        })
        if (result.code !== 200) {
            throw new Error(result.message || '删除失败')
        }
        await reloadAfterChange()
        proxy?.$message?.({ type: 'success', message: '评论已删除' })
    } catch (error) {
        proxy?.$message?.({
            type: 'error',
            message: getRequestErrorMessage(error, '删除评论失败，请稍后重试')
        })
    }
}

const reloadAfterChange = async (rootId?: number) => {
    if (props.targetId) {
        await loadComments(props.targetId)
    }
    if (rootId !== undefined) {
        const next = new Set(expandedThreads.value)
        next.add(rootId)
        expandedThreads.value = next
    }
    emit('comments-change', commentTotal.value)
}

const submitReply = async () => {
    const target = replyTarget.value
    const content = replyDraft.value.trim()
    if (!props.targetId || !target || !content || replySubmitting.value) return

    if (!canInteract.value) {
        emit('need-login')
        return
    }

    replyError.value = ''
    replySubmitting.value = true
    try {
        // parentId 指向用户实际点击的评论；后端会归一化到根评论，
        // 数据库仍保持两级结构，并记录实际回复目标。
        const result = await createComment(content, target.commentId)
        if (result?.code === 200) {
            const rootId = target.rootId
            replyTarget.value = null
            replyDraft.value = ''
            await reloadAfterChange(rootId)
            proxy?.$message?.({ type: 'success', message: '回复已发表' })
        }
    } catch (error) {
        replyError.value = getRequestErrorMessage(error, '回复失败，请稍后重试')
    } finally {
        replySubmitting.value = false
    }
}

const submitComment = async () => {
    const content = commentDraft.value.trim()
    if (!props.targetId || !content || commentSubmitting.value) return

    if (!canInteract.value) {
        emit('need-login')
        return
    }

    commentError.value = ''
    commentSubmitting.value = true
    try {
        const result = await createComment(content)
        if (result?.code === 200) {
            commentDraft.value = ''
            await reloadAfterChange()
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

// 弹窗可能在关闭后保持挂载，targetId 变化时重载；为空则清空状态
watch(() => props.targetId, async (targetId, previousId) => {
    if (targetId === previousId) return

    expandedThreads.value = new Set()
    activeCommentMenu.value = null
    commentLikeBusyIds.value = new Set()
    deleteConfirmId.value = null
    reportTarget.value = null
    reportDialogVisible.value = false
    reportSubmitting.value = false
    resetComposer()

    if (!targetId) {
        comments.value = []
        commentTotal.value = 0
        return
    }

    currentUser.value = readCurrentUser()
    await loadComments(targetId)
}, { immediate: true })
</script>

<style lang="less" scoped>
.comment-section {
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

// 评论列表：排版由共享组件提供，门户侧只把颜色 token 换成自己的文字层级
.comment-list {
    display: flex;
    flex-direction: column;

    :deep(.cc-thread) {
        --cc-ink: var(--portal-text-primary);
        --cc-body: var(--portal-text-secondary);
        --cc-muted: var(--portal-text-tertiary);
        --cc-line: var(--portal-line-soft);
        --cc-accent: var(--portal-accent);
        --cc-accent-soft: var(--portal-accent-soft);
        --cc-soft: var(--portal-surface);
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
</style>
