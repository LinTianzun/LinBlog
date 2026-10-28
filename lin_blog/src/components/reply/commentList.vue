<template>
    <div class="comment-list">
        <div v-if="loading" class="comment-list-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载评论...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="comment-list-state">
            <yk-empty description="评论加载失败">
                <yk-text type="secondary">{{ errorMessage }}</yk-text>
                <yk-button type="secondary" @click="fetchComments">重新加载</yk-button>
            </yk-empty>
        </div>

        <yk-empty v-else-if="!threads.length" description="还没有评论" />

        <yk-scrollbar v-else class="comment-list-scroll" :style="{ maxHeight: `${maxHeight}px` }">
            <div class="comment-list-body">
                <div v-for="thread in threads" :key="thread.root.id" class="comment-thread">
                    <reply :content="toReplyData(thread.root)" is-comment @delete="removeComment"
                        @click="handleClick" />

                    <div v-if="thread.replies.length" class="reply-group">
                        <button type="button" class="reply-toggle"
                            @click="toggleReplies(thread.root.id)">
                            <template v-if="isExpanded(thread.root.id)">
                                <IconUpOutline />收起 {{ thread.replies.length }} 条回复
                            </template>
                            <template v-else>
                                <IconDownOutline />展开 {{ thread.replies.length }} 条回复
                            </template>
                        </button>

                        <div v-if="isExpanded(thread.root.id)" class="reply-items">
                            <reply v-for="item in thread.replies" :key="item.id"
                                :content="toReplyData(item)" is-comment @delete="removeComment"
                                @click="handleClick" />
                        </div>
                    </div>
                </div>
            </div>
        </yk-scrollbar>

        <div class="comment-list-pagination">
            <AdminPager v-model:page="page" :page-size="pageSize" :total="count" size="s"
                :show-total="true" :disabled="loading" @change="handlePagerChange" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch, type ComponentPublicInstance } from 'vue'
import reply from './reply.vue'
import type { ReplyDat } from '../../utils/interface'
import { deleteComment, getComments, getRequestErrorMessage } from '../../api/comment.ts'
import AdminPager from '../common/AdminPager.vue'

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type MessageProxy = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

type AdminComment = {
    id: number
    userId: number
    userName: string | null
    userAvatar: string | null
    article: { id: number | null; title: string }
    parentId: number
    replyToCommentId?: number | null
    replyToUserName?: string | null
    content: string
    likes: number
    liked: boolean
    complaint: number
    createdAt: string
}

type CommentThread = {
    root: AdminComment
    replies: AdminComment[]
}

const props = withDefaults(defineProps<{
    articleId: number
    pageSize?: number
    maxHeight?: number
}>(), {
    pageSize: 20,
    maxHeight: 320,
})

const emits = defineEmits<{
    (event: 'changed'): void
}>()

const proxy = getCurrentInstance()?.proxy as MessageProxy | null | undefined

const count = ref(0)
const page = ref(1)
const loading = ref(false)
const errorMessage = ref('')
const comments = ref<AdminComment[]>([])
// 二级回复默认收起，避免长列表一眼铺满
const expandedThreads = ref<Set<number>>(new Set())

const threads = computed<CommentThread[]>(() => {
    const roots = comments.value.filter(item => !item.parentId)
    const replies = comments.value.filter(item => item.parentId)

    return roots
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(root => ({
            root,
            replies: replies
                .filter(item => Number(item.parentId) === Number(root.id))
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        }))
})

const formatMoment = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 复用 reply.vue 的展示结构；二级回复带上「回复 @某人」
const toReplyData = (item: AdminComment): ReplyDat => ({
    id: item.id,
    user: {
        id: '',
        name: item.userName || '未知用户',
        imgurl: item.userAvatar || '',
    },
    article: {
        id: item.article.id ?? 0,
        title: item.article.title,
    },
    comment: item.parentId && item.replyToUserName
        ? `回复 @${item.replyToUserName}：${item.content}`
        : item.content,
    moment: formatMoment(item.createdAt),
    complaint: item.complaint,
    parentId: item.parentId,
})

const isExpanded = (commentId: number) => expandedThreads.value.has(commentId)

const toggleReplies = (commentId: number) => {
    const next = new Set(expandedThreads.value)
    if (next.has(commentId)) next.delete(commentId)
    else next.add(commentId)
    expandedThreads.value = next
}

const fetchComments = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getComments({
            page: page.value,
            pageSize: props.pageSize,
            articleId: props.articleId,
        })

        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '评论加载失败')
        }

        comments.value = result.data.list as AdminComment[]
        count.value = result.data.total

        if (comments.value.length === 0 && page.value > 1) {
            page.value = 1
            await fetchComments()
        }
    } catch (error) {
        comments.value = []
        count.value = 0
        errorMessage.value = getRequestErrorMessage(error, '评论加载失败，请稍后重试')
    } finally {
        loading.value = false
    }
}

// 分页：页码已由 v-model 同步，这里只按最新页码拉数据
const handlePagerChange = (): void => {
    void fetchComments()
}

const removeComment = async (id: string | number): Promise<void> => {
    try {
        const result = await deleteComment(Number(id))
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        proxy?.$message?.({ type: 'primary', message: '删除成功' })

        if (comments.value.length === 1 && page.value > 1) {
            page.value -= 1
        }

        await fetchComments()
        emits('changed')
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '删除失败，请稍后重试') })
    }
}

const handleClick = (): void => {
    // 后台详情的评论条只做展示，点击不跳转
}

watch(() => props.articleId, () => {
    page.value = 1
    expandedThreads.value = new Set()
    void fetchComments()
}, { immediate: true })
</script>

<style lang="less" scoped>
.comment-list {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-direction: column;
    gap: @space-m;

    &-state {
        display: flex;
        min-height: 180px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    &-scroll {
        width: 100%;
    }

    &-body {
        display: flex;
        width: 100%;
        flex-direction: column;
        gap: @space-l;
        padding-right: @space-s;
    }

    &-pagination {
        display: flex;
        justify-content: flex-end;
    }
}

.comment-thread {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: @space-s;

    :deep(.reply) {
        align-items: flex-start;
    }

    :deep(.reply-main) {
        padding-bottom: 0;
        border-bottom: none;
    }
}

.reply-group {
    display: flex;
    flex-direction: column;
    gap: @space-s;
    padding-left: 40px;
}

.reply-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--pcolor);
    font-size: 12px;
    cursor: pointer;
}

.reply-items {
    display: flex;
    flex-direction: column;
    gap: @space-m;
    padding-left: @space-m;
    border-left: 2px solid var(--admin-line, var(--gray1));
}

@media (max-width: 640px) {
    .reply-group {
        padding-left: @space-m;
    }
}
</style>
