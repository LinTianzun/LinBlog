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

        <yk-scrollbar v-else ref="scrollbar" class="comment-scroll">
            <yk-space dir="vertical">
                <reply v-for="item in comments" :key="item.id" :content="item" is-comment
                    :class="{ 'comment-item-locked': !canOpenTarget(item) }" @delete="removeComment"
                    @click="canOpenTarget(item) ? openTarget(item.id) : noop" />
            </yk-space>
        </yk-scrollbar>

        <div class="comment-pagination">
            <AdminPager v-model:page="page" :page-size="pageSize" :total="count" :show-total="true"
                :disabled="loading" @change="handlePagerChange" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, getCurrentInstance, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import reply from './reply.vue'
import type { ReplyDat } from '../../utils/interface'
import AdminPager from '../common/AdminPager.vue'
import { useSessionStore } from '../../store/session.ts'
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

const router = useRouter()
const session = useSessionStore()

// 跳转目标是否可见由内容查看权限决定：能看到全站图库/文章才允许跳转，
// 否则后台列表只含本人内容，点过去会落到空页面
const canOpenTarget = (item: ReplyDat): boolean =>
    item.article?.classify === 'image'
        ? session.can('gallery.viewAll')
        : session.can('article.viewAll')

const props = withDefaults(defineProps<CommentProps>(), {
    pageSize: 8,
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
    article: { id: number | null; title: string; classify?: 'article' | 'image' | null }
    parentId: number
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
        classify: item.article.classify ?? null,
    },
    comment: item.content,
    moment: formatMoment(item.createdAt),
    complaint: item.complaint,
    parentId: item.parentId,
})

const formatMoment = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 分页：页码已由 v-model 同步，这里只按最新页码拉数据
const handlePagerChange = (): void => {
    void fetchComments()
}

// 点评论跳到对应作品：图库进后台图库页，文章进文章页并直接打开详情
const openTarget = (id: string | number): void => {
    const target = comments.value.find(item => Number(item.id) === Number(id))
    if (!target || !canOpenTarget(target)) return
    const articleId = target?.article?.id
    if (!articleId) {
        proxy?.$message?.({ type: 'primary', message: '该评论所属作品已删除' })
        return
    }

    const isGallery = target?.article?.classify === 'image'
    void router.push(
        isGallery
            ? { path: '/gallery', query: { open: String(articleId) } }
            : { path: '/article', query: { open: String(articleId) } }
    )
}

// 无跳转权限时占位：评论项不再响应点击
const noop = (): void => {}

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
    display: flex;
    min-width: 0;
    // 总览页是两栏等高网格：这里不能写死高度，
    // 否则评论卡会比「访问量 + 数据监测」两卡更高
    height: 100%;
    box-sizing: border-box;
    flex-direction: column;
    padding: @space-xl 0 0;

    .card-title-name {
        padding: 0;
    }

    .card-title {
        padding: 0 @space-xl 18px;
    }

    &-scroll {
        min-height: 0;
        flex: 1;
        padding: 0 @space-xl;
        border-top: 1px solid var(--admin-line, var(--gray1));
        border-bottom: 1px solid var(--admin-line, var(--gray1));
    }

    &-state {
        min-height: 240px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: @space-m;
    }

    // 普通用户不跳转：去掉指针态，避免看起来仍可点击
    :deep(.comment-item-locked) {
        cursor: default;
    }

    &-pagination {
        display: flex;
        flex: none;
        padding: @space-l @space-xl;
        align-items: center;
        justify-content: flex-end;
    }

    @media (max-width: 640px) {
        // 单栏布局时没有等高参照，给一个最小高度避免内容塌缩
        height: auto;
        min-height: 420px;

        .card-title,
        &-scroll {
            padding-right: @space-l;
            padding-left: @space-l;
        }
    }
}
</style>
