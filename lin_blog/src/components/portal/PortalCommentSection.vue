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
                                    <button type="button" :disabled="!canDeleteComment(thread.root)"
                                        :class="{ 'is-danger': deleteConfirmId === thread.root.id }"
                                        @click="requestDeleteComment(thread.root.id)">
                                        <IconDeleteOutline />
                                        {{ deleteConfirmId === thread.root.id ? '确认删除' : '删除' }}
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
                                                <button type="button" :disabled="!canDeleteComment(reply)"
                                                    :class="{ 'is-danger': deleteConfirmId === reply.id }"
                                                    @click="requestDeleteComment(reply.id)">
                                                    <IconDeleteOutline />
                                                    {{ deleteConfirmId === reply.id ? '确认删除' : '删除' }}
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
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch } from 'vue'
import {
    createDiaryComment,
    createPublicComment,
    getDiaryComments,
    getPublicComments,
    type DiaryComment,
    type PortalComment
} from '../../api/portal'
import {
    getRequestErrorMessage,
    reportComment,
    toggleCommentLike,
    deleteInteractionComment
} from '../../api/comment'

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

// 当前登录用户：用于判断某条评论是否可删（本人或管理员）
const readCurrentUser = (): { id: number; role: string } | null => {
    try {
        const saved = localStorage.getItem('userInfo')
        if (!saved) return null
        const user = JSON.parse(saved) as { id?: number; user_type?: string }
        if (!user.id) return null
        return { id: Number(user.id), role: user.user_type || '' }
    } catch {
        return null
    }
}

const currentUser = ref(readCurrentUser())

const canDeleteComment = (comment: CommentRow): boolean => {
    const user = currentUser.value
    if (!user) return false
    if (user.role === 'admin') return true
    return Number(comment.userId) === Number(user.id)
}

const canInteract = ref(readCanInteract())

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

const formatDateTime = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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

const handleReport = async (comment: CommentRow) => {
    activeCommentMenu.value = null
    deleteConfirmId.value = null
    if (!canInteract.value) {
        proxy?.$message?.({ type: 'primary', message: '登录后可举报评论' })
        return
    }

    try {
        const result = await reportComment({
            commentType: props.targetType,
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
    resetComposer()

    if (!targetId) {
        comments.value = []
        commentTotal.value = 0
        return
    }

    canInteract.value = readCanInteract()
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
</style>
