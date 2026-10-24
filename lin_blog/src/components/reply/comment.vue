<template>
    <div class="card comment">
        <div class="card-title">
            <p class="card-title-name">评论 {{ count }}</p>
        </div>

        <div v-if="loading" class="comment-state">
            <yk-spinner size="m" />
            <yk-text type="secondary">正在加载评论...</yk-text>
        </div>

        <div v-else-if="errorMessage" class="comment-state">
            <yk-empty description="评论加载失败">
                <yk-text type="secondary">{{ errorMessage }}</yk-text>
                <yk-button type="secondary" @click="fetchComments">重新加载</yk-button>
            </yk-empty>
        </div>

        <yk-empty v-else-if="comments.length === 0" description="暂无评论" />

        <yk-scrollbar v-else ref="scrollbar"
            style="padding: 0 24px; height: calc(100vh * 0.55); border-bottom: 1px solid rgba(30,32,37,0.08);">
            <yk-space dir="vertical">
                <reply v-for="item in comments" :key="item.id" :content="item" is-comment
                    @delete="removeComment" />
            </yk-space>
        </yk-scrollbar>

        <div v-if="count > pageSize" class="comment-pagination">
            <yk-pagination :current="page" :page-size="pageSize" @change="changePage" :total="count" size="m" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, getCurrentInstance, type ComponentPublicInstance } from 'vue'
import reply from './reply.vue'
import type { ReplyDat } from '../../utils/interface'
import {
    deleteComment,
    getRequestErrorMessage,
    getComments,
} from '../../api/comment.ts'
import type { CommentProps } from './reply.ts'

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type CommentCardInstance = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
}

const proxy = getCurrentInstance()?.proxy as CommentCardInstance | null | undefined

const props = withDefaults(defineProps<CommentProps>(), {
    pageSize: 8,
    height: "calc(100vh * 0.67)",
})

//  评论总数
const count = ref(0)
const page = ref(1)
const loading = ref(false)
const errorMessage = ref('')

//  数据内容
const comments = ref<ReplyDat[]>([])

//  获取数据
const fetchComments = async (): Promise<void> => {
    loading.value = true
    errorMessage.value = ''

    try {
        const result = await getComments({
            page: page.value,
            pageSize: props.pageSize,
        })

        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || '评论加载失败')
        }

        comments.value = result.data.list.map(formatComment)
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

//  适配 reply.vue 的展示结构
const formatComment = (item: {
    id: number
    userName: string | null
    userAvatar: string | null
    article: { id: number | null; title: string }
    content: string
    complaint: number
    createdAt: string
}): ReplyDat => ({
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
    comment: item.content,
    moment: formatMoment(item.createdAt),
    complaint: item.complaint,
})

const formatMoment = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 分页
const changePage = (nextPage: number) => {
    if (nextPage === page.value) return
    page.value = nextPage
    void fetchComments()
}

// 删除评论
const removeComment = async (id: string | number) => {
    try {
        const result = await deleteComment(Number(id))
        if (result.code !== 200) throw new Error(result.message || '删除失败')

        proxy?.$message?.({ type: 'primary', message: '删除成功' })

        if (comments.value.length === 1 && page.value > 1) {
            page.value -= 1
        }

        await fetchComments()
    } catch (error) {
        proxy?.$message?.({ type: 'error', message: getRequestErrorMessage(error, '删除失败，请稍后重试') })
    }
}

onMounted(() => {
    void fetchComments()
})
</script>

<style lang="less" scoped>
.comment {
    position: relative;
    padding: @space-xl 0 64px;
    height: calc(100vh * 0.67);

    .card-title-name {
        padding: 0 @space-xl;
    }

    &-state {
        height: calc(100vh * 0.55);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    &-pagination {
        display: flex;
        position: absolute;
        width: 100%;
        left: 0;
        bottom: 0;
        padding: @space-l @space-xl;
        align-items: center;
        justify-content: flex-end;
    }
}
</style>
