<!--
    后台文章 / 图库评论列表：只负责把文章评论接口接到共用列表上。
    展示排版与随笔评论完全一致，差异（数据源与删除接口）以参数注入。
-->
<template>
    <ContentCommentList :fetcher="fetcher" :remover="remover" :target-id="articleId"
        :page-size="pageSize" :max-height="maxHeight" @changed="onChanged" />
</template>

<script lang="ts" setup>
import { getCurrentInstance, type ComponentPublicInstance } from 'vue'
import ContentCommentList from '../content/ContentCommentList.vue'
import type { ContentComment } from '../content/comment.ts'
import { deleteComment, getComments } from '../../api/comment.ts'

type AdminComment = ContentComment & {
    article: { id: number | null; title: string }
    replyToCommentId?: number | null
}

type MessageOptions = {
    type: 'primary' | 'error'
    message: string
}

type MessageProxy = ComponentPublicInstance & {
    $message?: (options: MessageOptions) => void
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

const fetcher = async (params: { page: number; pageSize: number }) => {
    const result = await getComments({
        page: params.page,
        pageSize: params.pageSize,
        articleId: props.articleId,
    })
    if (result.code !== 200 || !result.data) {
        throw new Error(result.message || '评论加载失败')
    }
    return { list: result.data.list as AdminComment[], total: result.data.total }
}

// 文章评论走 /comment/:id，删除一级评论会级联删除其下回复
const remover = async (id: number) => {
    const result = await deleteComment(Number(id))
    if (result.code !== 200) throw new Error(result.message || '删除失败')
    proxy?.$message?.({ type: 'primary', message: '删除成功' })
}

const onChanged = (): void => {
    emits('changed')
}
</script>
