<template>
    <div class="diary-comment-list">
        <div v-if="loading" class="diary-comment-list-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载评论...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="diary-comment-list-state">
            <yk-empty description="评论加载失败">
                <yk-text type="secondary">{{ errorMessage }}</yk-text>
                <yk-button type="secondary" @click="fetchComments">重新加载</yk-button>
            </yk-empty>
        </div>

        <yk-empty v-else-if="!threads.length" description="还没有评论" />

        <yk-scrollbar v-else class="diary-comment-list-scroll"
            :style="{ maxHeight: `${maxHeight}px` }">
            <div class="diary-comment-list-body">
                <div v-for="thread in threads" :key="thread.root.id" class="comment-thread">
                    <reply :content="toReplyData(thread.root)" is-comment @delete="removeComment" />

                    <div v-if="thread.replies.length" class="reply-group">
                        <button type="button" class="reply-toggle" @click="toggleReplies(thread.root.id)">
                            <template v-if="isExpanded(thread.root.id)">
                                <IconUpOutline />收起 {{ thread.replies.length }} 条回复
                            </template>
                            <template v-else>
                                <IconDownOutline />展开 {{ thread.replies.length }} 条回复
                            </template>
                        </button>

                        <div v-if="isExpanded(thread.root.id)" class="reply-items">
                            <reply v-for="item in thread.replies" :key="item.id"
                                :content="toReplyData(item)" is-comment @delete="removeComment" />
                        </div>
                    </div>
                </div>
            </div>
        </yk-scrollbar>

        <div class="diary-comment-list-pagination">
            <AdminPager v-model:page="page" :page-size="pageSize" :total="count" size="s"
                :show-total="true" :disabled="loading" @change="handlePagerChange" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, ref, watch, type ComponentPublicInstance } from 'vue'
import reply from '../reply/reply.vue'
import type { ReplyDat } from '../../utils/interface'
import type { DiaryComment } from '../../api/portal.ts'
import { getDiaryComments } from '../../api/portal.ts'
import { deleteInteractionComment, getRequestErrorMessage } from '../../api/comment.ts'
import AdminPager from '../common/AdminPager.vue'

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type MessageProxy = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

type DiaryThread = {
    root: DiaryComment
    replies: DiaryComment[]
}

const props = withDefaults(defineProps<{
    diaryId: number
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
const comments = ref<DiaryComment[]>([])
const expandedThreads = ref<Set<number>>(new Set())

const threads = computed<DiaryThread[]>(() => {
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

const toReplyData = (item: DiaryComment): ReplyDat => ({
    id: item.id,
    user: {
        id: '',
        name: item.userName || '未知用户',
        imgurl: item.userAvatar || '',
    },
    article: { id: 0, title: '' },
    comment: item.parentId && item.replyToUserName
        ? `回复 @${item.replyToUserName}：${item.content}`
        : item.content,
    moment: formatMoment(item.createdAt),
    complaint: item.complaint,
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
        const result = await getDiaryComments(props.diaryId, page.value, props.pageSize)
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '评论加载失败')
        }

        comments.value = result.data.list
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

// 后台删随笔评论走 /public/comment/delete（commentType=diary），管理员可删任意评论
const removeComment = async (id: string | number): Promise<void> => {
    try {
        const result = await deleteInteractionComment({
            commentType: 'diary',
            commentId: Number(id),
        })
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

watch(() => props.diaryId, () => {
    page.value = 1
    expandedThreads.value = new Set()
    void fetchComments()
}, { immediate: true })
</script>

<style lang="less" scoped>
.diary-comment-list {
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

    :deep(.reply-main) {
        padding-bottom: 0;
        border-bottom: none;
    }

    // 随笔评论没有所属文章，隐藏空标签
    :deep(.tag) {
        display: none;
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
